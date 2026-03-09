import type { NormalizedIssue, NormalizedProject, IssueState } from "../../types.ts";
import type { StateClassificationConfig } from "../sensor/types.ts";
import type { TrackerConfig } from "../../config/schema.ts";

// ---------------------------------------------------------------------------
// Raw GitHub API shapes
// ---------------------------------------------------------------------------

export interface GitHubIssueNode {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  milestone: { title: string } | null;
  // Present on PRs fetched via /issues endpoint — used to filter them out
  pull_request?: unknown;
}

export interface GitHubPRNode {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft: boolean;
  merged_at: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  base: { ref: string };
  milestone: { title: string } | null;
}

export interface GitHubProjectItemNode {
  id: string;
  title: string;
  body: string | null;
  status: string | null;
  url: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// State classification
// ---------------------------------------------------------------------------

export function mapGitHubIssueState(_stateName: string, config: StateClassificationConfig): IssueState {
  // GitHub issues: open = active, closed = terminal
  // active_states/terminal_states overrides are respected if configured
  if (config.terminal_states?.includes(_stateName)) return "terminal";
  if (config.active_states?.includes(_stateName)) return "active";
  if (_stateName === "open") return "active";
  if (_stateName === "closed") return "terminal";
  return "non_active";
}

export function mapGitHubPRState(
  state: "open" | "closed",
  draft: boolean,
  mergedAt: string | null,
  config: StateClassificationConfig,
): IssueState {
  const stateName = mergedAt ? "merged" : state;
  if (config.terminal_states?.includes(stateName)) return "terminal";
  if (config.active_states?.includes(stateName)) return "active";
  if (state === "open" && draft) return "non_active";
  if (state === "open") return "active";
  return "terminal"; // closed (merged or not)
}

export function mapGitHubProjectState(status: string | null, config: StateClassificationConfig): IssueState {
  const s = status ?? "unknown";
  if (config.terminal_states?.includes(s)) return "terminal";
  if (config.active_states?.includes(s)) return "active";
  return "non_active";
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeGitHubIssue(
  node: GitHubIssueNode,
  owner: string,
  repo: string,
  config: StateClassificationConfig,
): NormalizedIssue {
  return {
    kind: "issue",
    id: String(node.number),
    identifier: `${owner}/${repo}#${node.number}`,
    title: node.title,
    description: node.body,
    state: mapGitHubIssueState(node.state, config),
    stateLabel: node.state,
    labels: node.labels.map((l) => l.name),
    assigneeId: node.assignees[0]?.login ?? null,
    assigneeName: node.assignees[0]?.login ?? null,
    projectName: node.milestone?.title ?? null,
    url: node.html_url,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
  };
}

export function normalizeGitHubPR(
  node: GitHubPRNode,
  owner: string,
  repo: string,
  config: StateClassificationConfig,
): NormalizedIssue {
  return {
    kind: "issue",
    id: String(node.number),
    identifier: `${owner}/${repo}#${node.number}`,
    title: node.title,
    description: node.body,
    state: mapGitHubPRState(node.state, node.draft, node.merged_at, config),
    stateLabel: node.merged_at ? "merged" : node.state,
    labels: node.labels.map((l) => l.name),
    assigneeId: node.assignees[0]?.login ?? null,
    assigneeName: node.assignees[0]?.login ?? null,
    projectName: node.milestone?.title ?? null,
    url: node.html_url,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
  };
}

export function normalizeGitHubProjectItem(
  node: GitHubProjectItemNode,
  owner: string,
  config: StateClassificationConfig,
): NormalizedProject {
  const statusName = node.status ?? "unknown";
  return {
    kind: "project",
    id: node.id,
    identifier: `${owner}/project-item-${node.id}`,
    title: node.title,
    description: node.body,
    state: mapGitHubProjectState(statusName, config),
    stateLabel: statusName,
    labels: [],
    url: node.url,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
    status: statusName,
    health: null,
    leadName: null,
    memberCount: 0,
    milestones: [],
    startDate: null,
    targetDate: null,
    progress: 0,
  };
}

// ---------------------------------------------------------------------------
// Filter matching
// ---------------------------------------------------------------------------

export function matchesGitHubIssueFilters(node: GitHubIssueNode, config: TrackerConfig): boolean {
  if (config.filter_labels?.length) {
    const nodeLabels = node.labels.map((l) => l.name);
    if (!config.filter_labels.every((fl) => nodeLabels.includes(fl))) return false;
  }
  if (config.filter_assignees?.length) {
    const assigneeLogins = node.assignees.map((a) => a.login);
    if (!config.filter_assignees.some((fa) => assigneeLogins.includes(fa))) return false;
  }
  if (config.filter_milestone && node.milestone?.title !== config.filter_milestone) return false;
  return true;
}

export function matchesGitHubPRFilters(node: GitHubPRNode, config: TrackerConfig): boolean {
  if (config.filter_labels?.length) {
    const nodeLabels = node.labels.map((l) => l.name);
    if (!config.filter_labels.every((fl) => nodeLabels.includes(fl))) return false;
  }
  if (config.filter_assignees?.length) {
    const assigneeLogins = node.assignees.map((a) => a.login);
    if (!config.filter_assignees.some((fa) => assigneeLogins.includes(fa))) return false;
  }
  if (config.filter_base_branch && node.base.ref !== config.filter_base_branch) return false;
  if (config.filter_draft !== undefined && node.draft !== config.filter_draft) return false;
  if (config.filter_milestone && node.milestone?.title !== config.filter_milestone) return false;
  return true;
}

export function matchesGitHubProjectItemFilters(_node: GitHubProjectItemNode, _config: TrackerConfig): boolean {
  return true;
}
