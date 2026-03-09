import type { WorkItem } from "../../types.ts";
import type { TrackerConfig, SensorConfig } from "../../config/schema.ts";

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

export interface Sensor {
  subscribe(workflowId: string, trackerConfig: TrackerConfig): void;
  unsubscribe(workflowId: string): void;
  start(): Promise<void>;
  stop(): void;
  getCandidates(trackerConfig: TrackerConfig): WorkItem[];
  refreshWorkItem(id: string, trackerConfig: TrackerConfig): Promise<WorkItem | null>;
  getConfig(): SensorConfig;
}
