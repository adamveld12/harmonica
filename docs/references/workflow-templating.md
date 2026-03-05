# Workflow Templating Reference

> See also: [Sensors Reference](./sensors.md) | [CLI & Environment Reference](./cli-and-env.md)

Complete reference for workflow file frontmatter configuration and Liquid template variables.

---

## Part 1: Frontmatter Reference

Every workflow file is a Markdown document with YAML frontmatter. All configuration lives in the frontmatter block between `---` delimiters.

### Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `workflow` | `string` | — | Identifier string (informational) |
| `poll_interval_ms` | `number` | `30000` | How often to poll Linear for new work items |
| `stall_timeout_ms` | `number` | `300000` | How long a worker can be idle before being killed (5 min default) |

### tracker

Controls which Linear work items are dispatched to agents. Connection details (API key, mode, state config) come from the referenced sensor.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"linear"` | Yes | Tracker type (only Linear is supported) |
| `sensor` | `string` | Yes | Name of a sensor defined in `.agents/sensors.yaml` |
| `filter_labels` | `string[]` | No | Require ALL labels to be present (AND logic) |
| `filter_states` | `string[]` | No | Filter to issues in any of these state names (issues mode only); preferred form |
| `filter_state` | `string` | No | Deprecated alias for `filter_states` with a single value; prefer `filter_states` |
| `filter_project` | `string` | No | Exact project name match (issues mode only) |
| `filter_assignees` | `string[]` | No | Filter to issues assigned to any of these Linear display names (OR logic). Overrides sensor-level `assignees` if set. Issues mode only. |
| `terminal_states` | `string[]` | No | Override which state names cause the worker to exit as completed; any stateLabel change to a listed value triggers completion |
| `project_id` | `string` | No | Scope to a single project by UUID (projects mode) |
| `project_name` | `string` | No | Scope to a single project by name, exact match (projects mode) |

> **Note:** `api_key` and `mode` are populated at runtime from the referenced sensor. `terminal_states` can be set per-workflow in the tracker section to override sensor defaults.

### agent

Controls the Claude Code agent session.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | `string` | `"claude-sonnet-4-20250514"` | Claude model ID |
| `max_turns` | `number` | `50` | Maximum agent turns before forced exit |
| `turn_timeout_ms` | `number` | `120000` | Milliseconds per turn before considered stalled |
| `max_retry_backoff_ms` | `number` | `300000` | Maximum retry delay (5 min) |
| `max_concurrency` | `number` | `3` | Maximum parallel workers |
| `permission_mode` | `"bypassPermissions"` \| `"default"` \| `"acceptEdits"` | `"bypassPermissions"` | Agent tool permission mode |
| `allowed_tools` | `string[]` | — | Whitelist of tool names; omit to allow all tools |
| `auth_method` | `"api_key"` \| `"subscription"` | `"subscription"` | How to authenticate with Anthropic |
| `api_key` | `string` | — | Anthropic API key; only needed when `auth_method: api_key` |

### workspace

Controls where agent workspaces are created and managed.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `base_dir` | `string` | `"~/.harmonica/workspaces"` | Parent directory for all workspaces; `~` is expanded |
| `repo_url` | `string` | Required | Git repository URL cloned by `after_create` hook |
| `cleanup_on_start` | `boolean` | `true` | Remove stale workspaces at orchestrator startup |
| `cleanup_on_terminal` | `boolean` | `true` | Remove workspace when worker exits terminal |

### hooks

Shell commands run at workspace lifecycle events. Each hook runs inside the workspace directory.

| Field | Type | Description |
|-------|------|-------------|
| `after_create` | `string` | Runs after workspace directory is created, before first agent run |
| `before_run` | `string` | Runs before each agent turn (including retries) |
| `after_run` | `string` | Runs after each agent turn completes |
| `before_remove` | `string` | Runs before workspace directory is deleted |
| `timeout_ms` | `number` | Hook timeout in milliseconds (default: `60000`) |

Hook strings support Liquid variables: `{{ workspace_dir }}`, `{{ issue_id }}`, etc.

### policy

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_concurrency` | `number` | — | Overrides `agent.max_concurrency` if set |
| `allow_multiple_per_issue` | `boolean` | `false` | Allow more than one worker per work item simultaneously |

---

## Part 2: Template Variables Reference

