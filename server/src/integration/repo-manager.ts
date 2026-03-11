import { mkdir, rm, writeFile, readdir } from "fs/promises";
import { join, resolve } from "path";
import type { ReposFileConfig, RepoConfig } from "../config/schema.ts";
import { logger } from "../observability/logger.ts";

export interface RepoInfo {
  name: string;
  config: RepoConfig;
  bareDir: string;
}

export interface WorktreeInfo {
  repoName: string;
  worktreePath: string;
  branchName: string;
}

/**
 * Manages bare git clones and per-item worktrees under $configDir/repos/.
 *
 * Layout:
 *   $configDir/repos/<name>/.bare/   — bare clone
 *   $configDir/repos/<name>/.git     — file: "gitdir: ./.bare"
 *
 * Each work item gets a worktree at its workspace directory path.
 */
export class RepoManager {
  private repos = new Map<string, RepoInfo>();
  private reposBaseDir: string;

  constructor(
    private configDir: string,
    private config: ReposFileConfig,
  ) {
    this.reposBaseDir = join(configDir, "repos");
  }

  /** Initialize repos from config — bare-clone any that don't exist yet. */
  async start(): Promise<void> {
    await mkdir(this.reposBaseDir, { recursive: true });
    await this.syncRepos(this.config);
  }

  /** Hot-reload: add/remove/update repos without restart. */
  async updateConfig(newConfig: ReposFileConfig): Promise<void> {
    await this.syncRepos(newConfig);
    this.config = newConfig;
  }

  /** Returns the RepoInfo for a named repo, or undefined if not found. */
  getRepo(name: string): RepoInfo | undefined {
    return this.repos.get(name);
  }

  /**
   * Ensure the bare clone for `name` exists and fetch latest from remote.
   * Called before creating a worktree.
   */
  async ensureAndFetch(name: string): Promise<RepoInfo> {
    const info = this.repos.get(name);
    if (!info) {
      throw new Error(`Repo "${name}" not found in repos.yaml`);
    }
    await this.fetchRepo(info);
    return info;
  }

  /**
   * Create an isolated git worktree at `worktreePath` on a unique branch.
   * The branch is named `harm/<identifier>` and is created from the default branch.
   */
  async createWorktree(repoName: string, worktreePath: string, identifier: string): Promise<WorktreeInfo> {
    const info = await this.ensureAndFetch(repoName);
    const branchName = `harm/${identifier}`.replace(/[^a-zA-Z0-9/_-]/g, "-");

    await mkdir(worktreePath, { recursive: true });
    // Remove directory first — git worktree add requires empty/non-existent path
    await rm(worktreePath, { recursive: true, force: true });

    const gitDir = join(info.bareDir, "..");

    // Create worktree + new branch based on default branch
    const addResult = await Bun.spawn(
      ["git", "worktree", "add", "-b", branchName, worktreePath, `origin/${info.config.default_branch}`],
      { cwd: gitDir, stdout: "pipe", stderr: "pipe" },
    ).exited;

    if (addResult !== 0) {
      // Branch may already exist from a previous stale run — try without -b
      const addExisting = await Bun.spawn(
        ["git", "worktree", "add", worktreePath, branchName],
        { cwd: gitDir, stdout: "pipe", stderr: "pipe" },
      ).exited;

      if (addExisting !== 0) {
    const addProc = Bun.spawn(
      ["git", "worktree", "add", "-b", branchName, worktreePath, `origin/${info.config.default_branch}`],
      { cwd: gitDir, stdout: "pipe", stderr: "pipe" },
    );
    const addResult = await addProc.exited;

    if (addResult !== 0) {
      const addStderr = await new Response(addProc.stderr).text();
      logger.debug("worktree add -b failed, trying existing branch", { repo: repoName, branch: branchName, error: addStderr.trim() });
      // Branch may already exist from a previous stale run — try without -b
      const fallbackProc = Bun.spawn(
        ["git", "worktree", "add", worktreePath, branchName],
        { cwd: gitDir, stdout: "pipe", stderr: "pipe" },
      );
      const addExisting = await fallbackProc.exited;

      if (addExisting !== 0) {
        const fallbackStderr = await new Response(fallbackProc.stderr).text();
        throw new Error(`Failed to create worktree at ${worktreePath} for branch ${branchName}: ${fallbackStderr.trim()}`);
      }
    }
      }
    }

    logger.info("worktree created", { repo: repoName, branch: branchName, path: worktreePath });

    return { repoName, worktreePath, branchName };
  }

