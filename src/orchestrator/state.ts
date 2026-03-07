import type {
  OrchestratorState,
  RunningEntry,
  RetryEntry,
  OutputLine,
  WorkItem,
} from "../types.ts";

export function createState(): OrchestratorState {
  return {
    running: new Map(),
    retryQueue: [],
    workspaces: new Map(),
    outputLogs: new Map(),
    lastPollAt: 0,
    isShuttingDown: false,
    completedAt: new Map(),
    pending: [],
  };
}

export function setPending(state: OrchestratorState, items: WorkItem[]): void {
  state.pending = items;
}

export function recordCompletion(
  state: OrchestratorState,
  issueId: string,
): void {
  state.completedAt.set(issueId, Date.now());
}

export function isInCooldown(
  state: OrchestratorState,
  issueId: string,
  cooldownMs: number,
): boolean {
  const ts = state.completedAt.get(issueId);
  return ts !== undefined && Date.now() - ts < cooldownMs;
}

export function appendOutput(
  state: OrchestratorState,
  issueId: string,
  line: OutputLine,
): void {
  let lines = state.outputLogs.get(issueId);
  if (!lines) {
    lines = [];
    state.outputLogs.set(issueId, lines);
  }
  lines.push(line);
}

export function drainOutput(
  state: OrchestratorState,
  issueId: string,
): OutputLine[] {
  const lines = state.outputLogs.get(issueId) ?? [];
  state.outputLogs.delete(issueId);
  return lines;
}

export function addRunning(
  state: OrchestratorState,
  entry: RunningEntry,
): void {
  state.running.set(entry.workItem.id, entry);
}

export function removeRunning(
  state: OrchestratorState,
  issueId: string,
): void {
  state.running.delete(issueId);
}

export function touchRunning(
  state: OrchestratorState,
  issueId: string,
): void {
  const entry = state.running.get(issueId);
  if (entry) {
    entry.lastEventAt = Date.now();
  }
}

export function setSessionId(
  state: OrchestratorState,
  issueId: string,
  sessionId: string,
): void {
  const entry = state.running.get(issueId);
  if (entry) {
    entry.sessionId = sessionId;
  }
}

export function updateTurnCount(
  state: OrchestratorState,
  itemId: string,
  turn: number,
): void {
  const entry = state.running.get(itemId);
  if (entry) entry.turnCount = turn;
}

export function setPrUrl(
  state: OrchestratorState,
  itemId: string,
  url: string,
): void {
  const entry = state.running.get(itemId);
  if (entry) entry.prUrl = url;
}

export function scheduleRetry(
  state: OrchestratorState,
  entry: RetryEntry,
): void {
  state.retryQueue = state.retryQueue.filter(
    (r) => r.workItem.id !== entry.workItem.id,
  );
  state.retryQueue.push(entry);
}

export function registerWorkspace(
  state: OrchestratorState,
  issueId: string,
  dir: string,
): void {
  state.workspaces.set(issueId, dir);
}

export function unregisterWorkspace(
  state: OrchestratorState,
  issueId: string,
): void {
  state.workspaces.delete(issueId);
}
