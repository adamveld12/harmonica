/**
 * Harmonica – shared domain types.
 * Every module imports from here; keep this file free of side-effects.
 */

// ---------------------------------------------------------------------------
// Workflow orchestration
// ---------------------------------------------------------------------------

export type WorkflowId = string;

// ---------------------------------------------------------------------------
// Issue tracker
// ---------------------------------------------------------------------------

/** Normalised view of a tracker issue (Linear today, extensible later). */
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

/** A single milestone within a Linear project. */
export interface NormalizedMilestone {
  id: string;
  name: string;
  description: string | null;
  status: string;
  progress: number;
  targetDate: string | null;
}

/** Normalised view of a Linear project. */
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
  /** Always empty — Linear projects don't have labels. */
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

/**
 * Canonical three-way state classification used by the orchestrator.
 *  - active      → item should be / is being worked on
 *  - terminal    → item is done / cancelled; workspace should be removed
 *  - non_active  → item exists but is not ready (e.g. backlog, on hold)
 */
export type IssueState = "active" | "terminal" | "non_active";

// ---------------------------------------------------------------------------
// Orchestrator state
// ---------------------------------------------------------------------------

/** Entry for a work item that currently has a running agent session. */
export interface RunningEntry {
  workItem: WorkItem;
  workspaceDir: string;
  /** Claude session ID (populated once the first message is received). */
  sessionId: string | null;
  turnCount: number;
  attemptNumber: number;
  startedAt: number;
  /** Updated on every agent event; used for stall detection. */
  lastEventAt: number;
  /** GitHub PR URL extracted from agent output, if found. */
  prUrl: string | null;
  abortController: AbortController;
  /** The worker's async promise; resolved / rejected when the worker exits. */
  promise: Promise<WorkerResult>;
}

/** Entry in the exponential-backoff retry queue. */
export interface RetryEntry {
  workItem: WorkItem;
  workspaceDir: string | null;
  attemptNumber: number;
  /** Unix timestamp (ms) when this entry becomes eligible to re-run. */
  retryAt: number;
  reason: string;
  /** Preserved across retries so the new turn can continue the session. */
  lastSessionId: string | null;
}

/** Top-level mutable state owned exclusively by the orchestrator. */
export interface OrchestratorState {
  /** itemId → RunningEntry */
  running: Map<string, RunningEntry>;
  retryQueue: RetryEntry[];
  /** itemId → absolute workspace directory path */
  workspaces: Map<string, string>;
  /** itemId → live output lines (drained on worker completion) */
  outputLogs: Map<string, OutputLine[]>;
  lastPollAt: number;
  /** Set to true during graceful shutdown; prevents new work from starting. */
  isShuttingDown: boolean;
  /** itemId → timestamp (ms) of last completion, for cooldown enforcement. */
  completedAt: Map<string, number>;
  /** Active items waiting for a concurrency slot. */
  pending: WorkItem[];
}

// ---------------------------------------------------------------------------
// Output / completed sessions
// ---------------------------------------------------------------------------

/** A single line of agent output captured during a run. */
export interface OutputLine {
  ts: number;
  type: "text" | "tool_use" | "tool_result" | "error" | "info";
  content: string;
}

