import type { z } from "zod";
import type { WorkItem } from "./work-item.ts";
import type { TrackerConfig } from "./config.ts";

export type StateClassificationConfig = {
  active_states?: string[];
  terminal_states?: string[];
};

export interface SensorBackend<TList, TDetail = TList> {
  fetchAll(): Promise<TList[]>;
  fetchOne(id: string): Promise<TDetail | null>;
  start?(): Promise<void>;
  stop?(): void;
}

export interface SensorPipeline<TList, TDetail = TList> {
  filter(item: TList, config: TrackerConfig): boolean;
  normalizeList(item: TList, stateConfig: StateClassificationConfig): WorkItem;
  normalizeDetail(item: TDetail, stateConfig: StateClassificationConfig): WorkItem;
}

/**
 * Base configuration shared by all sensor types.
 * Sensor-specific fields (api_key, owner, repo, etc.) live in each
 * sensor package's own config type, which extends this base.
 */
export interface SensorConfigBase {
  type: string;
  mode: string;
  poll_interval_s: number;
  refresh_ttl_s: number;
  active_states?: string[];
}

export interface Sensor {
  subscribe(workflowId: string, trackerConfig: TrackerConfig): void;
  unsubscribe(workflowId: string): void;
  start(): Promise<void>;
  stop(): void;
  getCandidates(trackerConfig: TrackerConfig): WorkItem[];
  refreshWorkItem(id: string, trackerConfig: TrackerConfig): Promise<WorkItem | null>;
  getConfig(): SensorConfigBase;
}

/**
 * Factory function that creates a Sensor from a validated config object.
 * Registered per sensor type in server's SensorManager.
 * The config parameter has already been validated by the sensor's Zod schema.
 */
export type SensorFactory = (config: unknown) => Sensor;

export interface SensorModule {
  sensorType: string;
  schema: z.ZodType;
  createSensor(config: unknown): Sensor;
}
