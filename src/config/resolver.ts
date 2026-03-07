import { homedir } from "os";

export function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return p.replace("~", homedir());
  }
  return p;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}|\$(\w+)/g, (match, braced, bare) => {
    const name = braced ?? bare;
    return process.env[name] ?? match;
  });
}

export function resolveConfig(raw: Record<string, unknown>): Record<string, unknown> {
  function walk(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") {
        out[k] = resolveEnvVars(v);
      } else if (Array.isArray(v)) {
        out[k] = v.map((item) => (typeof item === "string" ? resolveEnvVars(item) : item));
      } else if (v !== null && typeof v === "object") {
        out[k] = walk(v as Record<string, unknown>);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return walk(raw);
}
