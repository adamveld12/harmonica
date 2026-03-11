import type { Config } from "../config/schema.ts";
import type { WorkItem, PromptVariables } from "../types.ts";
import { renderPrompt } from "./prompt-renderer.ts";

/**
 * Builds the system prompt to prepend to the first-turn workflow prompt.
 *
 * Behaviour:
 * - `config.agent.system_prompt === undefined` → return the built-in pre-canned prompt
 * - `config.agent.system_prompt === ""`        → return null (disabled)
 * - any non-empty string                        → rendered through Liquid (same variables
 *   as the workflow body: `item`, `issue`, `project`, `attempt`, `workspace_dir`)
 *
 * Custom system prompts are rendered through Liquid so that Liquid variables like
 * `{{ issue.identifier }}` work as expected, consistent with how the workflow body
 * is rendered.
 */
export async function buildSystemPrompt(config: Config, item: WorkItem, vars: PromptVariables): Promise<string | null> {
  const { system_prompt } = config.agent;

  // Explicitly disabled
  if (system_prompt === "") return null;

  // Custom override — rendered through Liquid so {{ }} variables work
  if (system_prompt !== undefined) return renderPrompt(system_prompt, vars);

  // Default: build pre-canned prompt
  return buildDefaultSystemPrompt(config, item, vars.workspace_dir);
}

function buildDefaultSystemPrompt(config: Config, item: WorkItem, workspaceDir: string): string {
  // Destructure only the tracker fields we need — api_key is populated at runtime
  // from the sensor and must not be leaked into the agent prompt.
  const {
    sensor,
    mode,
    type,
    filter_labels,
    filter_states,
    filter_project,
    filter_assignees,
    filter_milestone,
    filter_base_branch,
    filter_draft,
    active_states,
    terminal_states,
  } = config.tracker;

  const sensorLines: string[] = [];
  sensorLines.push(`- Sensor: ${sensor}`);
  sensorLines.push(`- Mode: ${mode ?? "issues"}`);
  sensorLines.push(`- Tracker type: ${type}`);

  if (filter_labels?.length) {
    sensorLines.push(`- Required labels (ALL must match): ${filter_labels.join(", ")}`);
  }
  if (filter_states?.length) {
    sensorLines.push(`- Filtered to states: ${filter_states.join(", ")}`);
  }
  if (filter_project) {
    sensorLines.push(`- Filtered to project: ${filter_project}`);
  }
  if (filter_assignees?.length) {
    sensorLines.push(`- Filtered to assignees: ${filter_assignees.join(", ")}`);
  }
  if (filter_milestone) {
    sensorLines.push(`- Filtered to milestone: ${filter_milestone}`);
  }
  // GitHub-specific filters: filter_base_branch and filter_draft are only set
  // for github-type trackers but are surfaced here for agent awareness regardless.
  if (filter_base_branch) {
    sensorLines.push(`- Filtered to base branch: ${filter_base_branch}`);
  }
  if (filter_draft !== undefined) {
    sensorLines.push(`- Draft filter: ${filter_draft ? "drafts only" : "non-drafts only"}`);
  }
  if (active_states?.length) {
    sensorLines.push(`- Active states: ${active_states.join(", ")}`);
  }
  if (terminal_states?.length) {
    sensorLines.push(`- Terminal states: ${terminal_states.join(", ")}`);
  }

  // WorkItem.kind is "issue" | "project". The "pull_requests" tracker mode maps
  // items to kind "issue" (PRs are represented as issues in the work-item model).
  const itemKind = item.kind === "project" ? "project" : "issue";

  return `# Harmonica Agent Context

You are an autonomous software engineering agent running inside Harmonica — an issue-driven coding orchestrator. This context is provided automatically and applies to every workflow.

## Your Current Work Item

You are working on ${itemKind} **${item.identifier}**: ${item.title}
- URL: ${item.url}
- Current state: ${item.stateLabel}

## Workspace

Your workspace is an isolated directory on the local filesystem created specifically for this work item:
- Path: \`${workspaceDir}\`

It contains a checkout of the repository (which may include uncommitted changes from a previous attempt if this is a retry). All changes you make should be committed and pushed to a feature branch. Do not modify files outside the workspace directory.

## Available Tools

### task_complete
Call the \`task_complete\` tool (provided via MCP) when you have finished your work. This immediately stops the agent session with a "completed" status and prevents unnecessary retries.

\`\`\`
task_complete(reason: "Brief summary of what was accomplished")
\`\`\`

Use this as soon as the work item is done — do not continue looping after the task is complete.

### GitHub CLI (gh)
The \`gh\` CLI is available in your workspace for interacting with GitHub: creating pull requests, viewing issues, checking CI status, etc.
Note: \`gh\` is only available when the workspace uses a GitHub-hosted repository. Non-GitHub repos or custom container images may not have \`gh\` installed.

Common usage:
\`\`\`bash
gh pr create --title "..." --body "..."
gh pr view
gh issue view <number>
gh run list
\`\`\`

## Active Sensor Configuration

This workflow was dispatched by the following sensor:
${sensorLines.join("\n")}

---
`;
}
