import type { NormalizedIssue, NormalizedProject, NormalizedMilestone, IssueState } from "../../types.ts";
import type { StateClassificationConfig } from "../sensor/types.ts";

interface LinearStateNode {
  id: string;
  name: string;
  type: string;
}

export interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  state: LinearStateNode;
  labels: { nodes: Array<{ name: string }> };
  assignee: { id: string; displayName: string } | null;
  project: { id: string; name: string } | null;
  team: { id: string; key: string };
}

interface LinearMilestoneNode {
  id: string;
  name: string;
  description: string | null;
  status: string;
  targetDate: string | null;
  progress: number;
}

export interface LinearProjectNode {
  id: string;
  name: string;
  slugId: string;
  description: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  status: { name: string; description: string | null; color: string } | null;
  health: string | null;
  lead: { id: string; displayName: string } | null;
  members: { nodes: Array<{ id: string }> };
  startDate: string | null;
  targetDate: string | null;
  progress: number;
  projectMilestones: { nodes: LinearMilestoneNode[] };
  teams: { nodes: Array<{ id: string; key: string }> };
  labels: { nodes: Array<{ name: string }> };
}

export interface LinearProjectListNode {
  id: string;
  name: string;
  slugId: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  status: { name: string } | null;
  labels: { nodes: Array<{ name: string }> };
  teams: { nodes: Array<{ id: string; key: string }> };
}

export interface LinearPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

function mapIssueState(stateType: string, stateName: string, config: StateClassificationConfig): IssueState {
  if (config.terminal_states?.includes(stateName)) return "terminal";
  if (config.active_states?.includes(stateName)) return "active";
  if (stateType === "completed" || stateType === "cancelled") return "terminal";
  if (stateType === "started") return "active";
  return "non_active";
}

function mapProjectState(statusName: string, config: StateClassificationConfig): IssueState {
  if (config.terminal_states?.includes(statusName)) return "terminal";
  if (config.active_states?.includes(statusName)) return "active";
  const lower = statusName.toLowerCase();
  if (lower === "completed" || lower === "cancelled" || lower === "canceled") return "terminal";
  if (lower === "started") return "active";
  return "non_active";
}

export function normalizeProjectListItem(
  node: LinearProjectListNode,
  config: StateClassificationConfig,
): NormalizedProject {
  const statusName = node.status?.name ?? "planned";
  return {
    kind: "project",
    id: node.id,
    identifier: node.slugId,
    title: node.name,
    description: null,
    state: mapProjectState(statusName, config),
    stateLabel: statusName,
    labels: node.labels.nodes.map((l) => l.name),
    url: node.url,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
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

export function normalizeIssue(node: LinearIssueNode, config: StateClassificationConfig): NormalizedIssue {
  return {
    kind: "issue",
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    description: node.description,
    state: mapIssueState(node.state.type, node.state.name, config),
    stateLabel: node.state.name,
    labels: node.labels.nodes.map((l) => l.name),
    assigneeId: node.assignee?.id ?? null,
    assigneeName: node.assignee?.displayName ?? null,
    projectName: node.project?.name ?? null,
    url: node.url,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

export function normalizeProject(node: LinearProjectNode, config: StateClassificationConfig): NormalizedProject {
  const statusName = node.status?.name ?? "planned";
  const milestones: NormalizedMilestone[] = node.projectMilestones.nodes.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    status: m.status,
    progress: m.progress,
    targetDate: m.targetDate,
  }));

  return {
    kind: "project",
    id: node.id,
    identifier: node.slugId,
    title: node.name,
    description: node.description,
    state: mapProjectState(statusName, config),
    stateLabel: statusName,
    labels: node.labels.nodes.map((l) => l.name),
    url: node.url,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    status: statusName,
    health: node.health,
    leadName: node.lead?.displayName ?? null,
    memberCount: node.members.nodes.length,
    milestones,
    startDate: node.startDate,
    targetDate: node.targetDate,
    progress: node.progress,
  };
}
