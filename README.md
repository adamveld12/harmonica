# Harmonica

An autonomous issue-driven coding agent orchestrator. Harmonica polls your Linear board, spins up isolated workspaces for active issues, and runs [Claude Code](https://github.com/anthropics/claude-code) agents to resolve them — continuously, in parallel, with retry and stall detection.

Implements the [OpenAI Symphony spec](https://github.com/openai/symphony) with **Claude Code** (via `@anthropic-ai/claude-agent-sdk`) as the underlying agent.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Harmonica                                │
│                                                                       │
│  .agents/sensors.yaml        (read from --workflows root dir)        │
│  ┌──────────────────┐                                                │
│  │  SensorManager   │  Named Linear API connections (issues/projects) │
│  │  (hot-reloaded)  │  Shared across workflows                       │
│  └────────┬─────────┘                                                │
│           │                                                           │
│  ┌────────▼─────────┐                                                │
│  │ WorkflowManager  │  Loads .md files from workflows/ subdir        │
│  │  (hot-reloaded)  │  Add/remove/edit .md files without restarting  │
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

## Quick Start

**Prerequisites:** [Bun](https://bun.sh/) >= 1.0, a Linear API key, and either an Anthropic API key or a Claude Pro/Max subscription (`claude login`).

**Install:**

```bash
pnpm install -g @vdhsn/harmonica
# or run without installing:
bunx @vdhsn/harmonica --workflows .agents
```

**Run from source:**

```bash
git clone <this-repo> && cd harmonica && pnpm install

# .env
echo "LINEAR_API_KEY=lin_api_..." > .env
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env  # skip if using subscription mode

bun run server/src/index.ts --workflows .agents
```

## Setup

Create a `.env` file (shell env vars take precedence; `--env-file <path>` for custom location):

```bash
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # required
ANTHROPIC_API_KEY=sk-ant-...                             # only for api_key auth mode
```

**Authentication** defaults to `subscription` mode (Claude Pro/Max via `claude login`). For API key mode, set `agent.auth_method: api_key` in your workflow frontmatter.

**Linear API key:** Linear → Settings → API → Personal API keys → Create key.

## Development

**Prerequisites:** Bun >= 1.0, pnpm >= 9, Node.js >= 18

```bash
pnpm install   # workspace monorepo — installs server/ and ui/
pnpm dev       # server (--watch) + Vite UI at http://localhost:6543
```

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

## Sensors

Named, shared Linear API connections defined in `.agents/sensors.yaml`. Hot-reloaded. Multiple workflows can share the same sensor.

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

See [Sensor Reference](docs/references/sensors.md) for all fields.

## Multi-Workflow Architecture

Use `--workflows .agents` to point to the root directory. Harmonica discovers `sensors.yaml` there and `.md` workflow files in `workflows/`:

```
.agents/
  sensors.yaml          # sensor definitions
  workflows/
    bug-fixer.md        # Watches "Bug" labeled issues
    feature-builder.md  # Watches "Feature" labeled issues
    project-planner.md  # Watches projects in planning state
```

All workflows share the same SensorManager and SQLite database. Everything hot-reloads: add/remove/edit `.md` files or `sensors.yaml` without restarting.

## Workflow File Format

A single `.md` file combines YAML config (between `---` fences) and a [Liquid](https://liquidjs.com/) prompt template:

```
---
tracker:
  type: linear
  sensor: linear-issues
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

### Tracker Config

```yaml
tracker:
  type: linear # required
  sensor: linear-issues # required; key from sensors.yaml
  mode: issues # "issues" (default) or "projects"
  filter_labels: [agent] # require ALL labels (AND)
  filter_states: ["In Progress"]
  filter_project: "Q3 Backlog"
  filter_assignees: ["Adam Veldhousen"] # OR logic
  active_states: ["In Progress", "In Review"] # overrides sensor
  terminal_states: [Done, Cancelled, Duplicate] # per-workflow
```

For `mode: projects`, use `project_name` or `project_id` to scope, and set `active_states`/`terminal_states` for project statuses.

### Agent Config

```yaml
agent:
  model: claude-sonnet-4-20250514
  max_turns: 50
  turn_timeout_s: 600
  max_retry_backoff_s: 300
  max_concurrency: 3
  permission_mode: bypassPermissions # bypassPermissions | default | acceptEdits
  auth_method: subscription # subscription | api_key
  api_key: ${ANTHROPIC_API_KEY} # only for api_key mode
  allowed_tools: [Read, Edit, Bash] # omit = all tools
  system_prompt: "" # omit = built-in; "" = disabled; string = custom
```

The built-in system prompt provides context about `task_complete`, `gh` CLI, workspace, and active filters. See [System Prompt Reference](docs/references/system-prompt.md).

### Workspace & Hooks

```yaml
workspace:
  repo_url: git@github.com:org/repo.git
  cleanup_on_start: true
  cleanup_on_terminal: true

hooks:
  after_create: git clone {{ repo_url }} .
  before_run: git fetch --quiet || true
  after_run: ""
  before_remove: ""
  timeout_s: 60
```

Hooks run inside the workspace directory. `after_create`/`before_run` failures are fatal; `after_run`/`before_remove` failures are logged. See [Hooks Reference](docs/references/hooks.md).

### Policy

```yaml
policy:
  max_concurrency: 3 # overrides agent.max_concurrency
  allow_multiple_per_issue: false
```

## Prompt Template Variables

Templates use [Liquid](https://liquidjs.com/) with permissive mode (unknown variables produce empty strings).

- **`item`** — always populated (generic: `kind`, `id`, `identifier`, `title`, `description`, `state`, `stateLabel`, `labels`, `url`, `createdAt`, `updatedAt`)
- **`issue`** — populated in `mode: issues` (adds `assigneeId`, `assigneeName`, `projectName`)
- **`project`** — populated in `mode: projects` (adds `status`, `health`, `leadName`, `memberCount`, `startDate`, `targetDate`, `progress`, `milestones`)
- **`attempt`** — retry count, starts at 1
- **`workspace_dir`** — absolute path to the workspace

Full field reference: [Workflow Templating Reference](docs/references/workflow-templating.md)

## CLI

```
Usage: harmonica [options]

  --workflows <path>          .agents/ root directory (default: ./.agents)
  --config-dir <path>         Config/data dir (env: HARM_CONFIG_DIR; default: ~/.harmonica)
  --server.port <number>      Dashboard port (env: HARM_SERVER_PORT)
  --server.host <host>        Dashboard host (env: HARM_SERVER_HOST)
  --workspace.repo_url <url>  Override workspace.repo_url from YAML
  --env-file <path>           Custom .env path (default: ./.env)
  --debug                     Verbose logging
  --help, -h                  Show help
```

See [CLI & Environment Reference](docs/references/cli-and-env.md) for full details.

## HTTP API

Enabled with `--server.port`. Serves the React dashboard and a REST + SSE API.

| Route                                   | Method | Description                        |
| --------------------------------------- | ------ | ---------------------------------- |
| `/api/v1/events`                        | GET    | SSE stream (state + notifications) |
| `/api/v1/workflows`                     | GET    | List all workflows                 |
| `/api/v1/workflows/:id/state`           | GET    | Workflow state snapshot            |
| `/api/v1/workflows/:id/config`          | GET    | Workflow config                    |
| `/api/v1/workflows/:id/completed`       | GET    | Completed items                    |
| `/api/v1/workflows/:id/refresh`         | POST   | Trigger immediate poll             |
| `/api/v1/workflows/:id/:itemId/stop`    | POST   | Stop a worker                      |
| `/api/v1/workflows/:id/:issueId/output` | GET    | Agent output for item              |
| `/api/v1/completed/:issueId/output`     | GET    | Completed output by issue ID       |

## Agent Completion

Two ways an agent signals it's done:

1. **`task_complete` MCP tool** — call to immediately stop with `completed` status (no Linear state change needed)
2. **Linear state change** — update the issue state via Linear MCP; worker detects `stateLabel` change and exits

Both produce `exitReason: "completed"`. Failed workers retry with exponential backoff; the session ID is preserved for context resumption.
