import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type {
  OrchestratorState,
  WorkItem,
  WorkflowConfig,
  RunningEntry,
  WorkerResult,
  CompletedSession,
  NotificationEvent,
} from "../types.ts";
import { getWorkItemAssigneeName, getWorkItemProjectName } from "../types.ts";
import type { Config } from "../config/schema.ts";
import type { TrackerClient } from "@harmonica/sensor-core";
import type { AgentRunner } from "../types.ts";
import type { HarmonicaDB } from "../observability/db.ts";
import type { RepoManager } from "../integration/repo-manager.ts";
import { createState } from "./state.ts";
import {
  addRunning,
  removeRunning,
  recordCompletion,
  touchRunning,
  setSessionId,
  updateTurnCount,
  setPrUrl,
  scheduleRetry,
  registerWorkspace,
  unregisterWorkspace,
  appendOutput,
  drainOutput,
  setPending,
} from "./state.ts";
import { selectForDispatch, selectPending, checkEligibility } from "./dispatcher.ts";
import { createRetryEntry, popDueRetries } from "./retry.ts";
import { detectStalls, abortStalled } from "./reconciler.ts";
import { logger } from "../observability/logger.ts";
import type { WorkspaceManager } from "../execution/workspace.ts";
import { runHooks } from "../execution/hooks.ts";
import { runWorker } from "../execution/worker.ts";
import { createLinearMcpServerConfig } from "@harmonica/sensor-linear";

function getWorkItemExtra(item: WorkItem): Record<string, unknown> | undefined {
  if (item.kind !== "project") return undefined;
  return {
    status: item.status,
    health: item.health,
    leadName: item.leadName,
    memberCount: item.memberCount,
    milestones: item.milestones,
    startDate: item.startDate,
    targetDate: item.targetDate,
    progress: item.progress,
  };
}

export class Orchestrator {
  private state: OrchestratorState;
  private refreshSignal: (() => void) | null = null;
  private workflow: WorkflowConfig;
  private consecutivePollFailures = 0;
  private pendingResults = new Set<Promise<void>>();
  /** Tracks worktree metadata for items that used workspace.repo */
  private worktreeRegistry = new Map<
    string,
    { repoName: string; branchName: string; repoUrl: string; repoDefaultBranch: string }
  >();
  onNotify?: (event: NotificationEvent) => void;

  constructor(
    private config: Config,
    private tracker: TrackerClient,
    private runner: AgentRunner,
    private workspaceManager: WorkspaceManager,
    initialWorkflow: WorkflowConfig,
    initialState?: OrchestratorState,
    private db?: HarmonicaDB,
    private workflowId?: string,
    private repoManager?: RepoManager,
  ) {
    this.state = initialState ?? createState();
    this.workflow = initialWorkflow;
  }

  updateWorkflow(wf: WorkflowConfig): void {
    this.workflow = wf;
    logger.info("workflow updated");
  }

  updateConfig(config: Config, tracker: TrackerClient): void {
    this.config = config;
    this.tracker = tracker;
    logger.info("config updated");
  }

  triggerRefresh(): void {
    this.refreshSignal?.();
  }

  abortWorker(itemId: string): boolean {
    const entry = this.state.running.get(itemId);
    if (!entry) return false;
    entry.abortController.abort();
    return true;
  }

  getState(): OrchestratorState {
    return this.state;
  }

  async start(): Promise<() => Promise<void>> {
    logger.info("orchestrator starting");

    let running = true;
    const loopPromise = (async () => {
      while (running && !this.state.isShuttingDown) {
        await this.tick();
        await this.sleep(this.config.poll_interval_s * 1000);
      }
    })();

    const shutdown = async () => {
      logger.info("orchestrator shutting down");
      running = false;
      this.state.isShuttingDown = true;
      this.refreshSignal?.();

      for (const [itemId, entry] of this.state.running) {
        logger.info("aborting worker", { item_id: itemId });
        entry.abortController.abort();
      }

      const promises = Array.from(this.state.running.values()).map((e) => e.promise.catch(() => {}));
      await Promise.all(promises);
      await Promise.all(this.pendingResults);
      await loopPromise.catch(() => {});
      logger.info("orchestrator stopped");
    };

    return shutdown;
  }