  /**
   * Remove the worktree at `worktreePath` and prune stale references.
   */
  async removeWorktree(repoName: string, worktreePath: string): Promise<void> {
    const info = this.repos.get(repoName);
    if (!info) {
      logger.warn("removeWorktree: repo not found, doing filesystem cleanup only", { repo: repoName });
      await rm(worktreePath, { recursive: true, force: true });
      return;
    }

    const gitDir = join(info.bareDir, "..");

    // Force-remove the worktree from git's perspective
    const proc = Bun.spawn(["git", "worktree", "remove", "--force", worktreePath], {
      cwd: gitDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    // Prune stale worktree metadata
    await Bun.spawn(["git", "worktree", "prune"], {
      cwd: gitDir,
      stdout: "pipe",
      stderr: "pipe",
    }).exited;

    logger.info("worktree removed", { repo: repoName, path: worktreePath });
  }

  /**
   * Prune stale worktrees across all managed repos. Called at startup.
   */
  async pruneAllWorktrees(): Promise<void> {
    for (const info of this.repos.values()) {
      const gitDir = join(info.bareDir, "..");
      await Bun.spawn(["git", "worktree", "prune"], {
        cwd: gitDir,
        stdout: "pipe",
        stderr: "pipe",
      }).exited;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async syncRepos(config: ReposFileConfig): Promise<void> {
    // Add or update repos
    for (const [name, repoConfig] of Object.entries(config)) {
      const bareDir = join(this.reposBaseDir, name, ".bare");
      const info: RepoInfo = { name, config: repoConfig, bareDir };
      this.repos.set(name, info);
      await this.ensureBareCone(info);
    }

  private async ensureBareClone(info: RepoInfo): Promise<void> {
    for (const name of this.repos.keys()) {
      if (!(name in config)) {
        logger.info("repo removed from config, unregistering", { name });
        this.repos.delete(name);
      }
    }
  }

  private async ensureBareCone(info: RepoInfo): Promise<void> {
    const repoDir = join(this.reposBaseDir, info.name);
    await mkdir(repoDir, { recursive: true });

    // Check if bare clone already exists
    const headFile = Bun.file(join(info.bareDir, "HEAD"));
    if (await headFile.exists()) {
      logger.debug("bare clone already exists", { repo: info.name });
      return;
    }

    logger.info("cloning bare repo", { repo: info.name, url: info.config.url });

    const cloneArgs = ["git", "clone", "--bare", info.config.url, ".bare"];
    if (info.config.fetch_depth) {
      cloneArgs.splice(2, 0, `--depth=${info.config.fetch_depth}`);
    }

    const proc = Bun.spawn(cloneArgs, {
      cwd: repoDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Failed to clone ${info.config.url}: ${stderr.trim()}`);
    }

    // Write .git file that points to .bare — enables worktree commands from repoDir
    await writeFile(join(repoDir, ".git"), "gitdir: ./.bare\n", "utf8");

    // Configure fetch refspec so `git fetch` updates remote-tracking branches
    await Bun.spawn(
      ["git", "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"],
      { cwd: repoDir, stdout: "pipe", stderr: "pipe" },
    ).exited;

    logger.info("bare clone complete", { repo: info.name });
  }

  private async fetchRepo(info: RepoInfo): Promise<void> {
    const repoDir = join(this.reposBaseDir, info.name);
    logger.debug("fetching repo", { repo: info.name });
    const proc = Bun.spawn(["git", "fetch", "--all", "--prune"], {
      cwd: repoDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      logger.warn("git fetch failed", { repo: info.name, error: stderr.trim() });
    }
  }
}

export function createRepoManager(configDir: string, config: ReposFileConfig): RepoManager {
  return new RepoManager(configDir, config);
}
