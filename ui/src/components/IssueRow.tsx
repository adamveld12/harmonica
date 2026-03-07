import { useState } from "react";

interface Props {
  identifier: string;
  title: string;
  url: string;
  meta: React.ReactNode;
  children: (open: boolean) => React.ReactNode;
}

export function IssueRow({ identifier, title, url, meta, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <tr>
      <td>
        <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary>
            <a className="issue-link" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              {identifier} - {title}
            </a>
            <span className="row-meta">{meta}</span>
          </summary>
          {children(open)}
        </details>
      </td>
    </tr>
  );
}
