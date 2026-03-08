import type { OrchestratorState, StateSnapshot, RunningSnapshot, RetrySnapshot, PendingSnapshot } from "../types.ts";
import { getWorkItemAssigneeName, getWorkItemProjectName } from "../types.ts";

export function buildSnapshot(state: OrchestratorState): StateSnapshot {
  const running: RunningSnapshot[] = Array.from(state.running.values()).map((e) => ({
    issueId: e.workItem.id,
    issueIdentifier: e.workItem.identifier,
    issueTitle: e.workItem.title,
    issueUrl: e.workItem.url,
    issueLabels: e.workItem.labels,
    issueStateLabel: e.workItem.stateLabel,
    issueAssigneeName: getWorkItemAssigneeName(e.workItem),
    issueProjectName: getWorkItemProjectName(e.workItem),
    workItemKind: e.workItem.kind,
    sessionId: e.sessionId,
    turnCount: e.turnCount,
    attemptNumber: e.attemptNumber,
    startedAt: e.startedAt,
    lastEventAt: e.lastEventAt,
    workspaceDir: e.workspaceDir,
    prUrl: e.prUrl,
  }));

  const retryQueue: RetrySnapshot[] = state.retryQueue.map((r) => ({
    issueId: r.workItem.id,
    issueIdentifier: r.workItem.identifier,
    issueTitle: r.workItem.title,
    issueUrl: r.workItem.url,
    issueLabels: r.workItem.labels,
    issueStateLabel: r.workItem.stateLabel,
    issueAssigneeName: getWorkItemAssigneeName(r.workItem),
    issueProjectName: getWorkItemProjectName(r.workItem),
    workItemKind: r.workItem.kind,
    workspaceDir: r.workspaceDir,
    attemptNumber: r.attemptNumber,
    retryAt: r.retryAt,
    reason: r.reason,
  }));

  const pending: PendingSnapshot[] = (state.pending ?? []).map((item) => ({
    issueId: item.id,
    issueIdentifier: item.identifier,
    issueTitle: item.title,
    issueUrl: item.url,
    issueLabels: item.labels,
    issueStateLabel: item.stateLabel,
    issueAssigneeName: getWorkItemAssigneeName(item),
    issueProjectName: getWorkItemProjectName(item),
    workItemKind: item.kind,
  }));

  return {
    running,
    retryQueue,
    pending,
    workspaces: Object.fromEntries(state.workspaces),
    lastPollAt: state.lastPollAt,
    isShuttingDown: state.isShuttingDown,
  };
}
