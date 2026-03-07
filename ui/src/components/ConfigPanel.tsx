import type { ConfigResponse } from "../types";

interface Props {
  config: ConfigResponse | null;
}

export function ConfigPanel({ config }: Props) {
  if (!config) return null;
  return (
    <details className="settings-panel">
      <summary><span>Configuration</span></summary>
      <div className="config-sections">
        <h3 className="config-section-header">Agent</h3>
        <div className="config-grid">
          <div><strong>Model:</strong> {config.model}</div>
          <div><strong>Max Turns:</strong> {config.max_turns}</div>
          <div><strong>Concurrency:</strong> {config.max_concurrency}</div>
          <div><strong>Permission Mode:</strong> {config.permission_mode}</div>
          <div><strong>Auth Method:</strong> {config.auth_method}</div>
          <div><strong>Poll Interval:</strong> {config.poll_interval_ms / 1000}s</div>
          <div><strong>Stall Timeout:</strong> {config.stall_timeout_ms / 1000}s</div>
        </div>
        <h3 className="config-section-header">Workspace</h3>
        <div className="config-grid">
          <div><strong>Repo URL:</strong> <a href={config.repo_url} className="issue-link" target="_blank" rel="noreferrer">{config.repo_url}</a></div>
          <div><strong>Workspaces Dir:</strong> {config.workspaces_dir}</div>
          <div><strong>Cleanup on Start:</strong> {config.cleanup_on_start ? "yes" : "no"}</div>
          <div><strong>Cleanup on Terminal:</strong> {config.cleanup_on_terminal ? "yes" : "no"}</div>
        </div>
      </div>
    </details>
  );
}
