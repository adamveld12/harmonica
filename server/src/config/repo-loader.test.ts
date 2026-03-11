import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { loadRepos } from "./repo-loader.ts";

describe("loadRepos", () => {
  let tmpBase: string;

  beforeEach(async () => {
    tmpBase = join(tmpdir(), `harmonica-test-${Date.now()}`);
    await mkdir(join(tmpBase, ".agents"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpBase, { recursive: true, force: true });
  });

  it("returns empty object when repos.yaml does not exist", async () => {
    const result = await loadRepos(tmpBase);
    expect(result).toEqual({});
  });

  it("parses a valid repos.yaml", async () => {
    const yaml = `
my-repo:
  url: git@github.com:org/my-repo.git
  default_branch: main
`;
    await writeFile(join(tmpBase, ".agents/repos.yaml"), yaml, "utf8");
    const result = await loadRepos(tmpBase);
    expect(result["my-repo"]).toMatchObject({
      url: "git@github.com:org/my-repo.git",
      default_branch: "main",
    });
  });

  it("applies default_branch default when omitted", async () => {
    const yaml = `
bare-defaults:
  url: https://github.com/org/repo.git
`;
    await writeFile(join(tmpBase, ".agents/repos.yaml"), yaml, "utf8");
    const result = await loadRepos(tmpBase);
    expect(result["bare-defaults"].default_branch).toBe("main");
  });

  it("parses multiple repos", async () => {
    const yaml = `
repo-a:
  url: https://github.com/org/a.git
repo-b:
  url: https://github.com/org/b.git
  default_branch: develop
`;
    await writeFile(join(tmpBase, ".agents/repos.yaml"), yaml, "utf8");
    const result = await loadRepos(tmpBase);
    expect(Object.keys(result)).toEqual(["repo-a", "repo-b"]);
    expect(result["repo-b"].default_branch).toBe("develop");
  });

  it("throws on invalid schema (missing url)", async () => {
    const yaml = `
bad-repo:
  default_branch: main
`;
    await writeFile(join(tmpBase, ".agents/repos.yaml"), yaml, "utf8");
    await expect(loadRepos(tmpBase)).rejects.toThrow();
  });
});
