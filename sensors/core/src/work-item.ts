/**
 * Canonical work item types shared by all sensor implementations.
 */

/**
 * Canonical three-way state classification used by the orchestrator.
 *  - active      → item should be / is being worked on
 *  - terminal    → item is done / cancelled; workspace should be removed
 *  - non_active  → item exists but is not ready (e.g. backlog, on hold)
 */
export type IssueState = "active" | "terminal" | "non_active";

/** Normalised view of a tracker issue. */
export interface NormalizedIssue {
  kind: "issue";
  /** Opaque UUID from the tracker. */
  id: string;
  /** Human-readable identifier, e.g. "ENG-123". */
  identifier: string;
  title: string;
  description: string | null;
  state: IssueState;
  /** Raw state name from the tracker (e.g. "In Progress"). */
  stateLabel: string;
  /** Label names attached to the issue. */
  labels: string[];
  assigneeId: string | null;
  assigneeName: string | null;
  projectName: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/** A single milestone within a project. */
export interface NormalizedMilestone {
  id: string;
  name: string;
  description: string | null;
  status: string;
  progress: number;
  targetDate: string | null;
}

/** Normalised view of a project. */
export interface NormalizedProject {
  kind: "project";
  /** Opaque UUID from the tracker. */
  id: string;
  /** Project slug identifier. */
  identifier: string;
  /** Project name. */
  title: string;
  description: string | null;
  state: IssueState;
  /** Raw status name from the tracker (e.g. "started"). */
  stateLabel: string;
  labels: string[];
  url: string;
  createdAt: string;
  updatedAt: string;
  // Project-specific fields
  status: string;
  health: string | null;
  leadName: string | null;
  memberCount: number;
  milestones: NormalizedMilestone[];
  startDate: string | null;
  targetDate: string | null;
  progress: number;
}

/** Discriminated union — either an issue or a project. */
export type WorkItem = NormalizedIssue | NormalizedProject;

/** Returns the assignee name for an issue or the lead name for a project. */
export function getWorkItemAssigneeName(item: WorkItem): string | null {
  return item.kind === "issue" ? item.assigneeName : item.leadName;
}

/** Returns the project name for an issue; always null for a project work item. */
export function getWorkItemProjectName(item: WorkItem): string | null {
  return item.kind === "issue" ? item.projectName : null;
}
