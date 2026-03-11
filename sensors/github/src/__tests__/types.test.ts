import { describe, test, expect } from "bun:test";
import { matchesGitHubIssueFilters, matchesGitHubPRFilters, matchesGitHubProjectItemFilters } from "../types.ts";
import type { GitHubIssueNode, GitHubPRNode, GitHubProjectItemNode } from "../types.ts";
import type { TrackerConfig } from "@harmonica/sensor-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseTrackerConfig(overrides: Partial<TrackerConfig> = {}): TrackerConfig {
  return { type: "github", sensor: "test-sensor", ...overrides };
}

function makeIssue(overrides: Partial<GitHubIssueNode> = {}): GitHubIssueNode {
  return {
    number: 1,
    title: "Test issue",
    body: null,
    state: "open",
    html_url: "https://github.com/org/repo/issues/1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    labels: [],
    assignees: [],
    milestone: null,
    ...overrides,
  };
}

function makePR(overrides: Partial<GitHubPRNode> = {}): GitHubPRNode {
  return {
    number: 2,
    title: "Test PR",
    body: null,
    state: "open",
    draft: false,
    merged_at: null,
    html_url: "https://github.com/org/repo/pull/2",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    labels: [],
    assignees: [],
    base: { ref: "main" },
    milestone: null,
    ...overrides,
  };
}

