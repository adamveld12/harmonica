import { describe, it, expect } from "bun:test";
import { WorkspaceSchema, RepoSchema, ReposFileSchema } from "./schema.ts";

describe("WorkspaceSchema mutual exclusion", () => {
  it("allows repo alone", () => {
    const result = WorkspaceSchema.safeParse({ repo: "my-repo" });
    expect(result.success).toBe(true);
  });

  it("allows repo_url alone", () => {
    const result = WorkspaceSchema.safeParse({ repo_url: "https://github.com/org/repo.git" });
    expect(result.success).toBe(true);
  });

  it("allows neither repo nor repo_url", () => {
    const result = WorkspaceSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects both repo and repo_url set together", () => {
    const result = WorkspaceSchema.safeParse({
      repo: "my-repo",
      repo_url: "https://github.com/org/repo.git",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("repo");
    }
  });

  it("defaults cleanup_on_start and cleanup_on_terminal to true", () => {
    const result = WorkspaceSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cleanup_on_start).toBe(true);
      expect(result.data.cleanup_on_terminal).toBe(true);
    }
  });
});

describe("RepoSchema", () => {
  it("parses minimal config with defaults", () => {
    const result = RepoSchema.safeParse({ url: "https://github.com/org/repo.git" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.default_branch).toBe("main");
      expect(result.data.fetch_depth).toBeUndefined();
    }
  });

  it("accepts fetch_depth", () => {
    const result = RepoSchema.safeParse({ url: "https://github.com/org/repo.git", fetch_depth: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fetch_depth).toBe(10);
    }
  });

  it("accepts fetch_interval_ms as reserved field", () => {
    const result = RepoSchema.safeParse({
      url: "https://github.com/org/repo.git",
      fetch_interval_ms: 60000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing url", () => {
    const result = RepoSchema.safeParse({ default_branch: "main" });
    expect(result.success).toBe(false);
  });
});

describe("ReposFileSchema", () => {
  it("parses multiple repos", () => {
    const result = ReposFileSchema.safeParse({
      "repo-a": { url: "https://github.com/org/a.git" },
      "repo-b": { url: "https://github.com/org/b.git", default_branch: "develop" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data)).toHaveLength(2);
      expect(result.data["repo-b"].default_branch).toBe("develop");
    }
  });

  it("parses empty object", () => {
    const result = ReposFileSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
