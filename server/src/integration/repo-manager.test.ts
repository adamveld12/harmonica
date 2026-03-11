import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { RepoManager } from "./repo-manager.ts";
import type { ReposFileConfig } from "../config/schema.ts";

describe("RepoManager", () => {
  let tmpConfigDir: string;

  beforeEach(async () => {
    tmpConfigDir = join(tmpdir(), `harmonica-rm-test-${Date.now()}`);
    await mkdir(tmpConfigDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpConfigDir, { recursive: true, force: true });
  });

  describe("syncRepos (via start / updateConfig)", () => {
    it("registers repos from initial config", async () => {
      const config: ReposFileConfig = {
        "my-repo": { url: "https://github.com/org/my-repo.git", default_branch: "main" },
      };
      // Mock ensureBareClone by providing a HEAD file so it thinks clone exists
      const bareDir = join(tmpConfigDir, "repos", "my-repo", ".bare");
      await mkdir(bareDir, { recursive: true });
      await Bun.write(join(bareDir, "HEAD"), "ref: refs/heads/main\n");

      const manager = new RepoManager(tmpConfigDir, config);
      await manager.start();

      const info = manager.getRepo("my-repo");
      expect(info).toBeDefined();
      expect(info?.name).toBe("my-repo");
      expect(info?.config.url).toBe("https://github.com/org/my-repo.git");
      expect(info?.repoDir).toBe(join(tmpConfigDir, "repos", "my-repo"));
      expect(info?.bareDir).toBe(bareDir);
    });

    it("repoDir and bareDir are correctly derived", async () => {
      const config: ReposFileConfig = {
        "test-repo": { url: "https://github.com/org/test.git", default_branch: "main" },
      };
      const bareDir = join(tmpConfigDir, "repos", "test-repo", ".bare");
      await mkdir(bareDir, { recursive: true });
      await Bun.write(join(bareDir, "HEAD"), "ref: refs/heads/main\n");

      const manager = new RepoManager(tmpConfigDir, config);
      await manager.start();

      const info = manager.getRepo("test-repo");
      expect(info?.repoDir).toBe(join(tmpConfigDir, "repos", "test-repo"));
      expect(info?.bareDir).toBe(join(tmpConfigDir, "repos", "test-repo", ".bare"));
    });

    it("removes repos dropped from config on updateConfig", async () => {
      const initialConfig: ReposFileConfig = {
        "repo-a": { url: "https://github.com/org/a.git", default_branch: "main" },
        "repo-b": { url: "https://github.com/org/b.git", default_branch: "main" },
      };

      // Pre-create bare dirs so ensureBareClone skips actual clone
      for (const name of ["repo-a", "repo-b"]) {
        const bareDir = join(tmpConfigDir, "repos", name, ".bare");
        await mkdir(bareDir, { recursive: true });
        await Bun.write(join(bareDir, "HEAD"), "ref: refs/heads/main\n");
      }

      const manager = new RepoManager(tmpConfigDir, initialConfig);
      await manager.start();

      expect(manager.getRepo("repo-a")).toBeDefined();
      expect(manager.getRepo("repo-b")).toBeDefined();

      // Remove repo-b
      const updatedConfig: ReposFileConfig = {
        "repo-a": { url: "https://github.com/org/a.git", default_branch: "main" },
      };
      await manager.updateConfig(updatedConfig);

      expect(manager.getRepo("repo-a")).toBeDefined();
      expect(manager.getRepo("repo-b")).toBeUndefined();
    });
  });

  describe("ensureAndFetch", () => {
    it("throws when repo is not registered", async () => {
      const manager = new RepoManager(tmpConfigDir, {});
      await manager.start();
      await expect(manager.ensureAndFetch("nonexistent")).rejects.toThrow('Repo "nonexistent" not found in repos.yaml');
    });
  });
});