function makeProjectItem(overrides: Partial<GitHubProjectItemNode> = {}): GitHubProjectItemNode {
  return {
    id: "item-1",
    title: "Project item",
    body: null,
    status: "In Progress",
    url: "https://github.com/orgs/org/projects/1/items/1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    assignees: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// matchesGitHubIssueFilters
// ---------------------------------------------------------------------------

describe("matchesGitHubIssueFilters", () => {
  test("returns true when no filter_assignees set", () => {
    const issue = makeIssue({ assignees: [] });
    const config = baseTrackerConfig();
    expect(matchesGitHubIssueFilters(issue, config)).toBe(true);
  });

  test("returns true when assignee login matches one of filter_assignees (OR logic)", () => {
    const issue = makeIssue({ assignees: [{ login: "alice" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice", "bob"] });
    expect(matchesGitHubIssueFilters(issue, config)).toBe(true);
  });

  test("returns false when no assignee matches filter_assignees", () => {
    const issue = makeIssue({ assignees: [{ login: "charlie" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice", "bob"] });
    expect(matchesGitHubIssueFilters(issue, config)).toBe(false);
  });

  test("returns false when issue has no assignees but filter_assignees is set", () => {
    const issue = makeIssue({ assignees: [] });
    const config = baseTrackerConfig({ filter_assignees: ["alice"] });
    expect(matchesGitHubIssueFilters(issue, config)).toBe(false);
  });

  test("returns true when item has multiple assignees and at least one matches", () => {
    const issue = makeIssue({ assignees: [{ login: "charlie" }, { login: "bob" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice", "bob"] });
    expect(matchesGitHubIssueFilters(issue, config)).toBe(true);
  });

  test("filters by labels correctly — returns true when all required labels present", () => {
    const issue = makeIssue({
      labels: [{ name: "bug" }, { name: "urgent" }],
      assignees: [{ login: "alice" }],
    });
    const config = baseTrackerConfig({
      filter_labels: ["bug", "urgent"],
      filter_assignees: ["alice"],
    });
    expect(matchesGitHubIssueFilters(issue, config)).toBe(true);
  });

  test("filters by labels correctly — returns false when a required label is missing", () => {
    const issue = makeIssue({
      labels: [{ name: "bug" }],
      assignees: [{ login: "alice" }],
    });
    const config = baseTrackerConfig({
      filter_labels: ["bug", "urgent"],
      filter_assignees: ["alice"],
    });
    expect(matchesGitHubIssueFilters(issue, config)).toBe(false);
  });

  test("returns false when labels match but assignee does not", () => {
    const issue = makeIssue({
      labels: [{ name: "bug" }],
      assignees: [{ login: "charlie" }],
    });
    const config = baseTrackerConfig({
      filter_labels: ["bug"],
      filter_assignees: ["alice"],
    });
    expect(matchesGitHubIssueFilters(issue, config)).toBe(false);
  });

  test("returns true when both labels and assignees match", () => {
    const issue = makeIssue({
      labels: [{ name: "feature" }],
      assignees: [{ login: "bob" }],
    });
    const config = baseTrackerConfig({
      filter_labels: ["feature"],
      filter_assignees: ["alice", "bob"],
    });
    expect(matchesGitHubIssueFilters(issue, config)).toBe(true);
  });

  test("case-insensitive: filter 'Alice' matches login 'alice'", () => {
    const issue = makeIssue({ assignees: [{ login: "alice" }] });
    const config = baseTrackerConfig({ filter_assignees: ["Alice"] });
    expect(matchesGitHubIssueFilters(issue, config)).toBe(true);
  });

  test("case-insensitive: filter 'alice' matches login 'ALICE'", () => {
    const issue = makeIssue({ assignees: [{ login: "ALICE" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice"] });
    expect(matchesGitHubIssueFilters(issue, config)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// matchesGitHubPRFilters
// ---------------------------------------------------------------------------

describe("matchesGitHubPRFilters", () => {
  test("returns true when no filter_assignees set", () => {
    const pr = makePR({ assignees: [] });
    const config = baseTrackerConfig();
    expect(matchesGitHubPRFilters(pr, config)).toBe(true);
  });

  test("returns true when assignee login matches", () => {
    const pr = makePR({ assignees: [{ login: "alice" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice", "bob"] });
    expect(matchesGitHubPRFilters(pr, config)).toBe(true);
  });

  test("returns false when no assignee matches filter_assignees", () => {
    const pr = makePR({ assignees: [{ login: "charlie" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice", "bob"] });
    expect(matchesGitHubPRFilters(pr, config)).toBe(false);
  });

  test("returns false when PR has no assignees but filter_assignees is set", () => {
    const pr = makePR({ assignees: [] });
    const config = baseTrackerConfig({ filter_assignees: ["alice"] });
    expect(matchesGitHubPRFilters(pr, config)).toBe(false);
  });

  test("returns true when multiple assignees and at least one matches", () => {
    const pr = makePR({ assignees: [{ login: "charlie" }, { login: "alice" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice"] });
    expect(matchesGitHubPRFilters(pr, config)).toBe(true);
  });

  test("respects filter_base_branch — returns false when branch does not match", () => {
    const pr = makePR({ base: { ref: "dev" } });
    const config = baseTrackerConfig({ filter_base_branch: "main" });
    expect(matchesGitHubPRFilters(pr, config)).toBe(false);
  });

  test("respects filter_base_branch — returns true when branch matches", () => {
    const pr = makePR({ base: { ref: "main" } });
    const config = baseTrackerConfig({ filter_base_branch: "main" });
    expect(matchesGitHubPRFilters(pr, config)).toBe(true);
  });

  test("case-insensitive: filter 'Alice' matches login 'alice'", () => {
    const pr = makePR({ assignees: [{ login: "alice" }] });
    const config = baseTrackerConfig({ filter_assignees: ["Alice"] });
    expect(matchesGitHubPRFilters(pr, config)).toBe(true);
  });

  test("case-insensitive: filter 'alice' matches login 'ALICE'", () => {
    const pr = makePR({ assignees: [{ login: "ALICE" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice"] });
    expect(matchesGitHubPRFilters(pr, config)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// matchesGitHubProjectItemFilters
// ---------------------------------------------------------------------------

describe("matchesGitHubProjectItemFilters", () => {
  test("returns true when no filter_assignees set", () => {
    const item = makeProjectItem();
    const config = baseTrackerConfig();
    expect(matchesGitHubProjectItemFilters(item, config)).toBe(true);
  });

  test("returns true when node has empty assignees and no filter set", () => {
    const item = makeProjectItem({ assignees: [] });
    const config = baseTrackerConfig();
    expect(matchesGitHubProjectItemFilters(item, config)).toBe(true);
  });

  test("returns true when assignee login matches", () => {
    const item = makeProjectItem({ assignees: [{ login: "alice" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice"] });
    expect(matchesGitHubProjectItemFilters(item, config)).toBe(true);
  });

  test("returns false when no assignee matches filter_assignees", () => {
    const item = makeProjectItem({ assignees: [{ login: "charlie" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice", "bob"] });
    expect(matchesGitHubProjectItemFilters(item, config)).toBe(false);
  });

  test("returns false when filter is set but node has empty assignees", () => {
    const item = makeProjectItem({ assignees: [] });
    const config = baseTrackerConfig({ filter_assignees: ["alice"] });
    expect(matchesGitHubProjectItemFilters(item, config)).toBe(false);
  });

  test("returns true when multiple assignees and at least one matches", () => {
    const item = makeProjectItem({ assignees: [{ login: "charlie" }, { login: "bob" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice", "bob"] });
    expect(matchesGitHubProjectItemFilters(item, config)).toBe(true);
  });

  test("case-insensitive: filter 'Alice' matches login 'alice'", () => {
    const item = makeProjectItem({ assignees: [{ login: "alice" }] });
    const config = baseTrackerConfig({ filter_assignees: ["Alice"] });
    expect(matchesGitHubProjectItemFilters(item, config)).toBe(true);
  });

  test("case-insensitive: filter 'alice' matches login 'ALICE'", () => {
    const item = makeProjectItem({ assignees: [{ login: "ALICE" }] });
    const config = baseTrackerConfig({ filter_assignees: ["alice"] });
    expect(matchesGitHubProjectItemFilters(item, config)).toBe(true);
  });
});
