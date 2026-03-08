import type { OrchestratorState } from "../types.ts";
import { logger } from "../observability/logger.ts";

export function detectStalls(state: OrchestratorState, stallTimeoutMs: number): string[] {
  const now = Date.now();
  const stalled: string[] = [];
  for (const [issueId, entry] of state.running) {
    if (now - entry.lastEventAt > stallTimeoutMs) {
      stalled.push(issueId);
    }
  }
  return stalled;
}

export function abortStalled(state: OrchestratorState, issueId: string, reason: string): void {
  const entry = state.running.get(issueId);
  if (entry) {
    logger.warn("aborting stalled run", { issue_id: issueId, reason });
    entry.abortController.abort("stalled");
  }
}
