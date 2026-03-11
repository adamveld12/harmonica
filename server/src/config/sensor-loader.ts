import { parse } from "yaml";
import { join } from "path";
import { watch } from "fs";
import { SensorsFileSchema, type SensorsFileConfig } from "./schema.ts";
import { resolveConfig } from "./resolver.ts";
import { logger } from "../observability/logger.ts";
import { DEBOUNCE_MS } from "./defaults.ts";

const SENSORS_FILE = ".agents/sensors.yaml";

export async function loadSensors(basePath: string): Promise<SensorsFileConfig> {
  const filePath = join(basePath, SENSORS_FILE);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    logger.warn("sensors file not found", { path: filePath });
    return {};
  }

  const text = await file.text();
  const parsed = parse(text) as Record<string, unknown>;
  const resolved = resolveConfig(parsed);
  return SensorsFileSchema.parse(resolved);
}

export function watchSensors(basePath: string, onChange: (config: SensorsFileConfig) => void): () => void {
  const filePath = join(basePath, SENSORS_FILE);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  let watcher: ReturnType<typeof watch> | null = null;
  try {
    watcher = watch(filePath, { persistent: false }, (event) => {
      if (event !== "change") return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const config = await loadSensors(basePath);
          logger.info("sensors reloaded", { path: filePath });
          onChange(config);
        } catch (err) {
          logger.error("sensors reload failed", { path: filePath, error: String(err) });
        }
      }, DEBOUNCE_MS);
    });

    watcher.on("error", (err) => {
      logger.error("sensors watcher error", { path: filePath, error: String(err) });
    });
  } catch (err) {
    logger.warn("sensors watcher could not start", { path: filePath, error: String(err) });
  }

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher?.close();
  };
}
