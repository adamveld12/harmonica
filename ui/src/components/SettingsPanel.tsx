import type { NotificationPreferences, GlobalSettings } from "../types";

interface Props {
  prefs: NotificationPreferences;
  updatePrefs: (patch: Partial<NotificationPreferences>) => void;
  permissionState: NotificationPermission;
  requestPermission: () => void;
  settings: GlobalSettings | null;
}

export function SettingsPanel({ prefs, updatePrefs, permissionState, requestPermission, settings }: Props) {
  return (
    <details className="settings-panel">
      <summary>
        <span>Settings</span>
      </summary>

      {settings && (
        <>
          <h3 className="config-section-header">Application</h3>
          <div className="config-grid">
            <div>
              <strong>Config Dir:</strong> {settings.configDir}
            </div>
            <div>
              <strong>Workspaces Dir:</strong> {settings.workspacesDir}
            </div>
            <div>
              <strong>Database:</strong> {settings.dbPath}
            </div>
            <div>
              <strong>Workflows Path:</strong> {settings.workflowsPath}
            </div>
            {settings.serverPort != null && (
              <div>
                <strong>Server Port:</strong> {settings.serverPort}
              </div>
            )}
            {settings.serverHost && (
              <div>
                <strong>Server Host:</strong> {settings.serverHost}
              </div>
            )}
            {settings.repoUrlOverride && (
              <div>
                <strong>Repo URL Override:</strong> {settings.repoUrlOverride}
              </div>
            )}
            <div>
              <strong>Debug:</strong> {settings.debug ? "on" : "off"}
            </div>
          </div>
        </>
      )}

      <h3 className="config-section-header">Notifications</h3>
      <div className="config-grid">
        <div>
          <strong>Notification Permission:</strong>{" "}
          <span className={permissionState === "granted" ? "connected" : "disconnected"}>{permissionState}</span>
          {permissionState === "default" && (
            <button className="perm-btn" onClick={requestPermission}>
              Grant Permission
            </button>
          )}
          {permissionState === "denied" && (
            <span className="perm-hint">
              {typeof window !== "undefined" && !window.isSecureContext
                ? "Use http://localhost:<port> (secure context required)"
                : "Reset in browser — click lock icon in address bar"}
            </span>
          )}
        </div>
        <div>
          <strong>Notifications:</strong>{" "}
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={prefs.enabled}
              onChange={(e) => updatePrefs({ enabled: e.target.checked })}
            />{" "}
            {prefs.enabled ? "enabled" : "disabled"}
          </label>
        </div>
        <div>
          <strong>Agent Started:</strong>{" "}
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={prefs.agent_started}
              disabled={!prefs.enabled}
              onChange={(e) => updatePrefs({ agent_started: e.target.checked })}
            />{" "}
            {prefs.agent_started ? "on" : "off"}
          </label>
        </div>
        <div>
          <strong>Agent Finished:</strong>{" "}
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={prefs.agent_finished}
              disabled={!prefs.enabled}
              onChange={(e) => updatePrefs({ agent_finished: e.target.checked })}
            />{" "}
            {prefs.agent_finished ? "on" : "off"}
          </label>
        </div>
        <div>
          <strong>Agent Errored:</strong>{" "}
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={prefs.agent_errored}
              disabled={!prefs.enabled}
              onChange={(e) => updatePrefs({ agent_errored: e.target.checked })}
            />{" "}
            {prefs.agent_errored ? "on" : "off"}
          </label>
        </div>
      </div>
    </details>
  );
}