The workflow body is a [Liquid](https://liquidjs.com/) template rendered into the agent's first-turn prompt. All variables are available in every mode; unknown variables silently produce empty strings (`strictVariables: false`).

### `item` — always populated

Generic alias for the current work item, available in both issues and projects mode.

| Variable | Type | Description |
|----------|------|-------------|
| `{{ item.kind }}` | `string` | `"issue"` or `"project"` |
| `{{ item.id }}` | `string` | UUID |
| `{{ item.identifier }}` | `string` | Human identifier, e.g. `ENG-42` or project slug |
| `{{ item.title }}` | `string` | Display name |
| `{{ item.state }}` | `string` | `"active"`, `"terminal"`, or `"non_active"` |
| `{{ item.stateLabel }}` | `string` | Raw Linear state/status name |
| `{{ item.labels }}` | `string[]` | Array of label name strings |
| `{{ item.url }}` | `string` | Linear URL |
| `{{ item.createdAt }}` | `string` | ISO timestamp |
| `{{ item.updatedAt }}` | `string` | ISO timestamp |

### `issue` — populated in `mode: issues`

All fields from `NormalizedIssue`. Null/empty in projects mode.

| Variable | Type | Description |
|----------|------|-------------|
| `{{ issue.id }}` | `string` | UUID |
| `{{ issue.identifier }}` | `string` | e.g. `ENG-42` |
| `{{ issue.title }}` | `string` | Issue title |
| `{{ issue.description }}` | `string \| null` | Issue description |
| `{{ issue.state }}` | `string` | `"active"`, `"terminal"`, or `"non_active"` |
| `{{ issue.stateLabel }}` | `string` | Raw Linear state name |
| `{{ issue.labels }}` | `string[]` | Array of label name strings |
| `{{ issue.assigneeId }}` | `string \| null` | Assignee UUID |
| `{{ issue.assigneeName }}` | `string \| null` | Assignee display name |
| `{{ issue.projectName }}` | `string \| null` | Parent project name |
| `{{ issue.url }}` | `string` | Linear URL |
| `{{ issue.createdAt }}` | `string` | ISO timestamp |
| `{{ issue.updatedAt }}` | `string` | ISO timestamp |

### `project` — populated in `mode: projects`

All fields from `NormalizedProject`. Null/empty in issues mode.

| Variable | Type | Description |
|----------|------|-------------|
| `{{ project.id }}` | `string` | UUID |
| `{{ project.identifier }}` | `string` | Project slug |
| `{{ project.title }}` | `string` | Project name |
| `{{ project.description }}` | `string \| null` | Project description |
| `{{ project.state }}` | `string` | `"active"`, `"terminal"`, or `"non_active"` |
| `{{ project.stateLabel }}` | `string` | Raw status name |
| `{{ project.labels }}` | `string[]` | Array of label name strings |
| `{{ project.status }}` | `string` | Raw Linear status, e.g. `"started"` |
| `{{ project.health }}` | `string \| null` | `"onTrack"`, `"atRisk"`, `"offTrack"`, or null |
| `{{ project.leadName }}` | `string \| null` | Lead's display name |
| `{{ project.memberCount }}` | `number` | Number of project members |
| `{{ project.milestones }}` | `array` | Array of milestone objects (see below) |
| `{{ project.startDate }}` | `string \| null` | ISO date string |
| `{{ project.targetDate }}` | `string \| null` | ISO date string |
| `{{ project.progress }}` | `number` | Integer 0-100 |
| `{{ project.url }}` | `string` | Linear URL |
| `{{ project.createdAt }}` | `string` | ISO timestamp |
| `{{ project.updatedAt }}` | `string` | ISO timestamp |

**Milestone fields** (each item in `project.milestones`):

| Variable | Type | Description |
|----------|------|-------------|
| `{{ m.id }}` | `string` | Milestone UUID |
| `{{ m.name }}` | `string` | Milestone name |
| `{{ m.description }}` | `string \| null` | Milestone description |
| `{{ m.status }}` | `string` | Milestone status |
| `{{ m.progress }}` | `number` | Integer 0-100 |
| `{{ m.targetDate }}` | `string \| null` | ISO date string |

### `attempt` and `workspace_dir`

| Variable | Type | Description |
|----------|------|-------------|
| `{{ attempt }}` | `number` | Integer starting at 1, increments on each retry |
| `{{ workspace_dir }}` | `string` | Absolute path to the agent's workspace directory |

---

## Part 3: Liquid Syntax Quick Reference

Harmonica uses [LiquidJS](https://liquidjs.com/) with `strictVariables: false` — unknown variables produce empty strings rather than errors.

### Output

```liquid
{{ variable }}
{{ variable | default: "fallback" }}
{{ variable | upcase }}
{{ variable | downcase }}
{{ variable | strip }}
{{ variable | slice: 0, 5 }}
```

### Conditionals

```liquid
{% if project.leadName %}
Lead: {{ project.leadName }}
{% endif %}

{% if issue.labels contains "urgent" %}
URGENT: {{ issue.title }}
{% endif %}

{% if project.health == "offTrack" %}
WARNING: Project is off track
{% elsif project.health == "atRisk" %}
CAUTION: Project is at risk
{% else %}
Project is on track
{% endif %}
```

### Loops

```liquid
{% for label in issue.labels %}
- {{ label }}
{% endfor %}

{% for m in project.milestones %}
- {{ m.name }}: {{ m.status }} ({{ m.progress }}%)
  {% if m.targetDate %}Due: {{ m.targetDate }}{% endif %}
{% endfor %}
```

### Null / Empty Handling

```liquid
{{ project.description | default: "(no description)" }}

{% if project.milestones.size > 0 %}
...
{% endif %}

{% unless issue.assigneeName == nil %}
Assigned to: {{ issue.assigneeName }}
{% endunless %}
```

---

## Part 4: Hook Variables

Hooks run in the workspace directory as shell commands. Two types of variable substitution are available:

### Environment Variables (shell)

Set by Harmonica before running each hook:

| Variable | Value |
|----------|-------|
| `HARM_ISSUE_ID` | Work item UUID |
| `HARM_ISSUE_IDENTIFIER` | Human identifier, e.g. `ENG-42` or project slug |
| `HARM_WORKSPACE_DIR` | Absolute path to the workspace directory |
| `HARM_SESSION_ID` | Claude session ID (empty string in `after_create`) |
| `HARM_REPO_URL` | Repository URL from `workspace.repo_url` |

```yaml
hooks:
  after_create: git clone ${HARM_REPO_URL} .
  before_run: |
    echo "Starting run for ${HARM_ISSUE_IDENTIFIER}" >> /tmp/harm.log
    git fetch --quiet || true
```

### Liquid Variables (in hook strings)

Hook strings also support a subset of Liquid variables:

| Variable | Value |
|----------|-------|
| `{{ workspace_dir }}` | Absolute workspace path |
| `{{ issue_id }}` | Work item UUID |
| `{{ issue_identifier }}` | Human identifier |
| `{{ session_id }}` | Claude session ID |
| `{{ repo_url }}` | Repository URL |

---

## Part 5: Environment Variable Substitution

Use `${VAR}` or `$VAR` anywhere in YAML frontmatter values. Path fields additionally expand `~` to `$HOME`.

```yaml
workspace:
  base_dir: ~/my-workspaces          # ~ expands to $HOME
  repo_url: ${HARM_REPO_URL}
agent:
  api_key: ${ANTHROPIC_API_KEY}      # only needed for auth_method: api_key
```

Substitution happens at config load time. If a referenced variable is not set in the environment, the literal `${VAR}` string is left intact silently (no error is thrown).

---

## Part 6: Agent Completion

Agents can signal completion in two ways.

### `task_complete` tool

The simplest path: the agent calls a tool named `task_complete`. Harmonica automatically registers this as an MCP tool — no configuration is needed. The agent can call it at any time; Harmonica intercepts the tool_use event and immediately exits the worker with `exitReason: "completed"`. No Linear state change is required.

```
Tool: task_complete
Input (optional): { "reason": "implemented the feature and opened a PR" }
```

The `reason` field is optional. When present, it is logged and shown in the dashboard output.

**Example prompt instruction:**

```
When you have finished all your tasks, call the `task_complete` tool with a brief summary of what you did.
```

### Linear state change

The agent can use the Linear MCP tool to move the issue to a different state. After each agent turn, the worker checks the issue's current `stateLabel` from Linear. If the stateLabel has changed at all (not only to a terminal or non-active state), the worker evaluates whether to exit:

- If the new state is in `terminal_states` (configurable per-workflow in the `tracker` section, with sensor defaults as fallback), the worker exits with `exitReason: "terminal"`.
- If the new state is otherwise no longer active (not in `active_states`), the worker exits with `exitReason: "completed"`.

This means any stateLabel change — not just moving to "Done" — can trigger worker completion. Configure `terminal_states` in the tracker section to control which states are treated as terminal for a given workflow.

This path is useful when the workflow requires that Linear reflect the work status — for example, moving an issue from "In Progress" to "Done" as part of the task.

Both completion paths are treated identically by the orchestrator: the workspace is cleaned up (if `cleanup_on_terminal: true`) and the item is not retried.
