import { logger } from "./logger.ts";
import type { TrackerConfig } from "./config.ts";
import type { WorkItem } from "./work-item.ts";
import type { Sensor, SensorBackend, SensorPipeline, StateClassificationConfig, SensorConfigBase } from "./sensor.ts";

/**
 * Generic polling sensor engine.
 * @typeParam TList - Shape of items returned by bulk fetchAll() polls.
 * @typeParam TDetail - Shape of single-item fetchOne() responses (defaults to TList).
 *   Linear projects use different list vs detail shapes; most backends are symmetric.
 *
 * Owns: poll timer, node cache, subscription tracking, refresh TTL cache, stale detection.
 * Delegates: data fetching to SensorBackend, filtering/normalization to SensorPipeline.
 */
export class PollingSensor<TList, TDetail = TList> implements Sensor {
  private subscriptions = new Map<string, TrackerConfig>();
  private cachedNodes: TList[] = [];
  private lastFetchAt = 0;
  private lastError: string | null = null;
  private refreshCache = new Map<string, { node: TDetail; fetchedAt: number }>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private fetching = false;

  constructor(
    private config: SensorConfigBase,
    private backend: SensorBackend<TList, TDetail>,
    private pipeline: SensorPipeline<TList, TDetail>,
  ) {}

  subscribe(workflowId: string, trackerConfig: TrackerConfig): void {
    this.subscriptions.set(workflowId, trackerConfig);
  }

  unsubscribe(workflowId: string): void {
    this.subscriptions.delete(workflowId);
  }

  async start(): Promise<void> {
    await this.backend.start?.();
    await this.poll();
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => logger.error("sensor poll interval error", { error: String(err) }));
    }, this.config.poll_interval_s * 1000);
  }

  stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.backend.stop?.();
  }

  private async poll(): Promise<void> {
    if (this.fetching) {
      logger.debug("sensor poll skipped (already fetching)");
      return;
    }
    this.fetching = true;
    try {
      this.cachedNodes = await this.backend.fetchAll();
      this.lastFetchAt = Date.now();
      this.lastError = null;
    } catch (err) {
      this.lastError = String(err);
      logger.error("sensor poll failed", { error: this.lastError });
      // retain stale cache
    } finally {
      this.fetching = false;
    }
  }

  getCandidates(trackerConfig: TrackerConfig): WorkItem[] {
    const staleness = Date.now() - this.lastFetchAt;
    if (this.lastFetchAt > 0 && staleness > this.config.poll_interval_s * 1000 * 3) {
      logger.warn("sensor cache is stale", { stale_ms: staleness });
    }

    const classificationConfig: StateClassificationConfig = {
      active_states: this.config.active_states,
      terminal_states: trackerConfig.terminal_states,
    };

    const afterFilter = this.cachedNodes.filter((node) => this.pipeline.filter(node, trackerConfig));
    const items = afterFilter.map((node) => this.pipeline.normalizeList(node, classificationConfig));
    const active = items.filter((item) => item.state === "active");

    logger.debug("sensor getCandidates", {
      cached: this.cachedNodes.length,
      after_filter: afterFilter.length,
      after_active: active.length,
    });

    return active;
  }

  async refreshWorkItem(id: string, trackerConfig: TrackerConfig): Promise<WorkItem | null> {
    const ttl = this.config.refresh_ttl_s * 1000;
    const cached = this.refreshCache.get(id);

    const classificationConfig: StateClassificationConfig = {
      active_states: this.config.active_states,
      terminal_states: trackerConfig.terminal_states,
    };

    if (cached && Date.now() - cached.fetchedAt < ttl) {
      return this.pipeline.normalizeDetail(cached.node, classificationConfig);
    }

    const node = await this.backend.fetchOne(id);
    if (!node) return null;
    this.refreshCache.set(id, { node, fetchedAt: Date.now() });
    const result = this.pipeline.normalizeDetail(node, classificationConfig);
    logger.debug("sensor refresh work item", { id, state: result.stateLabel });
    return result;
  }

  getConfig(): SensorConfigBase {
    return this.config;
  }
}
