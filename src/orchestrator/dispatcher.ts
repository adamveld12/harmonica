import type { WorkItem, OrchestratorState } from "../types.ts";
import type { Config } from "../config/schema.ts";
import { getEffectiveConcurrency } from "../config/config.ts";
import { isInCooldown } from "./state.ts";

const COMPLETION_COOLDOWN_MS = 30_000;

export function checkEligibility(
  issue: WorkItem,
  state: OrchestratorState,
  config: Config,
): string | null {
  if (state.isShuttingDown) return "shutting_down";
  if (issue.state !== "active") return "not_active";
  if (state.running.has(issue.id)) return "already_running";
  if (state.retryQueue.some((r) => r.workItem.id === issue.id))
    return "in_retry_queue";
  if (isInCooldown(state, issue.id, COMPLETION_COOLDOWN_MS))
    return "in_cooldown";
  if (state.running.size >= getEffectiveConcurrency(config))
    return "concurrency_limit";
  return null;
}

export function sortCandidates(issues: WorkItem[]): WorkItem[] {
  return [...issues].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function availableSlots(
  state: OrchestratorState,
  config: Config,
): number {
  return Math.max(0, getEffectiveConcurrency(config) - state.running.size);
}

export function selectForDispatch(
  candidates: WorkItem[],
  state: OrchestratorState,
  config: Config,
): WorkItem[] {
  const eligible = candidates.filter(
    (issue) => checkEligibility(issue, state, config) === null,
  );
  const sorted = sortCandidates(eligible);
  return sorted.slice(0, availableSlots(state, config));
}

export function selectPending(
  candidates: WorkItem[],
  state: OrchestratorState,
  config: Config,
): WorkItem[] {
  if (state.running.size < getEffectiveConcurrency(config)) return [];
  return sortCandidates(candidates.filter((item) => {
    if (item.state !== "active") return false;
    if (state.running.has(item.id)) return false;
    if (state.retryQueue.some((r) => r.workItem.id === item.id)) return false;
    if (isInCooldown(state, item.id, COMPLETION_COOLDOWN_MS)) return false;
    return true;
  }));
}
