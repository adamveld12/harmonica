import type { CompletedSession } from "../types";
import { IssueRow } from "./IssueRow";
import { OutputLog } from "./OutputLog";
import { fmtTimestamp } from "../utils";

interface Props {
  completed: CompletedSession[];
  workflowId: string;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function CompletedTable({ completed, workflowId }: Props) {
  return (
    <>
      <h2>Completed ({completed.length})</h2>
      <table>
        <tbody>
          {completed.length === 0 ? (
            <tr><td className="empty">No completed sessions</td></tr>
          ) : completed.map(c => (
            <IssueRow
              key={`${c.issueId}-${c.completedAt}`}
              identifier={c.issueIdentifier}
              title={c.issueTitle}
              url={c.issueUrl}
              meta={
                <>
                  <span className={`exit-${c.exitReason}`}>{c.exitReason}</span>
                  &nbsp;|&nbsp; {c.turnCount} turns
                  &nbsp;|&nbsp; {fmtDuration(c.completedAt - c.startedAt)}
                  &nbsp;|&nbsp; {fmtTimestamp(c.completedAt)}
                </>
              }
            >
              {(open) => (
                <>
                  <div className="details-grid">
                    <div><strong>Status:</strong> {c.issueStateLabel}</div>
                    <div><strong>Assignee:</strong> {c.issueAssigneeName ?? "-"}</div>
                    <div><strong>Labels:</strong> {c.issueLabels.length ? c.issueLabels.join(", ") : "-"}</div>
                    <div><strong>Project:</strong> {c.issueProjectName ?? "-"}</div>
                    <div><strong>Attempt:</strong> {c.attemptNumber}</div>
                    <div><strong>Session:</strong> {c.sessionId ?? "-"}</div>
                    <div><strong>Tokens in/out:</strong> {c.tokenUsage.inputTokens}/{c.tokenUsage.outputTokens}</div>
                    {c.error && <div><strong>Error:</strong> <span style={{ color: "#f87171" }}>{c.error}</span></div>}
                    {c.prUrl && (
                      <div><strong>PR:</strong>{" "}
                        <a className="pr-link" href={c.prUrl} target="_blank" rel="noreferrer">
                          {c.prUrl.replace(/^https:\/\/github\.com\//, "")}
                        </a>
                      </div>
                    )}
                  </div>
                  <OutputLog issueId={c.issueId} workflowId={workflowId} live={false} open={open} />
                </>
              )}
            </IssueRow>
          ))}
        </tbody>
      </table>
    </>
  );
}
