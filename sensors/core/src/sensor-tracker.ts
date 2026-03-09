import type { TrackerClient } from "./tracker.ts";
import type { WorkItem } from "./work-item.ts";
import type { TrackerConfig } from "./config.ts";
import type { Sensor } from "./sensor.ts";

/**
 * Adapts a Sensor to the TrackerClient interface consumed by the orchestrator.
 * Binds a specific TrackerConfig (per-workflow filters) to the shared sensor.
 */
export class SensorTrackerClient implements TrackerClient {
  constructor(
    private sensor: Sensor,
    private config: TrackerConfig,
  ) {}

  async fetchCandidates(): Promise<WorkItem[]> {
    return this.sensor.getCandidates(this.config);
  }

  async refreshWorkItem(itemId: string): Promise<WorkItem | null> {
    return this.sensor.refreshWorkItem(itemId, this.config);
  }
}
