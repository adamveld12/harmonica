import type { OutputLine, ConfigResponse } from "./types";

export async function fetchCompletedOutput(issueId: string): Promise<OutputLine[]> {
  const r = await fetch(`/api/v1/completed/${issueId}/output`);
  if (!r.ok) throw new Error(`output fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchWorkflowConfig(id: string): Promise<ConfigResponse> {
  const r = await fetch(`/api/v1/workflows/${id}/config`);
  if (!r.ok) throw new Error(`workflow config fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchWorkflowLiveOutput(
  id: string,
  issueId: string,
  since: number,
): Promise<{ lines: OutputLine[]; nextIndex: number }> {
  const r = await fetch(`/api/v1/workflows/${id}/${issueId}/output?since=${since}`);
  if (!r.ok) throw new Error(`workflow output fetch failed: ${r.status}`);
  return r.json();
}

export async function stopWorker(workflowId: string, itemId: string): Promise<boolean> {
  const res = await fetch(`/api/v1/workflows/${workflowId}/${itemId}/stop`, { method: "POST" });
  return res.ok;
}
