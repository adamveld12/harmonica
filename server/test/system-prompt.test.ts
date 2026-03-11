import { describe, test, expect } from "bun:test";
import { buildSystemPrompt } from "../src/policy/system-prompt.ts";
import type { Config } from "../src/config/schema.ts";
import type { WorkItem, PromptVariables } from "../src/types.ts";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const baseIssue: WorkItem = {
  kind: "issue",
  id: "issue-uuid-123",
  identifier: "ENG-42",
  title: "Fix the widget",
  description: "Widget is broken",
  state: "active",
  stateLabel: "In Progress",
  labels: ["bug"],
  assigneeId: null,
  assigneeName: null,
  projectName: null,
  url: "https://linear.app/team/issue/ENG-42",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
};

const baseProject: WorkItem = {
  kind: "project",
  id: "project-uuid-456",
  identifier: "proj-q3",
  title: "Q3 Infrastructure",
  description: null,
  state: "active",
  stateLabel: "started",
  labels: [],
  url: "https://linear.app/team/project/proj-q3",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
  status: "started",
  health: "onTrack",
  leadName: "Jane Smith",
  memberCount: 3,
  milestones: [],
  startDate: null,
  targetDate: null,
  progress: 40,
};

function makeConfig(
  overrides: Partial<Config["agent"]> = {},
  trackerOverrides: Partial<Config["tracker"]> = {},
): Config {
  return {
    poll_interval_s: 30,
    stall_timeout_s: 300,
    tracker: {
      type: "linear",
      sensor: "my-sensor",
      mode: "issues",
      ...trackerOverrides,
    },
    agent: {
      model: "claude-sonnet-4-20250514",
      max_turns: 50,
      turn_timeout_s: 600,
      max_retry_backoff_s: 300,
      max_concurrency: 3,
      permission_mode: "bypassPermissions",
      auth_method: "subscription",
      ...overrides,
    },
    workspace: {
      cleanup_on_start: true,
      cleanup_on_terminal: true,
    },
    hooks: {
      timeout_s: 60,
    },
    policy: {
      allow_multiple_per_issue: false,
    },
  };
}

function makeVars(item: WorkItem, workspaceDir = "/workspace/ENG-42"): PromptVariables {
  return {
    issue: item.kind === "issue" ? (item as PromptVariables["issue"]) : null,
    project: item.kind === "project" ? (item as PromptVariables["project"]) : null,
    item,
    attempt: 1,
    workspace_dir: workspaceDir,
  };
}

// ---------------------------------------------------------------------------
// Tests: three-way dispatch
// ---------------------------------------------------------------------------

