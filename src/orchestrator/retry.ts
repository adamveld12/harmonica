import type {
  WorkerResult,
  RetryEntry,
  OrchestratorState,
} from "../types.ts";
import type { Config } from "../config/schema.ts";

const RETRY_BASE_MS = 5_000;

function computeBackoff(
  attemptNumber: number,
  maxBackoffMs: number,
): number {
  return Math.min(
    RETRY_BASE_MS * Math.pow(2, attemptNumber - 1),
    maxBackoffMs,
  );
}

export function createRetryEntry(
  result: WorkerResult,
  attemptNumber: number,
  config: Config,
  workspaceDir?: string | null,
): RetryEntry | null {
  if (
    result.exitReason === "completed" ||
    result.exitReason === "terminal" ||
    result.exitReason === "aborted"
  ) {
    return null;
  }

  const nextAttempt = attemptNumber + 1;
  return {
    workItem: result.workItem,
    workspaceDir: workspaceDir ?? null,
    attemptNumber: nextAttempt,
    retryAt: Date.now() + computeBackoff(nextAttempt, config.agent.max_retry_backoff_ms),
    reason: result.exitReason,
    lastSessionId: result.sessionId,
  };
}

export function popDueRetries(state: OrchestratorState): RetryEntry[] {
  const now = Date.now();
  const due = state.retryQueue.filter((r) => r.retryAt <= now);
  state.retryQueue = state.retryQueue.filter((r) => r.retryAt > now);
  return due;
}
