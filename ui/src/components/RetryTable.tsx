import type { RetrySnapshot } from "../types";
import { IssueRow } from "./IssueRow";
import { fmtTimestamp } from "../utils";

interface Props {
  retryQueue: RetrySnapshot[];
}

export function RetryTable({ retryQueue }: Props) {
  return (
    <>
      <h2>Retry Queue ({retryQueue.length})</h2>
      <table>
        <tbody>
          {retryQueue.length === 0 ? (
            <tr>
              <td className="empty">No pending retries</td>
            </tr>
          ) : (
            retryQueue.map((r) => (
              <IssueRow
                key={r.issueId}
                identifier={r.issueIdentifier}
                title={r.issueTitle}
                url={r.issueUrl}
                meta={
                  <>
                    Attempt {r.attemptNumber} &nbsp;|&nbsp; Reason: {r.reason} &nbsp;|&nbsp; Retry:{" "}
                    {fmtTimestamp(r.retryAt)}
                  </>
                }
              >
                {() => (
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
                      <strong>Workspace:</strong> {r.workspaceDir ?? "-"}
                    </div>
                    <div>
                      <strong>Retry At:</strong> {fmtTimestamp(r.retryAt)}
                    </div>
                    <div>
                      <strong>Reason:</strong> {r.reason}
                    </div>
                  </div>
                )}
              </IssueRow>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