  /** Build repo context fields for hook and worker prompt from worktree registry. */
  private buildRepoContext(itemId: string) {
    const meta = this.worktreeRegistry.get(itemId);
    return meta
      ? {
          repoUrl: meta.repoUrl,
          repoName: meta.repoName,
          repoDefaultBranch: meta.repoDefaultBranch,
          branchName: meta.branchName,
        }
      : {
          repoUrl: this.config.workspace.repo_url,
          repoName: null,
          repoDefaultBranch: null,
          branchName: null,
        };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.refreshSignal = () => {
        clearTimeout(timer);
        resolve();
        this.refreshSignal = null;
      };
    });
  }

  private async tick(): Promise<void> {
    this.state.lastPollAt = Date.now();

    let candidates: WorkItem[] = [];
    try {
      candidates = await this.tracker.fetchCandidates();
      this.consecutivePollFailures = 0;
      logger.info("polled tracker", { candidate_count: candidates.length });
    } catch (err) {
      this.consecutivePollFailures++;
      const backoff = Math.min(this.config.poll_interval_s * 1000 * Math.pow(2, this.consecutivePollFailures), 300_000);
      logger.error("tracker poll failed", {
        error: String(err),
        consecutive_failures: this.consecutivePollFailures,
        backoff_ms: backoff,
      });
      await this.sleep(backoff);
      return;
    }

    const stalledIds = detectStalls(this.state, this.config.stall_timeout_s * 1000);
    for (const id of stalledIds) {
      abortStalled(this.state, id, "stall_timeout");
    }

    const freshMap = new Map(candidates.map((i) => [i.id, i]));

    // Reconcile running workers against actual tracker state (not filtered candidates).
    // Dispatch filters (filter_states, filter_labels) must not abort workers — only terminal
    // state (or item not found) should abort a running worker.
    const reconcilePromises: Promise<void>[] = [];
    for (const [itemId, entry] of this.state.running) {
      if (freshMap.has(itemId)) continue; // still in filtered candidates, all good

      reconcilePromises.push(
        this.tracker
          .refreshWorkItem(itemId)
          .then((fresh) => {
            if (!fresh || fresh.state === "terminal") {
              logger.info("aborting worker: item terminal or not found", {
                item_id: itemId,
                new_state: fresh?.stateLabel ?? "not_found",
              });
              entry.abortController.abort();
            } else {
              logger.debug("worker item left filter set but not terminal, continuing", {
                item_id: itemId,
                state: fresh.stateLabel,
              });
            }
          })
          .catch((err) => {
            logger.warn("reconcile refresh failed, leaving worker running", {
              item_id: itemId,
              error: String(err),
            });
          }),
      );
    }
    await Promise.all(reconcilePromises);

    const dueRetries = popDueRetries(this.state);

    const toDispatch = selectForDispatch(candidates, this.state, this.config);
    setPending(this.state, selectPending(candidates, this.state, this.config));

    for (const retry of dueRetries) {
      const item = freshMap.get(retry.workItem.id);
      if (!item) continue;
      const reason = checkEligibility(item, this.state, this.config);
      if (reason) {
        logger.debug("retry not eligible", {
          item_id: retry.workItem.id,
          reason,
        });
        continue;
      }
      await this.launchWorker(item, retry.attemptNumber, retry.lastSessionId);
    }

    for (const item of toDispatch) {
      await this.launchWorker(item, 1, null);
    }
  }

  private async launchWorker(item: WorkItem, attemptNumber: number, resumeSessionId: string | null): Promise<void> {
    logger.info("launching worker", {
      item_id: item.id,
      identifier: item.identifier,
      kind: item.kind,
      attempt: attemptNumber,
    });

    const abortController = new AbortController();

    let workspaceDir: string;
    try {
      workspaceDir = await this.workspaceManager.createWorkspace(item);
      registerWorkspace(this.state, item.id, workspaceDir);

      // If workspace.repo is set, provision a git worktree instead of an empty dir
      if (this.config.workspace.repo && this.repoManager) {
        const repoName = this.config.workspace.repo;
        const worktreeInfo = await this.repoManager.createWorktree(repoName, workspaceDir, item.identifier);
        const repoInfo = this.repoManager.getRepo(repoName);
        this.worktreeRegistry.set(item.id, {
          repoName,
          branchName: worktreeInfo.branchName,
          repoUrl: repoInfo?.config.url ?? "",
          repoDefaultBranch: repoInfo?.config.default_branch ?? "main",
        });
        logger.info("worktree provisioned", {
          item_id: item.id,
          repo: repoName,
          branch: worktreeInfo.branchName,
          path: workspaceDir,
        });
      }
    } catch (err) {
      logger.error("workspace creation failed", {
        item_id: item.id,
        error: String(err),
      });
      return;
    }

    // Add to running immediately so the dashboard shows the worker during hook execution
    let resolveWorker!: (r: WorkerResult) => void;
    let rejectWorker!: (e: unknown) => void;
    const promise = new Promise<WorkerResult>((res, rej) => {
      resolveWorker = res;
      rejectWorker = rej;
    });

    const entry: RunningEntry = {
      workItem: item,
      workspaceDir,
      sessionId: resumeSessionId,
      turnCount: 0,
      attemptNumber,
      startedAt: Date.now(),
      lastEventAt: Date.now(),
      prUrl: null,
      abortController,
      promise,
    };

    addRunning(this.state, entry);

    try {
      this.onNotify?.({
        type: "agent_started",
        issueIdentifier: item.identifier,
        issueTitle: item.title,
        issueUrl: item.url,
        timestamp: Date.now(),
      });
    } catch (err) {
      logger.warn("notification handler failed", { item_id: item.id, error: String(err) });
    }

    const abortLaunch = async (hookName: string, hookErr: unknown) => {
      logger.error(`${hookName} hook failed, aborting worker`, {
        item_id: item.id,
        error: String(hookErr),
      });
      removeRunning(this.state, item.id);
      recordCompletion(this.state, item.id);
      unregisterWorkspace(this.state, item.id);
      try {
        this.onNotify?.({
          type: "agent_errored",
          issueIdentifier: item.identifier,
          issueTitle: item.title,
          issueUrl: item.url,
          timestamp: Date.now(),
          error: `${hookName} hook failed: ${hookErr}`,
        });
      } catch (notifyErr) {
        logger.warn("notification handler failed", { item_id: item.id, error: String(notifyErr) });
      }
    };

    try {
      await runHooks("after_create", this.config.hooks, {
        issueId: item.id,
        issueIdentifier: item.identifier,
        workspaceDir,
        sessionId: null,
        ...this.buildRepoContext(item.id),
        workItem: item,
        attempt: attemptNumber,
      });
    } catch (err) {
      await abortLaunch("after_create", err);
      return;
    }

    try {
      await runHooks("before_run", this.config.hooks, {
        issueId: item.id,
        issueIdentifier: item.identifier,
        workspaceDir,
        sessionId: resumeSessionId,
        ...this.buildRepoContext(item.id),
        workItem: item,
        attempt: attemptNumber,
      });
    } catch (err) {
      await abortLaunch("before_run", err);
      return;
    }

    const mcpServers = () => {
      const servers: Record<string, unknown> = {
        harmonica: createSdkMcpServer({
          name: "harmonica",
          tools: [
            tool(
              "task_complete",
              "Signal that you have completed all work on this task. Call this when you are fully finished.",
              { reason: z.string().optional().describe("Brief summary of what you accomplished") },
              async () => ({ content: [{ type: "text" as const, text: "Task marked complete." }] }),
            ),
          ],
        }) as any,
      };

      if (this.config.tracker.type === "linear") {
        const apiKey = this.config.tracker.api_key ?? "";
        servers.linear = createLinearMcpServerConfig(apiKey);
      }

      return servers as Record<string, import("../types.ts").McpServerConfig>;
    };

    const workerPromise = runWorker({
      item,
      workspaceDir,
      sessionId: resumeSessionId,
      attemptNumber,
      config: this.config,
      runner: this.runner,
      workflow: this.workflow,
      tracker: this.tracker,
      onSessionId: (itemId, sid) => setSessionId(this.state, itemId, sid),
      onEvent: (itemId) => touchRunning(this.state, itemId),
      onOutput: (itemId, line) => appendOutput(this.state, itemId, line),
      onTurnStart: (itemId, turn) => updateTurnCount(this.state, itemId, turn),
      onPrUrl: (itemId, url) => setPrUrl(this.state, itemId, url),
      mcpServers,
      abortController,
      ...this.buildRepoContext(item.id),
    });

    workerPromise.then(resolveWorker, rejectWorker);

    const resultChain: Promise<void> = promise
      .then((result) => this.handleWorkerResult(result, attemptNumber))
      .catch((err) =>
        logger.error("worker threw unexpectedly", {
          item_id: item.id,
          error: String(err),
        }),
      )
      .finally(() => this.pendingResults.delete(resultChain));
    this.pendingResults.add(resultChain);
  }

  private async handleWorkerResult(result: WorkerResult, attemptNumber: number): Promise<void> {
    const item = result.workItem;
    logger.info("worker completed", {
      item_id: item.id,
      exit_reason: result.exitReason,
      turns: result.turnCount,
    });

    const entry = this.state.running.get(item.id);
    const workspaceDir = entry?.workspaceDir ?? this.state.workspaces.get(item.id);

    const outputLines = drainOutput(this.state, item.id);

    if (this.db) {
      const completed: CompletedSession = {
        issueId: item.id,
        issueIdentifier: item.identifier,
        issueTitle: item.title,
        issueUrl: item.url,
        issueLabels: item.labels,
        issueStateLabel: item.stateLabel,
        issueAssigneeName: getWorkItemAssigneeName(item),
        issueProjectName: getWorkItemProjectName(item),
        workItemKind: item.kind,
        workItemExtra: getWorkItemExtra(item),
        sessionId: result.sessionId,
        exitReason: result.exitReason,
        turnCount: result.turnCount,
        tokenUsage: result.tokenUsage,
        attemptNumber,
        startedAt: entry?.startedAt ?? Date.now(),
        completedAt: Date.now(),
        outputLines,
        error: result.error,
        prUrl: entry?.prUrl ?? null,
      };
      try {
        this.db.insertSession(completed, this.workflowId);
      } catch (err) {
        logger.warn("failed to persist completed session", { item_id: item.id, error: String(err) });
      }
    }

    removeRunning(this.state, item.id);
    recordCompletion(this.state, item.id);

    try {
      if (result.exitReason === "error") {
        this.onNotify?.({
          type: "agent_errored",
          issueIdentifier: item.identifier,
          issueTitle: item.title,
          issueUrl: item.url,
          timestamp: Date.now(),
          error: result.error,
        });
      } else {
        this.onNotify?.({
          type: "agent_finished",
          issueIdentifier: item.identifier,
          issueTitle: item.title,
          issueUrl: item.url,
          timestamp: Date.now(),
          exitReason: result.exitReason,
          turnCount: result.turnCount,
        });
      }
    } catch (err) {
      logger.warn("notification handler failed", { item_id: item.id, error: String(err) });
    }

    if (workspaceDir) {
      await runHooks("after_run", this.config.hooks, {
        issueId: item.id,
        issueIdentifier: item.identifier,
        workspaceDir,
        sessionId: result.sessionId,
        ...this.buildRepoContext(item.id),
        workItem: item,
        attempt: attemptNumber,
      });
    }

    const retryEntry = createRetryEntry(result, attemptNumber, this.config, workspaceDir);
    if (retryEntry) {
      logger.info("scheduling retry", {
        item_id: item.id,
        retry_at: retryEntry.retryAt,
      });
      scheduleRetry(this.state, retryEntry);
    }

    const shouldClean =
      (result.exitReason === "terminal" || result.exitReason === "completed") &&
      this.config.workspace.cleanup_on_terminal;

    if (shouldClean && workspaceDir) {
      await runHooks("before_remove", this.config.hooks, {
        issueId: item.id,
        issueIdentifier: item.identifier,
        workspaceDir,
        sessionId: result.sessionId,
        ...this.buildRepoContext(item.id),
        workItem: item,
        attempt: attemptNumber,
      });

      const worktreeMeta = this.worktreeRegistry.get(item.id);
      if (worktreeMeta && this.repoManager) {
        // Worktree-managed workspace: let RepoManager handle filesystem cleanup
        try {
          await this.repoManager.removeWorktree(worktreeMeta.repoName, workspaceDir);
        } catch (err) {
          logger.warn("worktree removal failed, falling back to rm", { item_id: item.id, error: String(err) });
          await this.workspaceManager.removeWorkspace(workspaceDir);
        }
        this.worktreeRegistry.delete(item.id);
      } else {
        await this.workspaceManager.removeWorkspace(workspaceDir);
      }

      unregisterWorkspace(this.state, item.id);
      logger.info("workspace removed", {
        item_id: item.id,
        dir: workspaceDir,
      });
    }
  }
}
