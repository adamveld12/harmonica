import { Database } from "bun:sqlite";
import type { CompletedSession, OutputLine } from "../types.ts";

interface CompletedSessionRow {
  id: number;
  workflow_id: string | null;
  issue_id: string;
  issue_identifier: string;
  issue_title: string;
  issue_url: string;
  issue_labels: string;
  issue_state_label: string;
  issue_assignee_name: string | null;
  issue_project_name: string | null;
  work_item_kind: string | null;
  work_item_extra: string | null;
  session_id: string | null;
  exit_reason: string;
  turn_count: number;
  token_usage: string;
  attempt_number: number;
  started_at: number;
  completed_at: number;
  output_lines: string;
  error: string | null;
  pr_url: string | null;
}

export class HarmonicaDB {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode=WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS completed_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT DEFAULT 'default',
        issue_id TEXT NOT NULL,
        issue_identifier TEXT NOT NULL,
        issue_title TEXT NOT NULL,
        issue_url TEXT NOT NULL,
        issue_labels TEXT NOT NULL,
        issue_state_label TEXT NOT NULL,
        issue_assignee_name TEXT,
        issue_project_name TEXT,
        work_item_kind TEXT DEFAULT 'issue',
        work_item_extra TEXT DEFAULT '{}',
        session_id TEXT,
        exit_reason TEXT NOT NULL,
        turn_count INTEGER NOT NULL,
        token_usage TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER NOT NULL,
        output_lines TEXT NOT NULL,
        error TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    // Add workflow_id to existing databases that predate this column
    try {
      this.db.exec(`ALTER TABLE completed_sessions ADD COLUMN workflow_id TEXT DEFAULT 'default'`);
    } catch {
      // Column already exists — safe to ignore
    }
    // Add work_item_kind and work_item_extra for project-mode support
    try {
      this.db.exec(`ALTER TABLE completed_sessions ADD COLUMN work_item_kind TEXT DEFAULT 'issue'`);
    } catch {
      // Column already exists — safe to ignore
    }
    try {
      this.db.exec(`ALTER TABLE completed_sessions ADD COLUMN work_item_extra TEXT DEFAULT '{}'`);
    } catch {
      // Column already exists — safe to ignore
    }
    try {
      this.db.exec(`ALTER TABLE completed_sessions ADD COLUMN pr_url TEXT`);
    } catch {
      // Column already exists — safe to ignore
    }
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_workflow_id ON completed_sessions (workflow_id)`);
  }

  insertSession(session: CompletedSession, workflowId?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO completed_sessions (
        workflow_id, issue_id, issue_identifier, issue_title, issue_url,
        issue_labels, issue_state_label, issue_assignee_name, issue_project_name,
        work_item_kind, work_item_extra,
        session_id, exit_reason, turn_count, token_usage,
        attempt_number, started_at, completed_at, output_lines, error, pr_url
      ) VALUES (
        $workflow_id, $issue_id, $issue_identifier, $issue_title, $issue_url,
        $issue_labels, $issue_state_label, $issue_assignee_name, $issue_project_name,
        $work_item_kind, $work_item_extra,
        $session_id, $exit_reason, $turn_count, $token_usage,
        $attempt_number, $started_at, $completed_at, $output_lines, $error, $pr_url
      )
    `);
    stmt.run({
      $workflow_id: workflowId ?? session.workflowId ?? "default",
      $issue_id: session.issueId,
      $issue_identifier: session.issueIdentifier,
      $issue_title: session.issueTitle,
      $issue_url: session.issueUrl,
      $issue_labels: JSON.stringify(session.issueLabels),
      $issue_state_label: session.issueStateLabel,
      $issue_assignee_name: session.issueAssigneeName,
      $issue_project_name: session.issueProjectName,
      $work_item_kind: session.workItemKind ?? "issue",
      $work_item_extra: JSON.stringify(session.workItemExtra ?? {}),
      $session_id: session.sessionId,
      $exit_reason: session.exitReason,
      $turn_count: session.turnCount,
      $token_usage: JSON.stringify(session.tokenUsage),
      $attempt_number: session.attemptNumber,
      $started_at: session.startedAt,
      $completed_at: session.completedAt,
      $output_lines: JSON.stringify(session.outputLines),
      $error: session.error ?? null,
      $pr_url: session.prUrl ?? null,
    });
  }

  listCompleted(limit = 50, workflowId?: string): CompletedSession[] {
    let rows: CompletedSessionRow[];
    if (workflowId) {
      rows = this.db.prepare(
        "SELECT * FROM completed_sessions WHERE workflow_id = ? ORDER BY completed_at DESC LIMIT ?"
      ).all(workflowId, limit) as CompletedSessionRow[];
    } else {
      rows = this.db.prepare(
        "SELECT * FROM completed_sessions ORDER BY completed_at DESC LIMIT ?"
      ).all(limit) as CompletedSessionRow[];
    }
    return rows.map(rowToSession);
  }

  getSessionOutput(issueId: string, workflowId?: string): OutputLine[] {
    let row: { output_lines: string } | null;
    if (workflowId) {
      row = this.db.prepare(
        "SELECT output_lines FROM completed_sessions WHERE issue_id = ? AND workflow_id = ? ORDER BY completed_at DESC LIMIT 1"
      ).get(issueId, workflowId) as { output_lines: string } | null;
    } else {
      row = this.db.prepare(
        "SELECT output_lines FROM completed_sessions WHERE issue_id = ? ORDER BY completed_at DESC LIMIT 1"
      ).get(issueId) as { output_lines: string } | null;
    }
    if (!row) return [];
    return JSON.parse(row.output_lines) as OutputLine[];
  }

  close(): void {
    this.db.close();
  }
}

function rowToSession(row: CompletedSessionRow): CompletedSession {
  return {
    workflowId: row.workflow_id ?? undefined,
    issueId: row.issue_id,
    issueIdentifier: row.issue_identifier,
    issueTitle: row.issue_title,
    issueUrl: row.issue_url,
    issueLabels: JSON.parse(row.issue_labels),
    issueStateLabel: row.issue_state_label,
    issueAssigneeName: row.issue_assignee_name,
    issueProjectName: row.issue_project_name,
    workItemKind: (row.work_item_kind ?? "issue") as "issue" | "project",
    workItemExtra: row.work_item_extra ? JSON.parse(row.work_item_extra) : undefined,
    sessionId: row.session_id,
    exitReason: row.exit_reason as CompletedSession["exitReason"],
    turnCount: row.turn_count,
    tokenUsage: JSON.parse(row.token_usage),
    attemptNumber: row.attempt_number,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    outputLines: JSON.parse(row.output_lines),
    error: row.error ?? undefined,
    prUrl: row.pr_url ?? null,
  };
}
