import { describe, test, expect } from "bun:test";
import { GitHubSensorSchema } from "../schema.ts";

const baseConfig = {
  type: "github" as const,
  owner: "my-org",
  repo: "my-repo",
};

describe("GitHubSensorSchema", () => {
  test("parses a minimal valid config", () => {
    const result = GitHubSensorSchema.parse(baseConfig);
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
    expect(result.mode).toBe("issues"); // default
    expect(result.poll_interval_s).toBe(30); // default
    expect(result.refresh_ttl_s).toBe(5); // default
  });

  test("assignees is optional — parses successfully without it", () => {
    const result = GitHubSensorSchema.parse(baseConfig);
    expect(result.assignees).toBeUndefined();
  });

  test("parses config with assignees array", () => {
    const result = GitHubSensorSchema.parse({ ...baseConfig, assignees: ["alice", "bob"] });
    expect(result.assignees).toEqual(["alice", "bob"]);
  });

  test("parses config with a single assignee", () => {
    const result = GitHubSensorSchema.parse({ ...baseConfig, assignees: ["alice"] });
    expect(result.assignees).toEqual(["alice"]);
  });

  test("parses full valid config including assignees", () => {
    const fullConfig = {
      type: "github" as const,
      token: "ghp_test_token",
      owner: "my-org",
      repo: "my-repo",
      mode: "issues" as const,
      project: "My Project",
      poll_interval_s: 60,
      refresh_ttl_s: 10,
      active_states: ["open"],
      assignees: ["alice", "bob"],
    };

    const result = GitHubSensorSchema.parse(fullConfig);
    expect(result.type).toBe("github");
    expect(result.token).toBe("ghp_test_token");
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
    expect(result.mode).toBe("issues");
    expect(result.project).toBe("My Project");
    expect(result.poll_interval_s).toBe(60);
    expect(result.refresh_ttl_s).toBe(10);
    expect(result.active_states).toEqual(["open"]);
    expect(result.assignees).toEqual(["alice", "bob"]);
  });

  test("parses pull_requests mode", () => {
    const result = GitHubSensorSchema.parse({ ...baseConfig, mode: "pull_requests" });
    expect(result.mode).toBe("pull_requests");
  });

  test("parses projects mode", () => {
    const result = GitHubSensorSchema.parse({ ...baseConfig, mode: "projects" });
    expect(result.mode).toBe("projects");
  });

  test("rejects missing required owner field", () => {
    expect(() => GitHubSensorSchema.parse({ type: "github", repo: "my-repo" })).toThrow();
  });

  test("rejects missing required repo field", () => {
    expect(() => GitHubSensorSchema.parse({ type: "github", owner: "my-org" })).toThrow();
  });

  test("rejects invalid mode value", () => {
    expect(() => GitHubSensorSchema.parse({ ...baseConfig, mode: "invalid_mode" })).toThrow();
  });
});
