import type { WorkItem } from "../types.ts";

export interface TrackerClient {
  fetchCandidates(): Promise<WorkItem[]>;
  refreshWorkItem(itemId: string): Promise<WorkItem | null>;
}
