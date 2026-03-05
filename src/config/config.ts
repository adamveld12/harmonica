import { parse } from "yaml";
import { readFile } from "fs/promises";
import { ConfigSchema, type Config } from "./schema.ts";
import { resolveConfig } from "./resolver.ts";
export type { Config } from "./schema.ts";

export async function loadConfig(filePath: string): Promise<Config> {
  const raw = await readFile(filePath, "utf-8");
  const parsed = parse(raw) as Record<string, unknown>;

  if (parsed.claude && parsed.agent) {
    parsed.agent = { ...(parsed.agent as object), ...(parsed.claude as object) };
    delete parsed.claude;
  } else if (parsed.claude && !parsed.agent) {
    parsed.agent = parsed.claude;
    delete parsed.claude;
  }

  const resolved = resolveConfig(parsed);
  return ConfigSchema.parse(resolved);
}

export function getEffectiveConcurrency(config: Config): number {
  return config.policy.max_concurrency ?? config.agent.max_concurrency;
}