/** A fully-finished session with all metadata and output, persisted to SQLite. */
export interface CompletedSession {
  workflowId?: WorkflowId;
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  issueUrl: string;
  issueLabels: string[];
  issueStateLabel: string;
  issueAssigneeName: string | null;
  issueProjectName: string | null;
  workItemKind?: "issue" | "project";
  workItemExtra?: Record<string, unknown>;
  sessionId: string | null;
  exitReason: WorkerExitReason;
  turnCount: number;
  tokenUsage: TokenUsage;
  attemptNumber: number;
  startedAt: number;
  completedAt: number;
  outputLines: OutputLine[];
  error?: string;
  prUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Agent / worker
// ---------------------------------------------------------------------------

/** Reason a worker exited. */
export type WorkerExitReason =
  | "completed" // agent indicated it finished
  | "stalled" // no events received for stall_timeout_s, or per-turn timeout
  | "max_turns" // reached agent.max_turns
  | "error" // unhandled error
  | "terminal" // issue transitioned to a terminal state mid-run
  | "aborted"; // manually cancelled, shutdown, or item removed from candidates

/** Summary returned by a worker when it finishes. */
export interface WorkerResult {
  workItem: WorkItem;
  exitReason: WorkerExitReason;
  sessionId: string | null;
  turnCount: number;
  tokenUsage: TokenUsage;
  error?: string;
}

/** Accumulated token counts for an agent session. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

// ---------------------------------------------------------------------------
// Agent runner abstraction
// ---------------------------------------------------------------------------

/** A single event streamed from the agent runner. */
export type AgentEvent =
  | { type: "session_id"; sessionId: string }
  | { type: "text"; content: string }
  | { type: "tool_use"; toolName: string; toolInput: unknown }
  | { type: "tool_result"; toolName: string; content: string }
  | { type: "usage"; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
  | { type: "error"; error: string }
  | { type: "done" };

/** Options passed to AgentRunner.run() for a single turn. */
export interface RunTurnOptions {
  prompt: string;
  workspaceDir: string;
  sessionId: string | null;
  abortController: AbortController;
  mcpServers?: Record<string, McpServerConfig>;
}

/** Minimal MCP server configuration. */
export interface McpServerConfig {
  type: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

/** Factory that creates fresh MCP server configs per turn (avoids Protocol reuse). */
export type McpServerFactory = () => Record<string, McpServerConfig>;

/** Abstract runner interface; swappable in tests. */
export interface AgentRunner {
  run(options: RunTurnOptions): AsyncIterable<AgentEvent>;
}

// ---------------------------------------------------------------------------
// Workflow / config
// ---------------------------------------------------------------------------

/** Parsed workflow representation. */
export interface WorkflowConfig {
  /** Raw file content (kept for hashing / change detection). */
  raw: string;
  /** Parsed YAML frontmatter. */
  frontmatter: Record<string, unknown>;
  /** Liquid template string from the body of the file. */
  promptTemplate: string;
  loadedAt: number;
  /** Human-readable display name from frontmatter (optional). */
  name?: string;
  /** Short description from frontmatter (optional). */
  description?: string;
}

/** Variables available when rendering the Liquid prompt template. */
export interface PromptVariables {
  issue: NormalizedIssue | null; // populated when mode=issues
  project: NormalizedProject | null; // populated when mode=projects
  item: WorkItem; // always populated (generic access)
  attempt: number;
  workspace_dir: string;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export type HookName = "after_create" | "before_run" | "after_run" | "before_remove";

export interface HookContext {
  issueId: string;
  issueIdentifier: string;
  workspaceDir: string;
  sessionId?: string | null;
  repoUrl?: string;
  workItem: WorkItem;
  attempt: number;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationEvent {
  type: "agent_started" | "agent_finished" | "agent_errored";
  issueIdentifier: string;
  issueTitle: string;
  issueUrl?: string;
  timestamp: number;
  workflowId?: WorkflowId;
  workflowName?: string;
  /** Only present on agent_finished */
  exitReason?: WorkerExitReason;
  turnCount?: number;
  /** Only present on agent_errored */
  error?: string;
}

// ---------------------------------------------------------------------------
// WorkItem helper functions
// ---------------------------------------------------------------------------

/** Returns the assignee name for an issue or the lead name for a project. */
export function getWorkItemAssigneeName(item: WorkItem): string | null {
  return item.kind === "issue" ? item.assigneeName : item.leadName;
}

/** Returns the project name for an issue; always null for a project work item. */
export function getWorkItemProjectName(item: WorkItem): string | null {
  return item.kind === "issue" ? item.projectName : null;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

export interface PendingSnapshot {
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  issueUrl: string;
  issueLabels: string[];
  issueStateLabel: string;
  issueAssigneeName: string | null;
  issueProjectName: string | null;
  workItemKind?: "issue" | "project";
}

/** Payload returned by GET /api/v1/state */
export interface StateSnapshot {
  running: RunningSnapshot[];
  retryQueue: RetrySnapshot[];
  pending: PendingSnapshot[];
  workspaces: Record<string, string>;
  lastPollAt: number;
  isShuttingDown: boolean;
  workflowId?: WorkflowId;
}

export interface RunningSnapshot {
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  issueUrl: string;
  issueLabels: string[];
  issueStateLabel: string;
  issueAssigneeName: string | null;
  issueProjectName: string | null;
  workItemKind?: "issue" | "project";
  sessionId: string | null;
  turnCount: number;
  attemptNumber: number;
  startedAt: number;
  lastEventAt: number;
  workspaceDir: string;
  /** GitHub PR URL extracted from agent output, if found. */
  prUrl?: string | null;
}

export interface RetrySnapshot {
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  issueUrl: string;
  issueLabels: string[];
  issueStateLabel: string;
  issueAssigneeName: string | null;
  issueProjectName: string | null;
  workItemKind?: "issue" | "project";
  workspaceDir: string | null;
  attemptNumber: number;
  retryAt: number;
  reason: string;
}
