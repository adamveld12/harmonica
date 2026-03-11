# Harmonica

An autonomous issue-driven coding agent orchestrator. Harmonica polls your Linear board, spins up isolated workspaces for active issues, and runs [Claude Code](https://github.com/anthropics/claude-code) agents to resolve them — continuously, in parallel, with retry and stall detection.

## Relationship to the Symphony Spec

Harmonica implements the [OpenAI Symphony spec](https://github.com/openai/symphony) — a blueprint for agentic software engineering orchestrators — with one substitution: instead of Codex, it uses **Claude Code** (via `@anthropic-ai/claude-agent-sdk`) as the underlying agent. The core loop (poll → dispatch → multi-turn session → retry → reconcile) follows the spec faithfully.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Harmonica                                │
│                                                                       │
│  .agents/sensors.yaml                                                │
│  ┌──────────────────┐                                                │
│  │  SensorManager   │  Named Linear API connections (issues/projects) │
│  │  (hot-reloaded)  │  Shared across workflows                       │
│  └────────┬─────────┘                                                │
│           │                                                           │
│  ┌────────▼─────────┐                                                │
│  │ WorkflowManager  │  Loads .md files from --workflows dir          │
│  └──┬──────┬────────┘                                                │
│     │      │      ...one orchestrator per workflow file               │
│  ┌──▼──┐ ┌─▼───┐                                                    │
│  │Orch │ │Orch │  Each: poll sensor → dispatch → workers → reconcile │
│  │  1  │ │  2  │                                                     │
│  └──┬──┘ └──┬──┘                                                     │
│     │       │                                                         │
│  ┌──▼───────▼──────────────────────────────────────┐                 │
│  │              Agent Workers (per item)             │                 │
│  │  ┌────────────────┐  ┌────────────────┐          │                 │
│  │  │ Workspace      │  │ Workspace      │          │                 │
│  │  │ (isolated dir) │  │ (isolated dir) │   ...    │                 │
│  │  ├────────────────┤  ├────────────────┤          │                 │
│  │  │ Hooks          │  │ Hooks          │          │                 │
│  │  ├────────────────┤  ├────────────────┤          │                 │
│  │  │ Claude Code    │  │ Claude Code    │          │                 │
│  │  │ agent session  │  │ agent session  │          │                 │
│  │  └────────────────┘  └────────────────┘          │                 │
│  └──────────────────────────────────────────────────┘                 │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  HTTP Dashboard (React UI)  —  enabled with --server.port     │   │
│  │  GET /  |  SSE /api/v1/events  |  REST /api/v1/workflows/... │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  SQLite persistence  (~/.harmonica/harmonica.db)        │   │
│  └───────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- Linear API key (Personal API key, not OAuth)
- Anthropic API key **or** a Claude Pro/Max subscription logged in via `claude login`

## Installation

### Docker (recommended for sandboxed environments)

Pull and run the image directly — no local Bun, `gh`, or `pnpm` installation needed:

```bash
docker run --rm \
  -e LINEAR_API_KEY=lin_api_... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v "$PWD/.agents/sensors.yaml:/data/.agents/sensors.yaml:ro" \
  -v "$PWD/.agents/workflows:/data/workflows" \
  ghcr.io/adamveld12/harmonica:latest
```

Mount `~/.claude` to use a Claude Pro/Max subscription instead of an API key:

```bash
docker run --rm \
  -e LINEAR_API_KEY=lin_api_... \
  -v "$HOME/.claude:/home/harmonica/.claude:ro" \
  -v "$PWD/.agents/sensors.yaml:/data/.agents/sensors.yaml:ro" \
  -v "$PWD/.agents/workflows:/data/workflows" \
  ghcr.io/adamveld12/harmonica:latest
```

See the [Docker guide](docs/guides/docker.md) for volume mounts, dashboard setup, Docker Compose, and SSH key usage.

### npm (global install)

Install globally from npm (requires [Bun](https://bun.sh/) >= 1.0):

```bash
pnpm install -g @vdhsn/harmonica
# or
npm install -g @vdhsn/harmonica
```

Or run without installing:

```bash
bunx @vdhsn/harmonica --workflows .agents/workflows/
```

## Quick Start

```bash
git clone <this-repo>
cd harmonica
pnpm install

# Set up your .env
echo "LINEAR_API_KEY=lin_api_..." > .env
# Option A: API key auth
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env

# Option B: Claude subscription auth (no ANTHROPIC_API_KEY needed)
# claude login   # one-time OAuth setup

# Run all workflows in the .agents/workflows/ directory
bun run server/src/index.ts --workflows .agents/workflows/
```

## Development

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [pnpm](https://pnpm.io/) >= 9
- [Node.js](https://nodejs.org/) >= 18 (for tooling)

### Install dependencies

```bash
pnpm install
```

This is a pnpm workspace monorepo. `pnpm install` at the root installs dependencies for both packages (`server/` and `ui/`).

### Run in dev mode

```bash
pnpm dev
```

This starts both the server (with `--watch` for auto-reload) and the Vite dev server for the UI concurrently. The dashboard is available at `http://localhost:6543`.

To run only the server:

```bash
pnpm dev:server
```

To run only the UI dev server:

```bash
pnpm dev:ui
```

### Available scripts

| Script            | Description                                       |
| ----------------- | ------------------------------------------------- |
| `pnpm dev`        | Start server + UI dev server concurrently         |
| `pnpm dev:server` | Server only with `--watch` auto-reload            |
| `pnpm dev:ui`     | Vite dev server for the dashboard                 |
| `pnpm build`      | Build server (`server/dist/`) and UI (`ui/dist/`) |
| `pnpm typecheck`  | Run `tsc --noEmit` against `server/`              |
| `pnpm lint`       | Lint server + UI source                           |
| `pnpm format`     | Format all source files                           |
| `pnpm test`       | Run tests                                         |

### Project layout

```
philharmonic/
  package.json              # @vdhsn/harmonica — publishable root
  pnpm-workspace.yaml       # workspace: [server, ui]
  tsconfig.json             # project-references wrapper
  server/
    package.json            # harmonica-server (private)
    tsconfig.json           # server tsconfig (bun types)
    src/                    # orchestrator source (TypeScript)
  ui/
    package.json            # harmonica-ui (private)
    tsconfig.json
    src/                    # React dashboard
```

## Setup Guide

### .env File

Harmonica automatically loads a `.env` file from the current directory before resolving config. This means you don't need to `export` variables in your shell.

```bash
# .env
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-...
```

Rules:

- Existing shell environment variables **take precedence** — `.env` never overrides what's already set.
- Comments (`# ...`) and blank lines are ignored.
- Single and double quoted values are supported.
- Use `--env-file <path>` to load a custom file instead (silently skipped if the file is missing).

### Authentication

**Subscription mode** (default) — for Claude Pro/Max subscribers. No `ANTHROPIC_API_KEY` needed. Run `claude login` once to authenticate:

```yaml
agent:
  auth_method: subscription # default
```

**API key mode** — set `ANTHROPIC_API_KEY` in your environment or `.env` file:

```yaml
agent:
  auth_method: api_key
  api_key: ${ANTHROPIC_API_KEY} # optional, only needed for api_key mode
```

Harmonica will delegate auth to the `claude` CLI's OAuth credentials when using subscription mode.

### Linear API Token

1. Open Linear → **Settings** → **API** → **Personal API keys**
2. Click **Create key**, give it a name, copy the value
3. Set it in your `.env` file or export it:
   ```bash
   LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

## Sensors

Sensors are named, shared Linear API connections defined in `.agents/sensors.yaml`. Each sensor maintains a persistent connection to Linear and polls for issues or projects at a configured interval.

```yaml
# .agents/sensors.yaml
linear-issues:
  type: linear
  api_key: ${LINEAR_API_KEY}
  mode: issues
  poll_interval_s: 15
  active_states: ["Backlog", "On Deck", "In Progress", "In Review"]
  assignees:
    - "Adam Veldhousen"

linear-projects:
  type: linear
  api_key: ${LINEAR_API_KEY}
  mode: projects
  poll_interval_s: 30
  active_states: ["Planning"]
```

Key points:

- The file is **hot-reloaded** — changes are picked up without restarting Harmonica.
- Multiple workflows can share the same sensor, avoiding duplicate API connections.
- Workflows reference sensors by key name via `tracker.sensor` in their frontmatter.
- Sensor fields: `type`, `api_key`, `mode` (issues/projects), `poll_interval_s`, `refresh_ttl_s`, `active_states`, `assignees`.
- `terminal_states` is configured per-workflow in the `tracker` section, not on the sensor.

## Multi-Workflow Architecture

Harmonica supports running multiple workflows simultaneously. Use `--workflows <dir>` to load all `.md` files from a directory. Each workflow file gets its own orchestrator instance, with its own tracker config, agent config, and prompt template.

```
.agents/workflows/
  bug-fixer.md          # Watches "Bug" labeled issues
  feature-builder.md    # Watches "Feature" labeled issues
  project-planner.md    # Watches projects in planning state
```

All workflows share the same SensorManager (and thus the same Linear API connections) and the same SQLite database for persistence.

## Workflow File Format

A single `.md` file combines config and prompt. Everything between the first pair of `---` fences is YAML config; the rest is a [Liquid](https://liquidjs.com/) template rendered for each item.

```
---
tracker:
  type: linear
  sensor: linear-issues       # references a key in sensors.yaml (required)
  filter_labels:
    - agent

agent:
  model: claude-sonnet-4-20250514
  max_turns: 30
---

You are an autonomous software engineer working on {{ issue.identifier }}.

## {{ issue.title }}

{{ issue.description }}

Workspace: {{ workspace_dir }}
Attempt: {{ attempt }}
```

Hot reload is supported — Harmonica watches workflow files and applies changes without restarting.

### Tracker Config

```yaml
tracker:
  type: linear # required; only "linear" is supported
  sensor: linear-issues # required; references a key in sensors.yaml
  mode: issues # "issues" (default) or "projects" — can override sensor
```

The `sensor` field is **required** and must match a key defined in `.agents/sensors.yaml`. The sensor provides the Linear API connection, polling interval, and active state classification. The tracker can optionally override `mode` and `active_states` from the sensor, and defines its own `terminal_states`.

### Filtering Issues (mode: issues)

By default Harmonica works every issue whose Linear state is classified as active by the sensor. You can narrow the set:

```yaml
tracker:
  sensor: linear-issues
  mode: issues # default

  # Only issues that have ALL of these labels (AND logic)
  filter_labels:
    - agent
    - ready

  # Only issues in one of these state names (array form)
  filter_states:
    - "In Progress"

  # Only issues belonging to a specific project (by name)
  filter_project: "Q3 Backlog"

  # Only issues assigned to one of these Linear display names (OR logic)
  filter_assignees:
    - "Adam Veldhousen"
    - "Jane Smith"

  # Override which state names count as "active" (ready to work)
  active_states:
    - "In Progress"
    - "In Review"

  # Define which state names count as "terminal" (workspace removed)
  terminal_states:
    - Done
    - Cancelled
    - Duplicate
```

`active_states` overrides the sensor's active state classification. `terminal_states` is defined per-workflow (not inherited from the sensor). Any state not in either list is `non_active` (skipped).

### Filtering Projects (mode: projects)

Use `mode: projects` to dispatch agents per Linear **project** instead of per issue. Each project becomes a work item with full milestone and metadata context.

```yaml
tracker:
  sensor: linear-projects
  mode: projects

  # Scope to a specific project (optional; omit to watch all projects)
  project_name: "Q3 Infrastructure"
  # Or by UUID:
  project_id: "abc123..."

  # Override project status classification
  active_states:
    - "started"
  terminal_states:
    - "completed"
    - "cancelled"
```

By default only projects with status matching the sensor's `active_states` are dispatched.

### Agent Config

```yaml
agent:
  model: claude-sonnet-4-20250514 # any Claude model ID
  max_turns: 50 # max agent turns before giving up
  turn_timeout_s: 600 # s to wait for a single turn response
  max_retry_backoff_s: 300 # max delay between retries (5 min)
  max_concurrency: 3 # max parallel agent workers
  permission_mode: bypassPermissions # bypassPermissions | default | acceptEdits
  auth_method: subscription # subscription (default) | api_key
  api_key: ${ANTHROPIC_API_KEY} # optional; only needed for api_key auth_method
  allowed_tools: # whitelist tool names (omit = all tools)
    - Read
    - Edit
    - Bash
```

### Workspace Config

```yaml
workspace:
  repo_url: git@github.com:org/repo.git # required; supports HTTPS and SSH URLs
  cleanup_on_start: true # remove stale workspaces at startup
  cleanup_on_terminal: true # remove workspace when issue goes terminal
```

Each item gets its own subdirectory under `$HARM_CONFIG_DIR/workspaces/`, named `{identifier}-{id_prefix}` (e.g. `ENG-42-a1b2c3d4`).

### Hooks

Shell commands executed at lifecycle events. Run inside the workspace directory. Stdout/stderr are logged. A non-zero exit code is fatal — `after_create` and `before_run` failures prevent the agent from starting; `after_run` and `before_remove` failures are logged as errors and skip workspace cleanup.

```yaml
hooks:
  after_create: |
    git clone {{ repo_url }} .
  before_run: git fetch --quiet || true
  after_run: ""
  before_remove: ""
  timeout_s: 60 # max time per hook (s)
```

| Hook            | When                                                  |
| --------------- | ----------------------------------------------------- |
| `after_create`  | Workspace directory created, before the agent starts  |
| `before_run`    | Before the agent worker starts (including on retries) |
| `after_run`     | After the agent worker completes (any exit reason)    |
| `before_remove` | Before workspace directory is deleted                 |

Hook strings support [Liquid](https://liquidjs.com/) template variables including `{{ issue.identifier }}`, `{{ item.title }}`, `{{ workspace_dir }}`, `{{ attempt }}`, and more. See [Hooks Reference](docs/references/hooks.md) for full details.

Environment variables available in hooks:

| Variable                | Value                                       |
| ----------------------- | ------------------------------------------- |
| `HARM_ISSUE_ID`         | Linear UUID of the issue                    |
| `HARM_ISSUE_IDENTIFIER` | Human identifier, e.g. `ENG-42`             |
| `HARM_WORKSPACE_DIR`    | Absolute path to the workspace directory    |
| `HARM_SESSION_ID`       | Claude session ID (empty in `after_create`) |

### Policy

```yaml
policy:
  max_concurrency: 3 # overrides agent.max_concurrency if set
  allow_multiple_per_issue: false # allow >1 worker per issue simultaneously
```

## Prompt Template

The body of a workflow `.md` file is a [Liquid](https://liquidjs.com/) template. Unknown variables silently produce empty strings (permissive mode), so templates written for one mode won't error in the other.

### Available Variables

**`item`** — generic access, always populated regardless of mode:

| Field              | Type                                     | Description                      |
| ------------------ | ---------------------------------------- | -------------------------------- |
| `item.kind`        | `"issue" \| "project"`                   | Discriminant                     |
| `item.id`          | `string`                                 | Linear UUID                      |
| `item.identifier`  | `string`                                 | e.g. `ENG-42` or project slug    |
| `item.title`       | `string`                                 | Issue/project title              |
| `item.description` | `string \| null`                         | Issue/project description        |
| `item.state`       | `"active" \| "terminal" \| "non_active"` | Canonical state                  |
| `item.stateLabel`  | `string`                                 | Raw Linear state name            |
| `item.labels`      | `string[]`                               | Label names (empty for projects) |
| `item.url`         | `string`                                 | Linear URL                       |
| `item.createdAt`   | `string`                                 | ISO timestamp                    |
| `item.updatedAt`   | `string`                                 | ISO timestamp                    |

**`issue`** — populated in `mode: issues`, `null` in `mode: projects`:

| Field                | Type                                     | Description           |
| -------------------- | ---------------------------------------- | --------------------- |
| `issue.id`           | `string`                                 | Linear UUID           |
| `issue.identifier`   | `string`                                 | e.g. `ENG-42`         |
| `issue.title`        | `string`                                 | Issue title           |
| `issue.description`  | `string \| null`                         | Issue body            |
| `issue.state`        | `"active" \| "terminal" \| "non_active"` | Canonical state       |
| `issue.stateLabel`   | `string`                                 | Raw Linear state name |
| `issue.labels`       | `string[]`                               | Label names           |
| `issue.assigneeId`   | `string \| null`                         | Assignee UUID         |
| `issue.assigneeName` | `string \| null`                         | Assignee display name |
| `issue.projectName`  | `string \| null`                         | Parent project name   |
| `issue.url`          | `string`                                 | Linear URL            |
| `issue.createdAt`    | `string`                                 | ISO timestamp         |
| `issue.updatedAt`    | `string`                                 | ISO timestamp         |

**`project`** — populated in `mode: projects`, `null` in `mode: issues`:

| Field                 | Type                                     | Description                                    |
| --------------------- | ---------------------------------------- | ---------------------------------------------- |
| `project.id`          | `string`                                 | Linear UUID                                    |
| `project.identifier`  | `string`                                 | Project slug                                   |
| `project.title`       | `string`                                 | Project name                                   |
| `project.description` | `string \| null`                         | Project description                            |
| `project.state`       | `"active" \| "terminal" \| "non_active"` | Canonical state                                |
| `project.stateLabel`  | `string`                                 | Raw status name                                |
| `project.status`      | `string`                                 | Raw status name (e.g. `"started"`)             |
| `project.health`      | `string \| null`                         | `"onTrack"`, `"atRisk"`, `"offTrack"`, or null |
| `project.leadName`    | `string \| null`                         | Project lead display name                      |
| `project.memberCount` | `number`                                 | Number of members                              |
| `project.startDate`   | `string \| null`                         | ISO date                                       |
| `project.targetDate`  | `string \| null`                         | ISO date                                       |
| `project.progress`    | `number`                                 | 0–100                                          |
| `project.milestones`  | `Milestone[]`                            | See below                                      |
| `project.url`         | `string`                                 | Linear URL                                     |
| `project.createdAt`   | `string`                                 | ISO timestamp                                  |
| `project.updatedAt`   | `string`                                 | ISO timestamp                                  |

Each milestone in `project.milestones`:

| Field         | Type             | Description           |
| ------------- | ---------------- | --------------------- |
| `id`          | `string`         | UUID                  |
| `name`        | `string`         | Milestone name        |
| `description` | `string \| null` | Milestone description |
| `status`      | `string`         | Milestone status      |
| `progress`    | `number`         | 0–100                 |
| `targetDate`  | `string \| null` | ISO date              |

**`attempt`** — `number`, starts at 1, increments on retry.

**`workspace_dir`** — `string`, absolute path to the work item's workspace.

Example template snippet:

```liquid
{% if issue.description %}
## Description
{{ issue.description }}
{% endif %}

This is attempt {{ attempt }} of resolving {{ issue.identifier }}.
Working directory: `{{ workspace_dir }}`
```

## CLI Reference

```
Usage: harmonica [options]

Options:
  --workflows <path>          Path to a directory of .md workflow files (default: ./workflows/)
  --config-dir <path>         Config/data directory (env: HARM_CONFIG_DIR; default: ~/.harmonica)
  --server.port <number>      HTTP dashboard port (env fallback: HARM_SERVER_PORT; CLI takes precedence)
  --server.host <host>        HTTP dashboard host (env fallback: HARM_SERVER_HOST; CLI takes precedence)
  --workspace.repo_url <url>  Repository URL (overrides workspace.repo_url in YAML)
  --env-file <path>           Path to .env file (default: ./.env if present, a warning is emitted if the file is missing)
  --debug                     Enable verbose debug logging (parsed but doesn't currently change log behavior)
  --help, -h                  Show help
```

| Flag                   | Default        | Description                                                            |
| ---------------------- | -------------- | ---------------------------------------------------------------------- |
| `--workflows`          | `./workflows/` | Directory of workflow `.md` files                                      |
| `--config-dir`         | `~/.harmonica` | Config/data directory; CLI takes precedence over env `HARM_CONFIG_DIR` |
| `--server.port`        | —              | Dashboard port; CLI takes precedence over env `HARM_SERVER_PORT`       |
| `--server.host`        | —              | Dashboard host; CLI takes precedence over env `HARM_SERVER_HOST`       |
| `--workspace.repo_url` | —              | Repository URL; overrides `workspace.repo_url` in YAML                 |
| `--env-file`           | `./.env`       | Load environment variables from this file before startup               |
| `--debug`              | `false`        | Parsed but doesn't currently change log behavior                       |
| `--help` / `-h`        | —              | Print usage and exit                                                   |

## Environment Variables

| Variable            | Required            | Description                                                                           |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| `LINEAR_API_KEY`    | Yes                 | Linear personal API key (used in sensors.yaml)                                        |
| `ANTHROPIC_API_KEY` | `api_key` mode only | Anthropic API key (not needed for `subscription` mode)                                |
| `HARM_CONFIG_DIR`   | No                  | Config/data directory; overridden by `--config-dir` CLI flag. Default: `~/.harmonica` |
| `HARM_SERVER_PORT`  | No                  | HTTP dashboard port (env fallback; CLI `--server.port` takes precedence)              |
| `HARM_SERVER_HOST`  | No                  | HTTP dashboard host (env fallback; CLI `--server.host` takes precedence)              |

**Env var interpolation in YAML**: use `${VAR_NAME}` anywhere in the YAML frontmatter or sensors file. If a variable is not set, the `${VAR_NAME}` string is left intact (no error). Path-like fields also expand `~` to the home directory.

```yaml
tracker:
  sensor: linear-issues
workspace:
  repo_url: ${HARM_REPO_URL}
```

## HTTP API

The HTTP dashboard is enabled by passing `--server.port <number>`. It serves a React UI and exposes a REST + SSE API.

### Per-Workflow Routes

| Route                                   | Method | Description                                    |
| --------------------------------------- | ------ | ---------------------------------------------- |
| `/api/v1/events`                        | GET    | SSE stream (`state` and `notification` events) |
| `/api/v1/workflows`                     | GET    | List all workflows                             |
| `/api/v1/workflows/:id/state`           | GET    | State snapshot for a workflow                  |
| `/api/v1/workflows/:id/config`          | GET    | Config for a workflow                          |
| `/api/v1/workflows/:id/completed`       | GET    | Completed items for a workflow                 |
| `/api/v1/workflows/:id/refresh`         | POST   | Trigger immediate sensor poll                  |
| `/api/v1/workflows/:id/:itemId/stop`    | POST   | Stop a running worker                          |
| `/api/v1/workflows/:id/:issueId/output` | GET    | Agent output for an item                       |

### Global Routes

| Route                               | Method | Description                                     |
| ----------------------------------- | ------ | ----------------------------------------------- |
| `/api/v1/completed/:issueId/output` | GET    | Completed agent output by issue ID (queries DB) |
| `/`                                 | GET    | React dashboard UI (served from `ui/dist/`)     |

## Linear MCP Tool

Agents running inside Harmonica have access to a Linear MCP tool — a stdio JSON-RPC server that provides GraphQL access to the Linear API. This allows agents to query and mutate Linear data (comment on issues, update status, fetch related issues, etc.) using the same API connection established by the sensor.

## SQLite Persistence

Harmonica stores state in a SQLite database at `$HARM_CONFIG_DIR/harmonica.db` (default: `~/.harmonica/harmonica.db`), shared across all workflows. This enables:

- Completed item history that persists across restarts
- Agent output retrieval after sessions end
- Deduplication of work items across workflows

## Agent Completion

There are two ways an agent can signal that it has finished working:

1. **`task_complete` tool** — Harmonica automatically registers a `task_complete` MCP tool for every agent session. The agent calls this tool to immediately stop the worker with `completed` status. An optional `reason` string can be provided. This is the simplest path — no Linear state change is needed.

2. **Linear state change** — The agent uses the Linear MCP tool to update the issue state (e.g., move to "Done"). After each turn, the worker checks whether the issue's `stateLabel` has changed; any change triggers worker exit.

Both paths produce `exitReason: "completed"` and are treated identically — the workspace is cleaned up (if configured), and the item is not retried.

## How It Works

Harmonica runs a **SensorManager** that polls Linear at configured intervals (per sensor) and maintains a shared cache of issues/projects. Each **workflow** has its own **Orchestrator** that reads from its referenced sensor and classifies items as `active`, `terminal`, or `non_active`.

Active items without a running worker are dispatched up to `max_concurrency` at a time (with a 30s cooldown between re-dispatches of the same item). Each worker clones or reuses a workspace directory, runs lifecycle hooks, then drives a multi-turn Claude Code session by rendering the Liquid prompt and streaming agent events.

If a worker exits with a non-terminal reason (error, stall, `max_turns`), the item enters an exponential-backoff retry queue — the Claude session ID is preserved so the next turn can resume context. A reconciliation pass on each poll detects stalled workers (no events for `stall_timeout_s`) and aborts them. After each turn, the worker checks the item's `stateLabel`; any change triggers immediate worker exit. Items that transition to a terminal state mid-run are aborted immediately and their workspaces cleaned up.

The continuation prompt sent on resume is: _"Continue working on the issue. Review what you have done so far and complete any remaining tasks."_

## Full Config Reference

| Field                             | Type                          | Default                    | Description                                                                                                                 |
| --------------------------------- | ----------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `poll_interval_s`                 | `number`                      | `30`                       | How often to poll Linear (s)                                                                                                |
| `stall_timeout_s`                 | `number`                      | `300`                      | Abort worker if no event for this long (s)                                                                                  |
| **tracker**                       |                               |                            |                                                                                                                             |
| `tracker.type`                    | `"linear"`                    | —                          | Tracker type (required)                                                                                                     |
| `tracker.sensor`                  | `string`                      | —                          | Sensor key from sensors.yaml (required)                                                                                     |
| `tracker.mode`                    | `"issues" \| "projects"`      | `"issues"`                 | Dispatch per-issue or per-project (can override sensor)                                                                     |
| `tracker.filter_labels`           | `string[]`                    | —                          | (issues mode) Require ALL labels                                                                                            |
| `tracker.filter_states`           | `string[]`                    | —                          | (issues mode) Require issue state to match one of these names                                                               |
| `tracker.filter_project`          | `string`                      | —                          | (issues mode) Require matching project name                                                                                 |
| `tracker.filter_assignees`        | `string[]`                    | —                          | (issues mode) Filter to issues assigned to any of these display names (OR logic); falls back to sensor `assignees` if unset |
| `tracker.project_id`              | `string`                      | —                          | (projects mode) Scope to project UUID                                                                                       |
| `tracker.project_name`            | `string`                      | —                          | (projects mode) Scope to project by name                                                                                    |
| `tracker.active_states`           | `string[]`                    | —                          | Override active state names (inherited from sensor if omitted)                                                              |
| `tracker.terminal_states`         | `string[]`                    | —                          | Per-workflow terminal state names (not inherited from sensor)                                                               |
| **agent**                         |                               |                            |                                                                                                                             |
| `agent.model`                     | `string`                      | `claude-sonnet-4-20250514` | Claude model ID                                                                                                             |
| `agent.max_turns`                 | `number`                      | `50`                       | Max turns before giving up                                                                                                  |
| `agent.turn_timeout_s`            | `number`                      | `600`                      | Per-turn timeout (s)                                                                                                        |
| `agent.max_retry_backoff_s`       | `number`                      | `300`                      | Max retry delay (s)                                                                                                         |
| `agent.max_concurrency`           | `number`                      | `3`                        | Max parallel workers                                                                                                        |
| `agent.permission_mode`           | `string`                      | `"bypassPermissions"`      | Claude tool permission mode                                                                                                 |
| `agent.auth_method`               | `"subscription" \| "api_key"` | `"subscription"`           | Auth mode                                                                                                                   |
| `agent.api_key`                   | `string`                      | —                          | Anthropic API key (optional; only for `api_key` mode)                                                                       |
| `agent.allowed_tools`             | `string[]`                    | —                          | Whitelist of tool names (all if omitted)                                                                                    |
| **workspace**                     |                               |                            |                                                                                                                             |
| `workspace.repo_url`              | `string`                      | —                          | Repository URL (required; HTTPS or SSH)                                                                                     |
| `workspace.cleanup_on_start`      | `boolean`                     | `true`                     | Remove stale workspaces at startup                                                                                          |
| `workspace.cleanup_on_terminal`   | `boolean`                     | `true`                     | Remove workspace on terminal item                                                                                           |
| **hooks**                         |                               |                            |                                                                                                                             |
| `hooks.after_create`              | `string`                      | —                          | Shell command after workspace created                                                                                       |
| `hooks.before_run`                | `string`                      | —                          | Shell command before each agent turn                                                                                        |
| `hooks.after_run`                 | `string`                      | —                          | Shell command after each agent turn                                                                                         |
| `hooks.before_remove`             | `string`                      | —                          | Shell command before workspace removed                                                                                      |
| `hooks.timeout_s`                 | `number`                      | `60`                       | Timeout per hook execution (s)                                                                                              |
| **policy**                        |                               |                            |                                                                                                                             |
| `policy.max_concurrency`          | `number`                      | —                          | Overrides `agent.max_concurrency`                                                                                           |
| `policy.allow_multiple_per_issue` | `boolean`                     | `false`                    | Allow >1 worker per item                                                                                                    |
