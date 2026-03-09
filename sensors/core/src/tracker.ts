import type { WorkItem } from "./work-item.ts";

export interface TrackerClient {
  fetchCandidates(): Promise<WorkItem[]>;
  refreshWorkItem(itemId: string): Promise<WorkItem | null>;
}
