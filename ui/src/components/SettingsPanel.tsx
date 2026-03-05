import type { NotificationPreferences } from "../types";

interface Props {
  prefs: NotificationPreferences;
  updatePrefs: (patch: Partial<NotificationPreferences>) => void;
  permissionState: NotificationPermission;
  requestPermission: () => void;
}

export function SettingsPanel({ prefs, updatePrefs, permissionState, requestPermission }: Props) {
  return (
    <details className="settings-panel">
      <summary>
        <span>Settings</span>
      </summary>
      <div className="config-grid">
        <div>
          <strong>Notification Permission:</strong>{" "}
          <span className={permissionState === "granted" ? "connected" : "disconnected"}>
            {permissionState}
          </span>
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
              onChange={e => updatePrefs({ enabled: e.target.checked })}
            />
            {" "}{prefs.enabled ? "enabled" : "disabled"}
          </label>
        </div>
        <div>
          <strong>Agent Started:</strong>{" "}
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={prefs.agent_started}
              disabled={!prefs.enabled}
              onChange={e => updatePrefs({ agent_started: e.target.checked })}
            />
            {" "}{prefs.agent_started ? "on" : "off"}
          </label>
        </div>
        <div>
          <strong>Agent Finished:</strong>{" "}
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={prefs.agent_finished}
              disabled={!prefs.enabled}
              onChange={e => updatePrefs({ agent_finished: e.target.checked })}
            />
            {" "}{prefs.agent_finished ? "on" : "off"}
          </label>
        </div>
        <div>
          <strong>Agent Errored:</strong>{" "}
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={prefs.agent_errored}
              disabled={!prefs.enabled}
              onChange={e => updatePrefs({ agent_errored: e.target.checked })}
            />
            {" "}{prefs.agent_errored ? "on" : "off"}
          </label>
        </div>
      </div>
    </details>
  );
}
