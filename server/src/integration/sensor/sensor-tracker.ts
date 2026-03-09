import type { TrackerClient } from "../tracker.ts";
import type { WorkItem } from "../../types.ts";
import type { TrackerConfig } from "../../config/schema.ts";
import type { Sensor } from "./types.ts";

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
