# Setting up a GitHub sensor

## What is a GitHub sensor?

A **GitHub sensor** connects Harmonica to a GitHub repository (or GitHub Projects v2) instead of Linear. It uses the `gh` CLI to poll for open issues, pull requests, or project items and dispatches Claude Code agents to work on them — just like a Linear sensor, but sourced from GitHub.

## Prerequisites

1. **Bun ≥ 1.0** — runtime requirement
2. **`gh` CLI installed and authenticated** — Harmonica calls `gh api` to fetch data

### Authenticate with the gh CLI

```bash
gh auth login
```

Follow the prompts to authenticate with your GitHub account. You can verify the authentication:

```bash
gh auth status
```

For CI or headless environments, use a personal access token (PAT) instead:

```bash
export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Or pass it via the sensor config `token` field (see [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)).

## Step 1: Create the .agents directory

```bash
mkdir -p .agents/workflows
```

## Step 2: Configure a GitHub sensor in sensors.yaml

Create or edit `.agents/sensors.yaml`:

```yaml
# .agents/sensors.yaml

# Watch open issues in a repository
gh-issues:
  type: github
  owner: acme
  repo: widget
  mode: issues
  poll_interval_s: 30
  assignees:
    - "alice"
    - "bob"

# Watch open pull requests
gh-prs:
  type: github
  owner: acme
  repo: widget
  mode: pull_requests
  poll_interval_s: 30

# Watch items in a GitHub Project
gh-project:
  type: github
  owner: acme
  repo: widget
  mode: projects
  project: "Q3 Roadmap"
  poll_interval_s: 60
  active_states:
    - "In Progress"
    - "In Review"
```

### Using a PAT instead of gh auth

```yaml
gh-issues:
  type: github
  token: ${GITHUB_TOKEN}
  owner: acme
  repo: widget
  mode: issues
```

Add `GITHUB_TOKEN=ghp_xxx...` to your `.env` file.

## Step 3: Create a workflow file

Create `.agents/workflows/github-issues.md`:

```markdown
---
tracker:
  type: github
  sensor: gh-issues
  filter_labels:
    - "harmonica"

agent:
  model: claude-sonnet-4-20250514
  max_turns: 30

workspace:
  repo_url: git@github.com:acme/widget.git

hooks:
  after_create: git clone {{ repo_url }} .
  before_run: git fetch --quiet || true
---

You are an autonomous software engineer working on {{ item.identifier }}.

## {{ item.title }}

{{ item.description }}

Working directory: `{{ workspace_dir }}`
Attempt: {{ attempt }}

When you finish, call the `task_complete` tool.
```

## Step 4: Run Harmonica

```bash
bun run server/src/index.ts --workflows .agents/workflows/
```

Or if installed globally:

```bash
harmonica --workflows .agents/workflows/
```

## What happens next

1. Harmonica loads the `gh-issues` sensor and starts polling GitHub every 30 seconds
2. Open issues with the `harmonica` label are returned as candidates
3. For each candidate, Harmonica creates an isolated workspace, clones the repo, and launches a Claude Code agent
4. The agent works on the issue until it calls `task_complete` or the issue is closed

## Filtering

You can narrow which items the sensor dispatches.

### Sensor-level assignee filtering

Set `assignees` on the sensor to apply a default assignee filter for all workflows using that sensor. Values must be GitHub login usernames (not display names):

```yaml
# .agents/sensors.yaml
gh-issues:
  type: github
  owner: acme
  repo: widget
  mode: issues
  poll_interval_s: 30
  assignees:
    - "alice"
    - "bob"
```

This propagates as the default `filter_assignees` for every workflow that references `gh-issues`.

### Workflow-level override

A workflow can override the sensor's `assignees` with its own `filter_assignees`:

```yaml
tracker:
  type: github
  sensor: gh-issues
  filter_assignees:
    - "carol" # overrides sensor-level assignees for this workflow only
```

### Other tracker filters

```yaml
tracker:
  type: github
  sensor: gh-issues
  filter_labels:
    - "harmonica"
    - "ready"
  filter_assignees:
    - "mylogin"
  filter_milestone: "v2.0"
  terminal_states:
    - "closed"
```

For pull requests:

```yaml
tracker:
  type: github
  sensor: gh-prs
  filter_base_branch: main
  filter_draft: false
  filter_labels:
    - "needs-fix"
```

## Next steps

- [GitHub workflow guide](../guides/github-workflow.md) — issues, PRs, and Projects v2
- [Sensors reference](../references/sensors.md) — complete GitHub sensor schema
