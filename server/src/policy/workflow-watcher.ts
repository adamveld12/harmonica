import { watch, readdirSync } from "fs";
import { join, extname } from "path";
import { loadWorkflow } from "./workflow-loader.ts";
import { logger } from "../observability/logger.ts";
import type { WorkflowConfig } from "../types.ts";

export function watchWorkflow(
  filePath: string,
  onReload: (wf: WorkflowConfig) => void,
  onError: (err: Error) => void,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(filePath, { persistent: false }, (event) => {
    if (event !== "change") return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const wf = await loadWorkflow(filePath);
        logger.info("workflow reloaded", { path: filePath });
        onReload(wf);
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }, 200);
  });

  watcher.on("error", (err) => {
    onError(err instanceof Error ? err : new Error(String(err)));
  });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher.close();
  };
}

/**
 * Watch a directory for .md file additions and removals (500ms debounce).
 * Returns a stop function.
 */
export function watchWorkflowDirectory(
  dirPath: string,
  onAdd: (filePath: string) => void,
  onRemove: (filePath: string) => void,
  onError: (err: Error) => void,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let knownFiles = new Set(
    readdirSync(dirPath)
      .filter((f) => extname(f) === ".md")
      .map((f) => join(dirPath, f)),
  );

  const watcher = watch(dirPath, { persistent: false }, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const current = new Set(
          readdirSync(dirPath)
            .filter((f) => extname(f) === ".md")
            .map((f) => join(dirPath, f)),
        );
        for (const f of current) {
          if (!knownFiles.has(f)) {
            logger.info("workflow file added", { path: f });
            onAdd(f);
          }
        }
        for (const f of knownFiles) {
          if (!current.has(f)) {
            logger.info("workflow file removed", { path: f });
            onRemove(f);
          }
        }
        knownFiles = current;
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }, 500);
  });

  watcher.on("error", (err) => {
    onError(err instanceof Error ? err : new Error(String(err)));
  });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher.close();
  };
}
