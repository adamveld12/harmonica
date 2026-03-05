import type { OrchestratorState, WorkItem } from "../types.ts";
import { logger } from "../observability/logger.ts";

export function detectStalls(
  state: OrchestratorState,
  stallTimeoutMs: number,
): string[] {
  const now = Date.now();
  const stalled: string[] = [];
  for (const [issueId, entry] of state.running) {
    if (now - entry.lastEventAt > stallTimeoutMs) {
      stalled.push(issueId);
    }
  }
  return stalled;
}

export function abortStalled(
  state: OrchestratorState,
  issueId: string,
  reason: string,
): void {
  const entry = state.running.get(issueId);
  if (entry) {
    logger.warn("aborting stalled run", { issue_id: issueId, reason });
    entry.abortController.abort();
  }
}

export function reconcileTrackerStates(
  state: OrchestratorState,
  freshIssues: Map<string, WorkItem>,
): string[] {
  const aborted: string[] = [];
  for (const [issueId, entry] of state.running) {
    const fresh = freshIssues.get(issueId);
    if (!fresh || fresh.state !== "active") {
      const newState = fresh?.state ?? "not_found";
      logger.info("aborting non-active run", {
        issue_id: issueId,
        new_state: newState,
      });
      entry.abortController.abort();
      aborted.push(issueId);
    }
  }
  return aborted;
}
