import type {
  WorkItem,
  NormalizedIssue,
  NormalizedProject,
  AgentRunner,
  WorkerResult,
  TokenUsage,
  WorkflowConfig,
  McpServerFactory,
  OutputLine,
} from "../types.ts";
import type { Config } from "../config/schema.ts";
import type { TrackerClient } from "@harmonica/sensor-core";
import { renderPrompt } from "../policy/prompt-renderer.ts";
import { buildSystemPrompt } from "../policy/system-prompt.ts";
import { logger } from "../observability/logger.ts";

export interface WorkerOptions {
  item: WorkItem;
  workspaceDir: string;
  sessionId: string | null;
  attemptNumber: number;
  config: Config;
  runner: AgentRunner;
  workflow: WorkflowConfig;
  tracker: TrackerClient;
  onSessionId: (itemId: string, sessionId: string) => void;
  onEvent: (itemId: string) => void;
  onOutput: (itemId: string, line: OutputLine) => void;
  onTurnStart: (itemId: string, turn: number) => void;
  onPrUrl: (itemId: string, url: string) => void;
  mcpServers?: McpServerFactory;
  abortController: AbortController;
}

function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

function addUsage(a: TokenUsage, b: Partial<TokenUsage>): TokenUsage {
  return {
    inputTokens: a.inputTokens + (b.inputTokens ?? 0),
    outputTokens: a.outputTokens + (b.outputTokens ?? 0),
    cacheReadTokens: a.cacheReadTokens + (b.cacheReadTokens ?? 0),
    cacheWriteTokens: a.cacheWriteTokens + (b.cacheWriteTokens ?? 0),
  };
}

const CONTINUATION_PROMPT =
  "Continue working on the issue. Review what you have done so far and complete any remaining tasks.";

const GH_PR_RE = /https:\/\/github\.com\/[^\s)]+\/pull\/\d+/;

