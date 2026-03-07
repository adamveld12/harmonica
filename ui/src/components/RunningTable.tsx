import type { RunningSnapshot } from "../types";
import { IssueRow } from "./IssueRow";
import { OutputLog } from "./OutputLog";
import { stopWorker } from "../api";
import { fmtTimestamp } from "../utils";

interface Props {
  running: RunningSnapshot[];
  workflowId: string;
}

export function RunningTable({ running, workflowId }: Props) {
  return (
    <>
      <h2>Running ({running.length})</h2>
      <table>
        <tbody>
          {running.length === 0 ? (
            <tr>
              <td className="empty">No running workers</td>
            </tr>
          ) : (
            running.map((r) => (
              <IssueRow
                key={r.issueId}
                identifier={r.issueIdentifier}
                title={r.issueTitle}
                url={r.issueUrl}
                meta={
                  <>
                    Turn {r.turnCount} &nbsp;|&nbsp; Attempt {r.attemptNumber} &nbsp;|&nbsp; Session{" "}
                    {r.sessionId?.slice(0, 12) ?? "-"} &nbsp;|&nbsp;{" "}
                    <button
                      className="stop-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        stopWorker(workflowId, r.issueId);
                      }}
                    >
                      Stop
                    </button>
                  </>
                }
              >
                {(open) => (
                  <>
                    <div className="details-grid">
                      <div>
                        <strong>Status:</strong> {r.issueStateLabel}
                      </div>
                      <div>
                        <strong>Assignee:</strong> {r.issueAssigneeName ?? "-"}
                      </div>
                      <div>
                        <strong>Labels:</strong> {r.issueLabels.length ? r.issueLabels.join(", ") : "-"}
                      </div>
                      <div>
                        <strong>Project:</strong> {r.issueProjectName ?? "-"}
                      </div>
                      <div>
                        <strong>Workspace:</strong> {r.workspaceDir}
                      </div>
                      <div>
                        <strong>Started:</strong> {fmtTimestamp(r.startedAt)}
                      </div>
                      <div>
                        <strong>Last Event:</strong> {fmtTimestamp(r.lastEventAt)}
                      </div>
                      <div>
                        <strong>Session:</strong> {r.sessionId ?? "-"}
                      </div>
                      {r.prUrl && (
                        <div>
                          <strong>PR:</strong>{" "}
                          <a className="pr-link" href={r.prUrl} target="_blank" rel="noreferrer">
                            {r.prUrl.replace(/^https:\/\/github\.com\//, "")}
                          </a>
                        </div>
                      )}
                    </div>
                    <OutputLog issueId={r.issueId} workflowId={workflowId} live={true} open={open} />
                  </>
                )}
              </IssueRow>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
