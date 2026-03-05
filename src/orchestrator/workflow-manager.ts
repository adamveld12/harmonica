import { resolve, basename, extname, join } from "path";
import { readdirSync } from "fs";
import { loadWorkflow } from "../policy/workflow-loader.ts";
import { watchWorkflow, watchWorkflowDirectory } from "../policy/workflow-watcher.ts";
import { resolveConfig } from "../config/resolver.ts";
import { ConfigSchema } from "../config/schema.ts";
import { createWorkspaceManager, sweepWorkspaces } from "../execution/workspace.ts";
import { createAgentRunner } from "../execution/agent-runner.ts";
import { Orchestrator } from "./orchestrator.ts";
import { createState } from "./state.ts";
import { buildSnapshot } from "../observability/snapshot.ts";
import { logger } from "../observability/logger.ts";
import type { WorkflowConfig, WorkflowId, NotificationEvent, StateSnapshot, CompletedSession } from "../types.ts";
import type { Config } from "../config/schema.ts";
import type { HarmonicaDB } from "../observability/db.ts";
import type { SensorManager } from "../integration/sensor-manager.ts";

export interface WorkflowInstance {
  id: WorkflowId;
  filePath: string;
  workflow: WorkflowConfig;
  config: Config;
  orchestrator: Orchestrator;
  stopWatcher: () => void;
  shutdown: (() => Promise<void>) | null;
  name?: string;
  description?: string;
}

export class WorkflowManager {
  private instances = new Map<WorkflowId, WorkflowInstance>();
  private stopDirWatcher: (() => void) | null = null;
  private notifyHandler?: (event: NotificationEvent) => void;

  constructor(
    private workspacesDir: string,
    private db?: HarmonicaDB,
    private sensorManager?: SensorManager,
  ) {}

  getWorkspacesDir(): string {
    return this.workspacesDir;
  }

  static idFromPath(filePath: string): WorkflowId {
    return basename(filePath, extname(filePath));
  }

  setNotifyHandler(handler: (event: NotificationEvent) => void): void {
    this.notifyHandler = handler;
    // Wire existing orchestrators
    for (const [id, instance] of this.instances) {
      instance.orchestrator.onNotify = (event) =>
        handler({ ...event, workflowId: id, workflowName: instance.name ?? id });
    }
  }

  async sweepStaleWorkspaces(): Promise<void> {
    const activeIds = new Set<string>();
    for (const instance of this.instances.values()) {
      const state = instance.orchestrator.getState();
      for (const id of state.running.keys()) activeIds.add(id);
      for (const id of state.workspaces.keys()) activeIds.add(id);
    }
    await sweepWorkspaces(this.workspacesDir, activeIds);
  }

  async loadDirectory(dirPath: string): Promise<void> {
    const absDir = resolve(dirPath);
    const files = readdirSync(absDir)
      .filter((f) => extname(f) === ".md")
      .map((f) => join(absDir, f));

    if (files.length === 0) {
      logger.warn("no .md workflow files found in directory", { dir: absDir });
    }

    for (const filePath of files) {
      await this.addWorkflow(filePath);
    }

    const anyCleanupOnStart = Array.from(this.instances.values()).some(
      (inst) => inst.config.workspace.cleanup_on_start,
    );
    if (anyCleanupOnStart) {
      await this.sweepStaleWorkspaces();
    }

    this.stopDirWatcher = watchWorkflowDirectory(
      absDir,
      async (filePath) => {
        await this.addWorkflow(filePath).catch((err) =>
          logger.error("failed to add workflow", { path: filePath, error: String(err) })
        );
      },
      async (filePath) => {
        const id = WorkflowManager.idFromPath(filePath);
        await this.removeWorkflow(id).catch((err) =>
          logger.error("failed to remove workflow", { id, error: String(err) })
        );
      },
      (err) => logger.error("directory watcher error", { error: String(err) }),
    );
  }

  async loadSingleFile(filePath: string): Promise<void> {
    await this.addWorkflow(resolve(filePath));
    const inst = Array.from(this.instances.values())[0];
    if (inst?.config.workspace.cleanup_on_start) {
      await this.sweepStaleWorkspaces();
    }
  }