describe("buildSystemPrompt — dispatch", () => {
  test('system_prompt: "" returns null (disabled)', async () => {
    const config = makeConfig({ system_prompt: "" });
    expect(await buildSystemPrompt(config, baseIssue, makeVars(baseIssue))).toBeNull();
  });

  test("system_prompt: custom string returns it verbatim", async () => {
    const config = makeConfig({ system_prompt: "My custom prompt" });
    expect(await buildSystemPrompt(config, baseIssue, makeVars(baseIssue))).toBe("My custom prompt");
  });

  test("system_prompt: custom string with Liquid variables is rendered", async () => {
    const config = makeConfig({ system_prompt: "Working on {{ item.identifier }}: {{ item.title }}" });
    const result = await buildSystemPrompt(config, baseIssue, makeVars(baseIssue));
    expect(result).toBe("Working on ENG-42: Fix the widget");
  });

  test("system_prompt: custom string with workspace_dir variable is rendered", async () => {
    const config = makeConfig({ system_prompt: "Workspace: {{ workspace_dir }}" });
    const result = await buildSystemPrompt(config, baseIssue, makeVars(baseIssue, "/workspace/test"));
    expect(result).toBe("Workspace: /workspace/test");
  });

  test("system_prompt: undefined returns a non-null string (default)", async () => {
    const config = makeConfig({ system_prompt: undefined });
    const result = await buildSystemPrompt(config, baseIssue, makeVars(baseIssue));
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Tests: default prompt content
// ---------------------------------------------------------------------------

describe("buildSystemPrompt — default prompt", () => {
  test("contains expected heading", async () => {
    const result = await buildSystemPrompt(makeConfig(), baseIssue, makeVars(baseIssue));
    expect(result).toContain("# Harmonica Agent Context");
  });

  test("includes issue identifier and title", async () => {
    const result = await buildSystemPrompt(makeConfig(), baseIssue, makeVars(baseIssue));
    expect(result).toContain("ENG-42");
    expect(result).toContain("Fix the widget");
  });

  test("includes issue URL and state", async () => {
    const result = await buildSystemPrompt(makeConfig(), baseIssue, makeVars(baseIssue));
    expect(result).toContain("https://linear.app/team/issue/ENG-42");
    expect(result).toContain("In Progress");
  });

  test("uses 'issue' itemKind for kind=issue", async () => {
    const result = await buildSystemPrompt(makeConfig(), baseIssue, makeVars(baseIssue));
    expect(result).toContain("issue **ENG-42**");
  });

  test("uses 'project' itemKind for kind=project", async () => {
    const result = await buildSystemPrompt(makeConfig(), baseProject, makeVars(baseProject));
    expect(result).toContain("project **proj-q3**");
  });

  test("includes sensor name and mode", async () => {
    const result = await buildSystemPrompt(
      makeConfig({}, { sensor: "linear-issues", mode: "issues" }),
      baseIssue,
      makeVars(baseIssue),
    );
    expect(result).toContain("Sensor: linear-issues");
    expect(result).toContain("Mode: issues");
  });

  test("defaults mode to 'issues' when not set", async () => {
    const result = await buildSystemPrompt(
      makeConfig({}, { sensor: "my-sensor", mode: undefined }),
      baseIssue,
      makeVars(baseIssue),
    );
    expect(result).toContain("Mode: issues");
  });

  test("includes workspace_dir in workspace section", async () => {
    const workspaceDir = "/home/user/.harmonica/workspaces/ENG-42-abc123";
    const result = await buildSystemPrompt(makeConfig(), baseIssue, makeVars(baseIssue, workspaceDir));
    expect(result).toContain(workspaceDir);
  });

  test("does not include api_key in output", async () => {
    const config = makeConfig({}, { api_key: "secret-key-should-not-appear" });
    const result = await buildSystemPrompt(config, baseIssue, makeVars(baseIssue));
    expect(result).not.toContain("secret-key-should-not-appear");
  });
});

// ---------------------------------------------------------------------------
// Tests: tracker filter surfacing
// ---------------------------------------------------------------------------

describe("buildSystemPrompt — tracker filters", () => {
  test("includes filter_labels when present", async () => {
    const result = await buildSystemPrompt(
      makeConfig({}, { filter_labels: ["bug", "agent"] }),
      baseIssue,
      makeVars(baseIssue),
    );
    expect(result).toContain("bug, agent");
  });

  test("omits filter_labels when empty/absent", async () => {
    const result = await buildSystemPrompt(makeConfig({}, { filter_labels: [] }), baseIssue, makeVars(baseIssue));
    expect(result).not.toContain("Required labels");
  });

  test("includes filter_states when present", async () => {
    const result = await buildSystemPrompt(
      makeConfig({}, { filter_states: ["In Progress", "In Review"] }),
      baseIssue,
      makeVars(baseIssue),
    );
    expect(result).toContain("Filtered to states: In Progress, In Review");
  });

  test("includes filter_project when present", async () => {
    const result = await buildSystemPrompt(
      makeConfig({}, { filter_project: "Q3 Backlog" }),
      baseIssue,
      makeVars(baseIssue),
    );
    expect(result).toContain("Filtered to project: Q3 Backlog");
  });

  test("includes filter_assignees when present", async () => {
    const result = await buildSystemPrompt(
      makeConfig({}, { filter_assignees: ["Adam V", "Jane S"] }),
      baseIssue,
      makeVars(baseIssue),
    );
    expect(result).toContain("Filtered to assignees: Adam V, Jane S");
  });

  test("includes filter_milestone when present", async () => {
    const result = await buildSystemPrompt(
      makeConfig({}, { filter_milestone: "v2.0" }),
      baseIssue,
      makeVars(baseIssue),
    );
    expect(result).toContain("Filtered to milestone: v2.0");
  });

  test("includes filter_base_branch when present", async () => {
    const result = await buildSystemPrompt(
      makeConfig({}, { filter_base_branch: "main" }),
      baseIssue,
      makeVars(baseIssue),
    );
    expect(result).toContain("Filtered to base branch: main");
  });

  test("includes filter_draft=true as 'drafts only'", async () => {
    const result = await buildSystemPrompt(makeConfig({}, { filter_draft: true }), baseIssue, makeVars(baseIssue));
    expect(result).toContain("Draft filter: drafts only");
  });

  test("includes filter_draft=false as 'non-drafts only'", async () => {
    const result = await buildSystemPrompt(makeConfig({}, { filter_draft: false }), baseIssue, makeVars(baseIssue));
    expect(result).toContain("Draft filter: non-drafts only");
  });

  test("omits filter_draft when undefined", async () => {
    const result = await buildSystemPrompt(makeConfig({}, { filter_draft: undefined }), baseIssue, makeVars(baseIssue));
    expect(result).not.toContain("Draft filter");
  });

  test("includes filter_base_branch independent of filter_milestone", async () => {
    // Regression: filter_base_branch must not be nested inside the filter_milestone block
    const result = await buildSystemPrompt(
      makeConfig({}, { filter_milestone: undefined, filter_base_branch: "develop" }),
      baseIssue,
      makeVars(baseIssue),
    );
    expect(result).toContain("Filtered to base branch: develop");
    expect(result).not.toContain("Filtered to milestone");
  });

  test("includes active_states when present", async () => {
    const result = await buildSystemPrompt(
      makeConfig({}, { active_states: ["In Progress"] }),
      baseIssue,
      makeVars(baseIssue),
    );
    expect(result).toContain("Active states: In Progress");
  });

  test("includes terminal_states when present", async () => {
    const result = await buildSystemPrompt(
      makeConfig({}, { terminal_states: ["Done", "Cancelled"] }),
      baseIssue,
      makeVars(baseIssue),
    );
    expect(result).toContain("Terminal states: Done, Cancelled");
  });
});
