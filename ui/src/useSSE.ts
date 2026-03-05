import { useState, useEffect, useRef } from "react";
import type { NotificationEvent, WorkflowSummary } from "./types";

export interface SSEState {
  workflows: Record<string, WorkflowSummary>;
  connected: boolean;
  lastNotification: NotificationEvent | null;
}

export function useSSE(): SSEState {
  const [state, setState] = useState<SSEState>({ workflows: {}, connected: false, lastNotification: null });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource("/api/v1/events");
      esRef.current = es;

      es.addEventListener("state", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          const workflows: Record<string, WorkflowSummary> = data.workflows ?? {};
          setState(s => ({ ...s, workflows, connected: true }));
        } catch {}
      });

      es.addEventListener("notification", (e) => {
        try {
          const event = JSON.parse((e as MessageEvent).data) as NotificationEvent;
          setState(s => ({ ...s, lastNotification: event }));
        } catch {}
      });

      es.onopen = () => setState(s => ({ ...s, connected: true }));
      es.onerror = () => setState(s => ({ ...s, connected: false }));
    }

    connect();
    return () => { esRef.current?.close(); };
  }, []);

  return state;
}
