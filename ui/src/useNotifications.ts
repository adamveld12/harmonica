import { useState, useEffect, useCallback } from "react";
import type { NotificationEvent, NotificationPreferences } from "./types";

const PREFS_KEY = "harmonica_notification_prefs";

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  agent_started: true,
  agent_finished: true,
  agent_errored: true,
};

function loadPrefs(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_PREFS };
}

function savePrefs(prefs: NotificationPreferences) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

function buildNotification(
  event: NotificationEvent
): { title: string; body: string; options: NotificationOptions } {
  const workflowPrefix = event.workflowName ?? event.workflowId;
  const prefix = workflowPrefix ? `[${workflowPrefix}] ` : "";
  const tag = event.workflowId ?? "default";

  let title: string;
  let body: string;
  let icon: string;
  let requireInteraction = false;

  if (event.type === "agent_started") {
    title = `${prefix}Started: ${event.issueIdentifier}`;
    body = `"${event.issueTitle}"`;
    icon = "/icon-started.svg";
  } else if (event.type === "agent_finished") {
    const turns = event.turnCount != null ? ` in ${event.turnCount} turns` : "";
    title = `${prefix}Finished: ${event.issueIdentifier}`;
    body = `"${event.issueTitle}" — ${event.exitReason ?? "finished"}${turns}`;
    icon = "/icon-finished.svg";
  } else {
    title = `${prefix}Error: ${event.issueIdentifier}`;
    body = `"${event.issueTitle}" — ${event.error ?? "unknown error"}`;
    icon = "/icon-errored.svg";
    requireInteraction = true;
  }

  return {
    title,
    body,
    options: {
      tag,
      icon,
      requireInteraction,
      data: { url: event.issueUrl },
    },
  };
}

export function useNotifications(lastNotification: NotificationEvent | null) {
  const [prefs, setPrefsState] = useState<NotificationPreferences>(loadPrefs);
  const [permissionState, setPermissionState] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  const updatePrefs = useCallback((patch: Partial<NotificationPreferences>) => {
    setPrefsState(prev => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermissionState(result);
  }, []);

  useEffect(() => {
    if (!lastNotification) return;
    if (!prefs.enabled) return;
    if (!prefs[lastNotification.type]) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const { title, body, options } = buildNotification(lastNotification);
    const notification = new Notification(title, { body, ...options });
    if (options.data?.url) {
      notification.onclick = () => window.open(options.data.url, "_blank");
    }
  }, [lastNotification, prefs]);

  return { prefs, updatePrefs, requestPermission, permissionState };
}
