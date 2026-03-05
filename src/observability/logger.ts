type Level = "info" | "warn" | "error" | "debug";

function formatValue(v: unknown): string {
  const s = String(v);
  if (s === "" || /[\s="\\]/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

function log(level: Level, msg: string, fields?: Record<string, unknown>): void {
  const parts = [
    `ts=${new Date().toISOString()}`,
    `level=${level}`,
    `msg=${formatValue(msg)}`,
  ];
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      parts.push(`${k}=${formatValue(v)}`);
    }
  }
  process.stderr.write(parts.join(" ") + "\n");
}

export const logger = {
  info: (msg: string, fields?: Record<string, unknown>) => log("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => log("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => log("error", msg, fields),
  debug: (msg: string, fields?: Record<string, unknown>) => log("debug", msg, fields),
};
