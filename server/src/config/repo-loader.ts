import { parse } from "yaml";
import { join } from "path";
import { watch } from "fs";
import { ReposFileSchema, type ReposFileConfig } from "./schema.ts";
import { resolveConfig } from "./resolver.ts";
import { logger } from "../observability/logger.ts";

const REPOS_FILE = ".agents/repos.yaml";

export async function loadRepos(basePath: string): Promise<ReposFileConfig> {
  const filePath = join(basePath, REPOS_FILE);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    logger.warn("repos file not found", { path: filePath });
    return {};
  }
  if (!(await file.exists())) {
    logger.warn("repos file not found", { path: filePath });
    return {};
  }
  }

  const text = await file.text();
  const parsed = parse(text) as Record<string, unknown>;
  const resolved = resolveConfig(parsed);
  return ReposFileSchema.parse(resolved);
}

export function watchRepos(basePath: string, onChange: (config: ReposFileConfig) => void): () => void {
  const filePath = join(basePath, REPOS_FILE);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  let watcher: ReturnType<typeof watch> | null = null;
  try {
    watcher = watch(filePath, { persistent: false }, (event) => {
      if (event !== "change") return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const config = await loadRepos(basePath);
          logger.info("repos reloaded", { path: filePath });
          onChange(config);
        } catch (err) {
          logger.error("repos reload failed", { path: filePath, error: String(err) });
        }
      }, 200);
    });

    watcher.on("error", (err) => {
      logger.error("repos watcher error", { path: filePath, error: String(err) });
    });
  } catch (err) {
    logger.warn("repos watcher could not start", { path: filePath, error: String(err) });
  }

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher?.close();
  };
}