  async addWorkflow(filePath: string): Promise<void> {
    const id = WorkflowManager.idFromPath(filePath);
    if (this.instances.has(id)) {
      logger.warn("workflow already loaded, skipping", { id, path: filePath });
      return;
    }

    logger.info("loading workflow", { id, path: filePath });

    let workflow: WorkflowConfig;
    try {
      workflow = await loadWorkflow(filePath);
    } catch (err) {
      logger.error("failed to load workflow file", { path: filePath, error: String(err) });
      throw err;
    }

    let config: Config;
    try {
      const resolved = resolveConfig(workflow.frontmatter);
      config = ConfigSchema.parse(resolved);
    } catch (err) {
      logger.error("workflow config validation failed", { id, error: String(err) });
      throw err;
    }

    if (!this.sensorManager) {
      throw new Error("SensorManager is required. Ensure .agents/sensors.yaml is configured.");
    }
    const { tracker, resolvedConfig } = this.sensorManager.getTracker(config.tracker, id);
    config = { ...config, tracker: resolvedConfig };

    const workspaceManager = createWorkspaceManager(this.workspacesDir);
    const runner = createAgentRunner({
      model: config.agent.model,
      permissionMode: config.agent.permission_mode,
      allowedTools: config.agent.allowed_tools,
      authMethod: config.agent.auth_method,
      apiKey: config.agent.api_key,
    });

    const state = createState();
    const orchestrator = new Orchestrator(
      config,
      tracker,
      runner,
      workspaceManager,
      workflow,
      state,
      this.db,
      id,
    );

    if (this.notifyHandler) {
      const handler = this.notifyHandler;
      orchestrator.onNotify = (event) => handler({ ...event, workflowId: id, workflowName: workflow.name ?? id });
    }

    const stopWatcher = watchWorkflow(
      filePath,
      (wf) => {
        orchestrator.updateWorkflow(wf);
        try {
          const resolved = resolveConfig(wf.frontmatter);
          let newConfig = ConfigSchema.parse(resolved);
          if (!this.sensorManager) {
            logger.warn("workflow hot-reload skipped: no SensorManager", { id });
            return;
          }
          this.sensorManager.unsubscribe(id);
          const { tracker: newTracker, resolvedConfig } = this.sensorManager.getTracker(newConfig.tracker, id);
          newConfig = { ...newConfig, tracker: resolvedConfig };
          orchestrator.updateConfig(newConfig, newTracker);
          // Update stored config in instance
          const inst = this.instances.get(id);
          if (inst) {
            inst.config = newConfig;
            inst.workflow = wf;
            inst.name = wf.name;
            inst.description = wf.description;
          }
        } catch (err) {
          logger.warn("workflow hot-reload config failed", { id, error: String(err) });
        }
      },
      (err) => logger.error("workflow watch error", { id, error: String(err) }),
    );

    const shutdown = await orchestrator.start();

    const instance: WorkflowInstance = {
      id,
      filePath,
      workflow,
      config,
      orchestrator,
      stopWatcher,
      shutdown,
      name: workflow.name,
      description: workflow.description,
    };

    this.instances.set(id, instance);
    logger.info("workflow started", { id });
  }

  async removeWorkflow(id: WorkflowId): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) return;

    logger.info("removing workflow", { id });
    this.sensorManager?.unsubscribe(id);
    instance.stopWatcher();
    if (instance.shutdown) {
      await instance.shutdown().catch((err) =>
        logger.error("workflow shutdown error", { id, error: String(err) })
      );
    }
    this.instances.delete(id);
    logger.info("workflow removed", { id });
  }

  listWorkflows(): WorkflowId[] {
    return Array.from(this.instances.keys());
  }

  getInstance(id: WorkflowId): WorkflowInstance | undefined {
    return this.instances.get(id);
  }

  getAllSnapshots(): Record<WorkflowId, { snapshot: StateSnapshot; config: Config; completed: CompletedSession[]; name?: string; description?: string }> {
    const result: Record<WorkflowId, { snapshot: StateSnapshot; config: Config; completed: CompletedSession[]; name?: string; description?: string }> = {};
    for (const [id, instance] of this.instances) {
      const state = instance.orchestrator.getState();
      const snapshot = { ...buildSnapshot(state), workflowId: id };
      const completed = this.db ? this.db.listCompleted(50, id) : [];
      result[id] = { snapshot, config: instance.config, completed, name: instance.name, description: instance.description };
    }
    return result;
  }

  triggerRefresh(id?: WorkflowId): void {
    if (id) {
      this.instances.get(id)?.orchestrator.triggerRefresh();
    } else {
      for (const instance of this.instances.values()) {
        instance.orchestrator.triggerRefresh();
      }
    }
  }

  async shutdownAll(): Promise<void> {
    this.stopDirWatcher?.();
    const ids = Array.from(this.instances.keys());
    await Promise.all(ids.map((id) => this.removeWorkflow(id)));
  }
}
