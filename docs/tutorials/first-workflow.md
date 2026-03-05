# Creating your first workflow

## What is a workflow?

A **workflow** is a Markdown file that combines YAML configuration (in the frontmatter) with a Liquid prompt template (in the body). Each workflow is an independent orchestrator -- it watches for matching Linear issues, spins up isolated workspaces, and runs Claude Code agents with your prompt.

Workflows live in the `.agents/workflows/` directory. You can have as many as you want running simultaneously.

## Prerequisites

Complete the [Setting up your first sensor](../tutorials/first-sensor.md) tutorial first. You should have:
- `.agents/sensors.yaml` with a `linear-issues` sensor
- A `.env` file with `LINEAR_API_KEY`

## Step 1: Create the workflows directory

```bash
mkdir -p .agents/workflows
```

## Step 2: Create the workflow file

Create `.agents/workflows/hello.md`:

```markdown
---
name: Hello World
tracker:
  type: linear
  sensor: linear-issues
  filter_states: ["In Progress"]
  terminal_states: ["Done", "Cancelled"]

agent:
  model: claude-sonnet-4-20250514
  max_turns: 10
  auth_method: subscription

workspace:
  repo_url: ${HARM_REPO_URL}
---

You are working on {{ issue.identifier }}: {{ issue.title }}.

{{ issue.description }}

Working directory: {{ workspace_dir }}
Attempt: {{ attempt }}

Explore the codebase and describe what you find. Report your findings.
```

Let's break down each section:

### Frontmatter: `tracker`

```yaml
tracker:
  type: linear
  sensor: linear-issues
  filter_states: ["In Progress"]
  terminal_states: ["Done", "Cancelled"]
```

- `type: linear` -- the tracker type
- `sensor: linear-issues` -- references the sensor you created in `.agents/sensors.yaml`
- `filter_states: ["In Progress"]` -- only process issues in any of these states (array form; the older `filter_state: "..."` single-string form still works as a deprecated alias)
- `terminal_states: ["Done", "Cancelled"]` -- states that cause the worker to exit as completed; any stateLabel change to one of these values triggers worker completion

### Frontmatter: `agent`

```yaml
agent:
  model: claude-sonnet-4-20250514
  max_turns: 10
  auth_method: subscription
```

- `model` -- which Claude model to use
- `max_turns` -- maximum number of tool-use turns before the agent stops
- `auth_method: subscription` -- use your Claude subscription (use `api_key` with an `api_key` field if you prefer API billing)

### Frontmatter: `workspace`

```yaml
workspace:
  repo_url: ${HARM_REPO_URL}
```

- `repo_url` -- the repository to clone into each agent's workspace

### Prompt template

The body after the frontmatter closing `---` is a [Liquid](https://liquidjs.com/) template. Available variables:

| Variable | Description |
|----------|-------------|
| `{{ issue.identifier }}` | Linear issue ID, e.g. `ENG-123` |
| `{{ issue.title }}` | Issue title |
| `{{ issue.description }}` | Issue description body |
| `{{ issue.state }}` | Current state name |
| `{{ issue.url }}` | Link to the issue in Linear |
| `{{ issue.labels }}` | Comma-separated label names |
| `{{ workspace_dir }}` | Absolute path to the agent's workspace |
| `{{ attempt }}` | Attempt number (starts at 1) |

See the [workflow templating reference](../references/workflow-templating.md) for the full list.

## Step 3: Add repo URL to .env

Add your repository URL to `.env`:

```bash
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HARM_REPO_URL=https://github.com/your-org/your-repo
```

## Step 4: Add workspace hooks

Hooks run shell commands at key points in the workspace lifecycle. Add them to the frontmatter:

```yaml
---
name: Hello World
tracker:
  type: linear
  sensor: linear-issues
  filter_states: ["In Progress"]
  terminal_states: ["Done", "Cancelled"]

agent:
  model: claude-sonnet-4-20250514
  max_turns: 10
  auth_method: subscription

workspace:
  repo_url: ${HARM_REPO_URL}

hooks:
  after_create: git clone ${HARM_REPO_URL} .
  before_run: git fetch --quiet || true
---
```

- `after_create` runs once when the workspace is first created. Here it clones your repo.
- `before_run` runs before each agent session. Here it fetches the latest changes.

Hooks have access to environment variables like `HARM_ISSUE_ID`, `HARM_ISSUE_IDENTIFIER`, `HARM_WORKSPACE_DIR`, and `HARM_REPO_URL`.

## Step 5: Run

```bash
bun run src/index.ts --workflows .agents/workflows/
```

Harmonica starts, loads your sensor and workflow, and begins polling Linear.

## Step 6: Test

1. Go to Linear and create a new issue
2. Move it to **In Progress**
3. Watch the Harmonica logs -- it should pick up the issue within the poll interval
4. The agent will clone your repo, explore the codebase, and report its findings

## Step 7: Monitor with the dashboard

Add `--server.port` to enable the built-in React dashboard:

```bash
bun run src/index.ts --workflows .agents/workflows/ --server.port 7842
```

Open `http://localhost:7842` in your browser to see:
- Active and completed agent runs
- Agent logs and output
- Workflow status

## What's next

- **Customize the prompt:** Give the agent specific tasks like implementing features, writing tests, or creating documentation.
- **Add more workflows:** Create additional `.md` files in `.agents/workflows/` for different purposes (planning, reviewing, implementing).
- **Filter by labels:** Use `filter_labels` to target specific issues. See the [Linear Issue Planner](../guides/linear-issue-planner.md) guide for an example.
- **Explore guides:** Check out the [guides](../guides/) for ready-made workflow recipes.
- **Signal completion:** Add `task_complete` to your prompt instructions so agents can self-terminate when done. Harmonica auto-registers this as an MCP tool — no config needed. Agents can also complete by moving the issue to a state listed in `terminal_states`. See the [Agent Completion guide](../guides/agent-completion.md).
