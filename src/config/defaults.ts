export const DEFAULTS = {
  config_dir: "~/.harmonica",
  poll_interval_ms: 30_000,
  stall_timeout_ms: 300_000,
  agent: {
    model: "claude-sonnet-4-20250514",
    max_turns: 50,
    turn_timeout_ms: 120_000,
    max_retry_backoff_ms: 300_000,
    max_concurrency: 3,
    permission_mode: "bypassPermissions" as const,
  },
  workspace: {
    cleanup_on_start: true,
    cleanup_on_terminal: true,
  },
  hooks: {
    timeout_ms: 60_000,
  },
} as const;
