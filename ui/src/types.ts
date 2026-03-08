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

export type WorkerExitReason = "completed" | "stalled" | "max_turns" | "error" | "terminal" | "aborted";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface OutputLine {
  ts: number;
  type: "text" | "tool_use" | "tool_result" | "error" | "info";
  content: string;
}

export interface CompletedSession {
  workflowId?: string;
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

export interface StateSnapshot {
  running: RunningSnapshot[];
  retryQueue: RetrySnapshot[];
  pending: PendingSnapshot[];
  workspaces: Record<string, string>;
  lastPollAt: number;
  isShuttingDown: boolean;
  workflowId?: string;
}

export interface NotificationEvent {
  type: "agent_started" | "agent_finished" | "agent_errored";
  issueIdentifier: string;
  issueTitle: string;
  issueUrl?: string;
  timestamp: number;
  workflowId?: string;
  workflowName?: string;
  exitReason?: WorkerExitReason;
  turnCount?: number;
  error?: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  agent_started: boolean;
  agent_finished: boolean;
  agent_errored: boolean;
}

export interface WorkflowConfig {
  poll_interval_s: number;
  stall_timeout_s: number;
  tracker: {
    type: string;
    sensor: string;
    filter_labels?: string[];
    filter_states?: string[];
    filter_project?: string;
    filter_assignees?: string[];
    project_id?: string;
    project_name?: string;
    mode?: string;
    active_states?: string[];
    terminal_states?: string[];
  };
  agent: {
    model: string;
    max_turns: number;
    turn_timeout_s: number;
    max_retry_backoff_s: number;
    max_concurrency: number;
    permission_mode: string;
    allowed_tools?: string[];
    auth_method: string;
  };
  workspace: {
    repo_url?: string;
    cleanup_on_start: boolean;
    cleanup_on_terminal: boolean;
  };
  hooks: {
    after_create?: string;
    before_run?: string;
    after_run?: string;
    before_remove?: string;
    timeout_s: number;
  };
  policy: {
    max_concurrency?: number;
    allow_multiple_per_issue: boolean;
  };
}

export interface GlobalSettings {
  configDir: string;
  workspacesDir: string;
  dbPath: string;
  serverPort?: number;
  serverHost?: string;
  workflowsPath: string;
  repoUrlOverride?: string;
  debug: boolean;
}

export interface WorkflowSummary {
  snapshot: StateSnapshot;
  completed: CompletedSession[];
  config?: WorkflowConfig;
  name?: string;
  description?: string;
}