export async function runWorker(options: WorkerOptions): Promise<WorkerResult> {
  const {
    item,
    workspaceDir,
    config,
    runner,
    workflow,
    tracker,
    onSessionId,
    onEvent,
    onOutput,
    onTurnStart,
    onPrUrl,
    mcpServers,
    abortController,
  } = options;

  let sessionId = options.sessionId;
  let turnCount = 0;
  let totalUsage = emptyUsage();
  let sessionIdEmitted = false;
  let currentItem = item;
  const initialStateLabel = item.stateLabel;
  const maxTurns = config.agent.max_turns;

  logger.info("worker started", {
    item_id: item.id,
    identifier: item.identifier,
    kind: item.kind,
    attempt: options.attemptNumber,
    resume_session: sessionId ?? "none",
  });

  function makeResult(exitReason: WorkerResult["exitReason"], extra?: Partial<WorkerResult>): WorkerResult {
    return { workItem: currentItem, exitReason, sessionId, turnCount, tokenUsage: totalUsage, ...extra };
  }

  try {
    let prompt: string;
    try {
      const vars =
        item.kind === "issue"
          ? {
              issue: item as NormalizedIssue,
              project: null,
              item,
              attempt: options.attemptNumber,
              workspace_dir: workspaceDir,
            }
          : {
              issue: null,
              project: item as NormalizedProject,
              item,
              attempt: options.attemptNumber,
              workspace_dir: workspaceDir,
            };
      const rendered = await renderPrompt(workflow.promptTemplate, vars);
      const systemPrompt = buildSystemPrompt(config, item);
      // Concatenated into user prompt — the Agent SDK does not support a dedicated
      // systemPrompt parameter that persists across session resumption. Prepending
      // to the first user turn is the only reliable way to carry the context forward.
      prompt = systemPrompt ? `${systemPrompt}\n${rendered}` : rendered;
    } catch (err) {
      logger.error("prompt render failed", { item_id: item.id, error: String(err) });
      return makeResult("error", { error: `Prompt render failed: ${err}` });
    }

    for (let turn = 1; turn <= maxTurns; turn++) {
      if (abortController.signal.aborted) {
        return makeResult(abortController.signal.reason === "stalled" ? "stalled" : "aborted");
      }
      onTurnStart(item.id, turn);

      const turnController = new AbortController();
      const timeoutId = setTimeout(() => turnController.abort(), config.agent.turn_timeout_s * 1000);
      abortController.signal.addEventListener("abort", () => turnController.abort(), { once: true });

      const currentPrompt = turn === 1 ? prompt : CONTINUATION_PROMPT;
      const turnMcpServers = mcpServers?.();

      logger.info("starting turn", { item_id: item.id, turn, max_turns: maxTurns });

      try {
        for await (const event of runner.run({
          prompt: currentPrompt,
          workspaceDir,
          sessionId,
          abortController: turnController,
          mcpServers: turnMcpServers,
        })) {
          onEvent(item.id);

          switch (event.type) {
            case "session_id":
              sessionId = event.sessionId;
              if (!sessionIdEmitted) {
                onSessionId(item.id, event.sessionId);
                sessionIdEmitted = true;
                logger.info("session established", { item_id: item.id, session_id: event.sessionId });
              }
              break;
            case "text": {
              onOutput(item.id, { ts: Date.now(), type: "text", content: event.content });
              const textPrMatch = event.content.match(GH_PR_RE);
              if (textPrMatch) onPrUrl(item.id, textPrMatch[0]);
              break;
            }
            case "tool_use": {
              if (event.toolName === "task_complete" || event.toolName === "mcp__harmonica__task_complete") {
                const reason =
                  typeof event.toolInput === "object" && event.toolInput !== null && "reason" in event.toolInput
                    ? String((event.toolInput as Record<string, unknown>).reason)
                    : "agent declared task complete";
                onOutput(item.id, { ts: Date.now(), type: "info", content: `task_complete: ${reason}` });
                logger.info("agent declared task complete", { item_id: item.id, reason });
                return makeResult("completed", { turnCount: turn });
              }
              const inputStr = JSON.stringify(event.toolInput);
              const truncated = inputStr.length > 120 ? inputStr.slice(0, 120) + "…" : inputStr;
              onOutput(item.id, { ts: Date.now(), type: "tool_use", content: `${event.toolName}(${truncated})` });
              const toolUsePrMatch = truncated.match(GH_PR_RE);
              if (toolUsePrMatch) onPrUrl(item.id, toolUsePrMatch[0]);
              break;
            }
            case "tool_result": {
              onOutput(item.id, { ts: Date.now(), type: "tool_result", content: event.content });
              const resultPrMatch = event.content.match(GH_PR_RE);
              if (resultPrMatch) onPrUrl(item.id, resultPrMatch[0]);
              break;
            }
            case "usage":
              totalUsage = addUsage(totalUsage, event);
              break;
            case "error":
              onOutput(item.id, { ts: Date.now(), type: "error", content: event.error });
              logger.error("agent error event, aborting worker", { item_id: item.id, error: event.error });
              return makeResult("error", { turnCount: turn, error: event.error });
            case "done":
              turnCount = turn;
              break;
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }

      if (turnController.signal.aborted && !abortController.signal.aborted) {
        logger.warn("turn timed out", { item_id: item.id, turn, timeout_s: config.agent.turn_timeout_s });
        return makeResult("stalled", { turnCount: turn });
      }

      if (abortController.signal.aborted) {
        return makeResult(abortController.signal.reason === "stalled" ? "stalled" : "aborted");
      }

      try {
        const fresh = await tracker.refreshWorkItem(item.id);
        if (fresh) {
          currentItem = fresh;
        }
        if (!fresh || fresh.state === "terminal") {
          logger.info("item reached terminal state", { item_id: item.id, state: fresh?.stateLabel });
          return makeResult("terminal", { turnCount: turn });
        }
        if (fresh.state === "non_active") {
          logger.info("item became non-active", { item_id: item.id, state: fresh.stateLabel });
          return makeResult("completed", { turnCount: turn });
        }
        if (fresh.stateLabel !== initialStateLabel) {
          logger.info("item state changed", { item_id: item.id, from: initialStateLabel, to: fresh.stateLabel });
          return makeResult("completed", { turnCount: turn });
        }
      } catch (err) {
        logger.warn("item state check failed", { item_id: item.id, error: String(err) });
      }

      if (turn >= maxTurns) {
        logger.info("reached max turns", { item_id: item.id, turns: turn });
        return makeResult("max_turns", { turnCount: turn });
      }
    }

    return makeResult("completed");
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === "AbortError" || abortController.signal.aborted) {
      const reason = !abortController.signal.aborted
        ? "stalled"
        : abortController.signal.reason === "stalled"
          ? "stalled"
          : "aborted";
      return makeResult(reason);
    }
    logger.error("worker error", { item_id: item.id, error: error.message });
    return makeResult("error", { error: error.message });
  }
}
