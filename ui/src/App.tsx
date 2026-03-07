import { useEffect, useState } from "react";
import { useSSE } from "./useSSE";
import { useNotifications } from "./useNotifications";
import { fetchWorkflowConfig } from "./api";
import type { ConfigResponse } from "./types";
import { ConfigPanel } from "./components/ConfigPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { PendingTable } from "./components/PendingTable";
import { RunningTable } from "./components/RunningTable";
import { RetryTable } from "./components/RetryTable";
import { CompletedTable } from "./components/CompletedTable";
import "./styles/dashboard.css";

export function App() {
  const { workflows, connected, lastNotification } = useSSE();
  const { prefs, updatePrefs, requestPermission, permissionState } = useNotifications(lastNotification);

  const workflowIds = Object.keys(workflows).sort();
  const [preferredTab, setActiveTab] = useState<string | null>(null);

  // Derive active tab: use preferred if still valid, else fall back to first available
  const activeTab = preferredTab && workflowIds.includes(preferredTab) ? preferredTab : (workflowIds[0] ?? null);

  const [configs, setConfigs] = useState<Record<string, ConfigResponse>>({});

  // Fetch configs for any workflow we don't have yet
  useEffect(() => {
    for (const id of workflowIds) {
      if (!configs[id]) {
        fetchWorkflowConfig(id)
          .then((cfg) => setConfigs((prev) => ({ ...prev, [id]: cfg })))
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowIds.join(",")]);

  const active = activeTab ? workflows[activeTab] : null;
  const activeConfig = activeTab ? (configs[activeTab] ?? null) : null;
  const lastPoll = active?.snapshot ? new Date(active.snapshot.lastPollAt).toISOString() : "—";

  return (
    <div>
      <h1>Harmonica</h1>
      <p className="meta">
        <span className={connected ? "connected" : "disconnected"}>{connected ? "live" : "disconnected"}</span>
        {active?.snapshot && (
          <>
            &nbsp;|&nbsp; Last poll: {lastPoll}
            &nbsp;|&nbsp; Shutting down: {active.snapshot.isShuttingDown ? "true" : "false"}
          </>
        )}
      </p>

      <SettingsPanel
        prefs={prefs}
        updatePrefs={updatePrefs}
        permissionState={permissionState}
        requestPermission={requestPermission}
      />

      {workflowIds.length > 0 && (
        <div className="tab-bar">
          {workflowIds.map((id) => {
            const wf = workflows[id];
            const running = wf?.snapshot?.running?.length ?? 0;
            const retrying = wf?.snapshot?.retryQueue?.length ?? 0;
            const pending = wf?.snapshot?.pending?.length ?? 0;
            const badgeClass =
              running > 0
                ? "badge badge-ok"
                : retrying > 0
                  ? "badge badge-retry"
                  : pending > 0
                    ? "badge badge-pending"
                    : "badge badge-idle";
            const count = running > 0 ? running : retrying > 0 ? retrying : pending;
            return (
              <button
                key={id}
                className={`tab${activeTab === id ? " tab-active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                {wf?.name ?? id}
                {count > 0 && <span className={badgeClass}>{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {active && activeTab ? (
        <div className="tab-content">
          <div className="workflow-header">
            <h2>{active.name ?? activeTab}</h2>
            {active.description && <p className="workflow-description">{active.description}</p>}
            <ConfigPanel config={activeConfig} />
          </div>
          {(active.snapshot?.pending?.length ?? 0) > 0 && <PendingTable pending={active.snapshot!.pending} />}
          <RunningTable running={active.snapshot?.running ?? []} workflowId={activeTab} />
          <RetryTable retryQueue={active.snapshot?.retryQueue ?? []} />
          <CompletedTable completed={active.completed ?? []} workflowId={activeTab} />
        </div>
      ) : (
        <p className="meta">No workflows loaded.</p>
      )}
    </div>
  );
}
