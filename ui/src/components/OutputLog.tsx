import { useState, useEffect, useRef } from "react";
import type { OutputLine } from "../types";
import { fetchWorkflowLiveOutput, fetchCompletedOutput } from "../api";

interface Props {
  issueId: string;
  workflowId: string;
  live: boolean;
  open: boolean;
}

function fmt(ts: number): string {
  return new Date(ts).toISOString().slice(11, 19);
}

export function OutputLog({ issueId, workflowId, live, open }: Props) {
  const [lines, setLines] = useState<OutputLine[]>([]);
  const nextIndexRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    if (!live) {
      if (loadedRef.current) return;
      loadedRef.current = true;
      fetchCompletedOutput(issueId).then(setLines).catch(() => {});
      return;
    }

    let active = true;
    nextIndexRef.current = 0;

    async function poll() {
      if (!active) return;
      try {
        const data = await fetchWorkflowLiveOutput(workflowId, issueId, nextIndexRef.current);
        if (data.lines.length > 0) {
          nextIndexRef.current = data.nextIndex;
          setLines(prev => [...prev, ...data.lines]);
        }
      } catch {}
      if (active) setTimeout(poll, 2000);
    }

    poll();
    return () => { active = false; };
  }, [issueId, workflowId, live, open]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 8;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="output-log" ref={logRef}>
      {lines.map((line, i) => (
        <div key={i} className={`output-line output-line-${line.type}`}>
          [{fmt(line.ts)}] {line.content}
        </div>
      ))}
    </div>
  );
}
