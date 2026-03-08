import type { WorkflowConfig } from "../types";

interface Props {
  config: WorkflowConfig | null;
}

function truncate(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function ConfigPanel({ config }: Props) {
  if (!config) return null;
  return (
    <details className="settings-panel">
      <summary>
        <span>Configuration</span>
      </summary>
      <div className="config-sections">
        <h3 className="config-section-header">Agent</h3>
        <div className="config-grid">
          <div>
            <strong>Model:</strong> {config.agent.model}
          </div>
          <div>
            <strong>Max Turns:</strong> {config.agent.max_turns}
          </div>
          <div>
            <strong>Concurrency:</strong> {config.agent.max_concurrency}
          </div>
          <div>
            <strong>Permission Mode:</strong> {config.agent.permission_mode}
          </div>
          <div>
            <strong>Auth Method:</strong> {config.agent.auth_method}
          </div>
          <div>
            <strong>Turn Timeout:</strong> {config.agent.turn_timeout_s}s
          </div>
          <div>
            <strong>Max Retry Backoff:</strong> {config.agent.max_retry_backoff_s}s
          </div>
          {config.agent.allowed_tools && (
            <div>
              <strong>Allowed Tools:</strong> {config.agent.allowed_tools.join(", ")}
            </div>
          )}
        </div>

        <h3 className="config-section-header">Tracker</h3>
        <div className="config-grid">
          <div>
            <strong>Sensor:</strong> {config.tracker.sensor}
          </div>
          {config.tracker.mode && (
            <div>
              <strong>Mode:</strong> {config.tracker.mode}
            </div>
          )}
          {config.tracker.filter_labels && config.tracker.filter_labels.length > 0 && (
            <div>
              <strong>Filter Labels:</strong> {config.tracker.filter_labels.join(", ")}
            </div>
          )}
          {config.tracker.filter_states && config.tracker.filter_states.length > 0 && (
            <div>
              <strong>Filter States:</strong> {config.tracker.filter_states.join(", ")}
            </div>
          )}
          {config.tracker.filter_project && (
            <div>
              <strong>Filter Project:</strong> {config.tracker.filter_project}
            </div>
          )}
          {config.tracker.filter_assignees && config.tracker.filter_assignees.length > 0 && (
            <div>
              <strong>Filter Assignees:</strong> {config.tracker.filter_assignees.join(", ")}
            </div>
          )}
          {config.tracker.project_name && (
            <div>
              <strong>Project Name:</strong> {config.tracker.project_name}
            </div>
          )}
          {config.tracker.active_states && config.tracker.active_states.length > 0 && (
            <div>
              <strong>Active States:</strong> {config.tracker.active_states.join(", ")}
            </div>
          )}
          {config.tracker.terminal_states && config.tracker.terminal_states.length > 0 && (
            <div>
              <strong>Terminal States:</strong> {config.tracker.terminal_states.join(", ")}
            </div>
          )}
        </div>

        <h3 className="config-section-header">Workspace</h3>
        <div className="config-grid">
          {config.workspace.repo_url && (
            <div>
              <strong>Repo URL:</strong>{" "}
              <a href={config.workspace.repo_url} className="issue-link" target="_blank" rel="noreferrer">
                {config.workspace.repo_url}
              </a>
            </div>
          )}
          <div>
            <strong>Cleanup on Start:</strong> {config.workspace.cleanup_on_start ? "yes" : "no"}
          </div>
          <div>
            <strong>Cleanup on Terminal:</strong> {config.workspace.cleanup_on_terminal ? "yes" : "no"}
          </div>
        </div>

        {(config.hooks.after_create ||
          config.hooks.before_run ||
          config.hooks.after_run ||
          config.hooks.before_remove) && (
          <>
            <h3 className="config-section-header">Hooks</h3>
            <div className="config-grid">
              {config.hooks.after_create && (
                <div>
                  <strong>after_create:</strong> <code>{truncate(config.hooks.after_create)}</code>
                </div>
              )}
              {config.hooks.before_run && (
                <div>
                  <strong>before_run:</strong> <code>{truncate(config.hooks.before_run)}</code>
                </div>
              )}
              {config.hooks.after_run && (
                <div>
                  <strong>after_run:</strong> <code>{truncate(config.hooks.after_run)}</code>
                </div>
              )}
              {config.hooks.before_remove && (
                <div>
                  <strong>before_remove:</strong> <code>{truncate(config.hooks.before_remove)}</code>
                </div>
              )}
              <div>
                <strong>Hook Timeout:</strong> {config.hooks.timeout_s}s
              </div>
            </div>
          </>
        )}

        <h3 className="config-section-header">Policy</h3>
        <div className="config-grid">
          {config.policy.max_concurrency != null && (
            <div>
              <strong>Max Concurrency:</strong> {config.policy.max_concurrency}
            </div>
          )}
          <div>
            <strong>Allow Multiple per Issue:</strong> {config.policy.allow_multiple_per_issue ? "yes" : "no"}
          </div>
        </div>

        <h3 className="config-section-header">Timing</h3>
        <div className="config-grid">
          <div>
            <strong>Poll Interval:</strong> {config.poll_interval_s}s
          </div>
          <div>
            <strong>Stall Timeout:</strong> {config.stall_timeout_s}s
          </div>
        </div>
      </div>
    </details>
  );
}
