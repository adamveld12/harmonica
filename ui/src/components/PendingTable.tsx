import type { PendingSnapshot } from "../types";

interface Props {
  pending: PendingSnapshot[];
}

export function PendingTable({ pending }: Props) {
  return (
    <>
      <h2>Pending ({pending.length})</h2>
      <table>
        <tbody>
          {pending.map((p) => (
            <tr key={p.issueId}>
              <td style={{ padding: "8px 12px" }}>
                <a className="issue-link" href={p.issueUrl} target="_blank" rel="noreferrer">
                  {p.issueIdentifier} - {p.issueTitle}
                </a>
                <span className="row-meta"> &nbsp;|&nbsp; {p.issueStateLabel}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
