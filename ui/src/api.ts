import type { StateSnapshot, CompletedSession, OutputLine, ConfigResponse, WorkflowListItem } from "./types";

export async function fetchState(): Promise<StateSnapshot> {
  const r = await fetch("/api/v1/state");
  if (!r.ok) throw new Error(`state fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchCompleted(): Promise<CompletedSession[]> {
  const r = await fetch("/api/v1/completed");
  if (!r.ok) throw new Error(`completed fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchConfig(): Promise<ConfigResponse> {
  const r = await fetch("/api/v1/config");
  if (!r.ok) throw new Error(`config fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchLiveOutput(issueId: string, since: number): Promise<{ lines: OutputLine[]; nextIndex: number }> {
  const r = await fetch(`/api/v1/${issueId}/output?since=${since}`);
  if (!r.ok) throw new Error(`output fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchCompletedOutput(issueId: string): Promise<OutputLine[]> {
  const r = await fetch(`/api/v1/completed/${issueId}/output`);
  if (!r.ok) throw new Error(`output fetch failed: ${r.status}`);
  return r.json();
}

export async function triggerRefresh(): Promise<void> {
  await fetch("/api/v1/refresh", { method: "POST" });
}

export async function fetchWorkflows(): Promise<WorkflowListItem[]> {
  const r = await fetch("/api/v1/workflows");
  if (!r.ok) throw new Error(`workflows fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchWorkflowState(id: string): Promise<StateSnapshot> {
  const r = await fetch(`/api/v1/workflows/${id}/state`);
  if (!r.ok) throw new Error(`workflow state fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchWorkflowConfig(id: string): Promise<ConfigResponse> {
  const r = await fetch(`/api/v1/workflows/${id}/config`);
  if (!r.ok) throw new Error(`workflow config fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchWorkflowCompleted(id: string): Promise<CompletedSession[]> {
  const r = await fetch(`/api/v1/workflows/${id}/completed`);
  if (!r.ok) throw new Error(`workflow completed fetch failed: ${r.status}`);
  return r.json();
}

export async function triggerWorkflowRefresh(id: string): Promise<void> {
  await fetch(`/api/v1/workflows/${id}/refresh`, { method: "POST" });
}

export async function fetchWorkflowLiveOutput(id: string, issueId: string, since: number): Promise<{ lines: OutputLine[]; nextIndex: number }> {
  const r = await fetch(`/api/v1/workflows/${id}/${issueId}/output?since=${since}`);
  if (!r.ok) throw new Error(`workflow output fetch failed: ${r.status}`);
  return r.json();
}

export async function stopWorker(workflowId: string, itemId: string): Promise<boolean> {
  const res = await fetch(`/api/v1/workflows/${workflowId}/${itemId}/stop`, { method: "POST" });
  return res.ok;
}
