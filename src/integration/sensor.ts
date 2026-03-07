import { logger } from "../observability/logger.ts";
import type { SensorConfig, TrackerConfig } from "../config/schema.ts";
import type { WorkItem } from "../types.ts";
import type { LinearIssueNode, LinearProjectListNode, LinearProjectNode } from "./linear-types.ts";
import { normalizeIssue, normalizeProjectListItem, normalizeProject } from "./linear-types.ts";
import {
  fetchAllIssueNodes,
  fetchAllProjectNodes,
  fetchOneIssueNode,
  fetchOneProjectNode,
  matchesIssueFilters,
  matchesProjectFilters,
} from "./linear-api.ts";

const DEFAULT_ACTIVE_STATES_ISSUES = ["Backlog", "Ready"];
const DEFAULT_ACTIVE_STATES_PROJECTS = ["started"];

interface RefreshCacheEntry {
  node: LinearIssueNode | LinearProjectNode;
  fetchedAt: number;
}

export class LinearSensor {
  private subscriptions = new Map<string, TrackerConfig>();
  private cachedNodes: LinearIssueNode[] | LinearProjectListNode[] = [];
  private lastFetchAt = 0;
  private lastError: string | null = null;
  private refreshCache = new Map<string, RefreshCacheEntry>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private fetching = false;

  constructor(private config: SensorConfig) {}

  subscribe(workflowId: string, trackerConfig: TrackerConfig): void {
    this.subscriptions.set(workflowId, trackerConfig);
  }

  unsubscribe(workflowId: string): void {
    this.subscriptions.delete(workflowId);
  }

  async start(): Promise<void> {
    await this.poll();
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => logger.error("sensor poll interval error", { error: String(err) }));
    }, this.config.poll_interval_ms);
  }

  stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private activeStates(): string[] {
    if (this.config.active_states?.length) return this.config.active_states;
    return this.config.mode === "projects" ? DEFAULT_ACTIVE_STATES_PROJECTS : DEFAULT_ACTIVE_STATES_ISSUES;
  }

  private async poll(): Promise<void> {
    if (this.fetching) {
      logger.debug("sensor poll skipped (already fetching)", { mode: this.config.mode });
      return;
    }
    this.fetching = true;
    try {
      if (this.config.mode === "projects") {
        const nodes = await fetchAllProjectNodes(this.config.api_key, this.activeStates());
        this.cachedNodes = nodes as LinearProjectListNode[];
      } else {
        const nodes = await fetchAllIssueNodes(this.config.api_key, this.activeStates());
        this.cachedNodes = nodes as LinearIssueNode[];
      }
      this.lastFetchAt = Date.now();
      this.lastError = null;
    } catch (err) {
      this.lastError = String(err);
      logger.error("sensor poll failed", { mode: this.config.mode, error: this.lastError });
      // retain stale cache
    } finally {
      this.fetching = false;
    }
  }

  getCandidates(trackerConfig: TrackerConfig): WorkItem[] {
    const staleness = Date.now() - this.lastFetchAt;
    if (this.lastFetchAt > 0 && staleness > this.config.poll_interval_ms * 3) {
      logger.warn("sensor cache is stale", { mode: this.config.mode, stale_ms: staleness });
    }

    const classificationConfig = {
      active_states: this.config.active_states,
      terminal_states: trackerConfig.terminal_states,
    };

    if (this.config.mode === "projects") {
      const nodes = this.cachedNodes as LinearProjectListNode[];
      const afterFilter = nodes.filter((node) => matchesProjectFilters(node, trackerConfig));
      const items = afterFilter.map((node) => normalizeProjectListItem(node, classificationConfig));
      const active = items.filter((item) => item.state === "active");
      logger.debug("sensor getCandidates projects", {
        cached: nodes.length,
        after_filter: afterFilter.length,
        after_active: active.length,
      });
      return active;
    }

    const nodes = this.cachedNodes as LinearIssueNode[];
    const afterFilter = nodes.filter((node) => matchesIssueFilters(node, trackerConfig));
    const items = afterFilter.map((node) => normalizeIssue(node, classificationConfig));
    const active = items.filter((item) => item.state === "active");
    logger.debug("sensor getCandidates issues", {
      cached: nodes.length,
      after_filter: afterFilter.length,
      after_active: active.length,
    });
    return active;
  }

  async refreshWorkItem(id: string, trackerConfig: TrackerConfig): Promise<WorkItem | null> {
    const ttl = this.config.refresh_ttl_ms;
    const cached = this.refreshCache.get(id);
    if (cached && Date.now() - cached.fetchedAt < ttl) {
      const classificationConfig = {
        active_states: this.config.active_states,
        terminal_states: trackerConfig.terminal_states,
      };
      if (this.config.mode === "projects") {
        return normalizeProject(cached.node as LinearProjectNode, classificationConfig);
      }
      return normalizeIssue(cached.node as LinearIssueNode, classificationConfig);
    }

    const classificationConfig = {
      active_states: this.config.active_states,
      terminal_states: trackerConfig.terminal_states,
    };

    if (this.config.mode === "projects") {
      const node = await fetchOneProjectNode(this.config.api_key, id);
      if (!node) return null;
      this.refreshCache.set(id, { node, fetchedAt: Date.now() });
      const result = normalizeProject(node, classificationConfig);
      logger.debug("sensor refresh work item", { mode: this.config.mode, id, state: result.stateLabel });
      return result;
    }

    const node = await fetchOneIssueNode(this.config.api_key, id);
    if (!node) return null;
    this.refreshCache.set(id, { node, fetchedAt: Date.now() });
    const result = normalizeIssue(node, classificationConfig);
    logger.debug("sensor refresh work item", { mode: this.config.mode, id, state: result.stateLabel });
    return result;
  }

  getApiKey(): string {
    return this.config.api_key;
  }

  getMode(): "issues" | "projects" {
    return this.config.mode;
  }

  getConfig(): SensorConfig {
    return this.config;
  }
}
