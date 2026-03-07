import { mkdir, rm, readdir } from "fs/promises";
import { join, resolve } from "path";
import type { WorkItem } from "../types.ts";

export interface WorkspaceManager {
  createWorkspace(item: WorkItem): Promise<string>;
  removeWorkspace(workspaceDir: string): Promise<void>;
}

function safetyCheck(dir: string, baseDir: string): void {
  const resolved = resolve(dir);
  const base = resolve(baseDir);
  if (!resolved.startsWith(base + "/") && resolved !== base) {
    throw new Error(`Safety violation: ${dir} is not under ${baseDir}`);
  }
}

export function createWorkspaceManager(baseDir: string): WorkspaceManager {
  return {
    async createWorkspace(item: WorkItem): Promise<string> {
      const name = `${item.identifier}-${item.id.slice(0, 8)}`.replace(/[^a-zA-Z0-9-]/g, "-");
      const dir = join(baseDir, name);
      await mkdir(dir, { recursive: true });
      return dir;
    },

    async removeWorkspace(workspaceDir: string): Promise<void> {
      safetyCheck(workspaceDir, baseDir);
      await rm(workspaceDir, { recursive: true, force: true });
    },
  };
}

export async function sweepWorkspaces(baseDir: string, activeItemIds: Set<string>): Promise<void> {
  try {
    await mkdir(baseDir, { recursive: true });
    const entries = await readdir(baseDir);
    for (const entry of entries) {
      const isActive = Array.from(activeItemIds).some((id) => entry.includes(id.slice(0, 8)));
      if (!isActive) {
        const dir = join(baseDir, entry);
        safetyCheck(dir, baseDir);
        await rm(dir, { recursive: true, force: true });
      }
    }
  } catch {
    // baseDir doesn't exist yet
  }
}
