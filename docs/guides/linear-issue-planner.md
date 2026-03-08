# Set up a Linear Issue Planner

## What you'll build

A workflow where Harmonica automatically picks up Backlog issues labeled `!plan`, reads the codebase, writes an implementation plan, posts it as a Linear comment, moves the ticket to "Ready for Development", and removes the `!plan` label. This turns ticket planning into an automated step -- just add a label and walk away.

## Prerequisites

- [Bun](https://bun.sh) installed
- A Linear API key (Settings > API > Personal API keys)
- A Claude subscription (or Anthropic API key)
- A git repository your agent will explore

## Step 1: Create the sensor

Create `.agents/sensors.yaml` (or add to your existing one). This defines the Linear API connection your workflow will use.

```yaml
linear-issues:
  type: linear
  api_key: ${LINEAR_API_KEY}
  mode: issues
  poll_interval_s: 15
  active_states:
    - "Backlog"
    - "In Progress"
```

The sensor polls Linear every 15 seconds and considers "Backlog" and "In Progress" as active states. The `${LINEAR_API_KEY}` syntax pulls the value from your environment.

## Step 2: Create the workflow

Create `.agents/workflows/planner.md`:

```markdown
---
name: Issue Planner
tracker:
  type: linear
  sensor: linear-issues
  filter_states:
    - "Backlog"
  filter_labels:
    - "!plan"
  terminal_states:
    - "Done"
    - "Cancelled"

agent:
  model: claude-sonnet-4-20250514
  max_turns: 30
  auth_method: subscription

workspace:
  repo_url: ${HARM_REPO_URL}

hooks:
  after_create: git clone {{ repo_url }} .
  before_run: git fetch --quiet || true
  timeout_s: 60

policy:
  max_concurrency: 3
  allow_multiple_per_issue: false
---

You are a senior software engineer planning the implementation for issue {{ issue.identifier }}: {{ issue.title }}.

## Issue Details

{{ issue.description }}

Issue URL: {{ issue.url }}

## Your Task

1. **Understand the issue.** Read the full issue description above carefully.

2. **Explore the codebase.** Navigate the repository at {{ workspace_dir }} to understand the architecture, relevant files, and existing patterns. Focus on areas the issue will touch.

3. **Write an implementation plan.** Create a detailed, actionable plan that includes:
   - Which files need to be created or modified
   - Key code changes with enough detail that another developer (or agent) can implement them
   - Any potential risks or edge cases
   - Suggested test approach

4. **Post the plan as a Linear comment.** Use the Linear MCP tool to add a comment to issue {{ issue.id }} with your plan. Format it clearly with markdown.

5. **Move the issue.** Use the Linear MCP tool to:
   - Change the issue state to "Ready for Development"
   - Remove the "!plan" label from the issue

Do NOT implement any code changes. Your job is strictly planning and documentation.
```

### What this does

- `filter_states: ["Backlog"]` -- only picks up issues in the Backlog state
- `filter_labels: ["!plan"]` -- only picks up issues that have the `!plan` label
- The prompt instructs the agent to explore, plan, comment, and update the issue state
- The agent uses the Linear MCP tool (automatically available) to interact with Linear

## Step 3: Set up .env

Create a `.env` file in your project root (or export these in your shell):

```bash
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Replace the value with your actual Linear API key.

## Step 4: Run

```bash
bun run server/src/index.ts --workflows .agents/workflows/
```

Harmonica will start polling Linear and processing any matching issues.

## Step 5: Test

1. Go to Linear and create a new issue in the **Backlog** state
2. Add the label `!plan` to the issue (create the label first if it doesn't exist)
3. Watch the Harmonica logs -- it should pick up the issue within 15 seconds
4. After the agent finishes, check the Linear issue for:
   - A detailed implementation plan posted as a comment
   - The issue moved to "Ready for Development"
   - The `!plan` label removed

## Step 6: Monitor

Add the dashboard for a visual overview:

```bash
bun run server/src/index.ts --workflows .agents/workflows/ --server.port 7842
```

Open `http://localhost:7842` to see active agents, completed runs, and logs.

## Tips

- **Change which issues get picked up:** Adjust `filter_states` and `filter_labels` in the workflow frontmatter. For example, use `filter_states: ["On Deck"]` to plan issues that have been triaged.
- **Tune the prompt:** The prompt template is just Liquid-flavored markdown. Add more specific instructions about your codebase conventions, architecture docs to read, or planning format preferences.
- **Increase depth:** Raise `max_turns` if your codebase is large and the agent needs more exploration time.
- **Use a smarter model:** Switch to `claude-opus-4-20250514` for more thorough plans on complex issues.
