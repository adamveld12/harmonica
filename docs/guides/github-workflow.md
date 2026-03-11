# Working with GitHub workflows

This guide covers practical patterns for running Harmonica against GitHub repositories using issues, pull requests, and GitHub Projects v2.

## Issues

### Basic issue workflow

```yaml
# .agents/sensors.yaml
gh-issues:
  type: github
  owner: myorg
  repo: myrepo
  mode: issues
  poll_interval_s: 30
```

```markdown
---
tracker:
  type: github
  sensor: gh-issues
  filter_labels: ["agent-task"]
  terminal_states:
    - closed
agent:
  model: claude-sonnet-4-20250514
  max_turns: 40
workspace:
  repo_url: git@github.com:myorg/myrepo.git
hooks:
  after_create: git clone {{ repo_url }} .
  before_run: git fetch --quiet || true
---

Fix {{ item.identifier }}: {{ item.title }}

{{ item.description }}

Workspace: `{{ workspace_dir }}`
```

### Using the gh CLI in agent prompts

The `gh` CLI is available inside the workspace. Agents can use it to interact with GitHub:

```liquid
After completing your work:
1. Create a branch: `git checkout -b fix/{{ item.identifier }}`
2. Commit your changes and push: `git push -u origin HEAD`
3. Open a PR: `gh pr create --title "Fix {{ item.title }}" --body "Closes #{{ item.identifier | split: '#' | last }}"`
4. Call `task_complete`.
```

## Pull Requests

### Review and fix failing PRs

```yaml
# .agents/sensors.yaml
gh-prs:
  type: github
  owner: myorg
  repo: myrepo
  mode: pull_requests
  poll_interval_s: 30
```

```markdown
---
tracker:
  type: github
  sensor: gh-prs
  filter_labels: ["needs-agent"]
  filter_draft: false
  filter_base_branch: main
agent:
  model: claude-sonnet-4-20250514
  max_turns: 30
workspace:
  repo_url: git@github.com:myorg/myrepo.git
hooks:
  after_create: gh repo clone myorg/myrepo .
  before_run: |
    git fetch origin
    git checkout {{ item.identifier | split: '#' | last }}
    gh pr checkout {{ item.identifier | split: '#' | last }} || true
---

Review and fix PR {{ item.identifier }}: {{ item.title }}

{{ item.description }}

Checkout the PR branch, fix any issues, and push your changes.
```

## GitHub Projects v2

### Dispatch agents per project item

```yaml
# .agents/sensors.yaml
gh-project:
  type: github
  owner: myorg
  repo: myrepo
  mode: projects
  project: "Engineering Backlog"
  poll_interval_s: 60
  active_states:
    - "In Progress"
    - "Ready for Agent"
```

```markdown
---
tracker:
  type: github
  sensor: gh-project
  terminal_states:
    - Done
    - Cancelled
agent:
  model: claude-sonnet-4-20250514
  max_turns: 50
workspace:
  repo_url: git@github.com:myorg/myrepo.git
hooks:
  after_create: git clone {{ repo_url }} .
---

Work on project item: {{ item.title }}

{{ item.description }}

Status: {{ item.stateLabel }}
Workspace: `{{ workspace_dir }}`
```

## Filtering by assignee

GitHub sensor `assignees` uses GitHub login usernames (not display names). This is different from the Linear sensor, which uses Linear display names.

### Set a sensor-level default

Add `assignees` to the sensor in `sensors.yaml` to filter all workflows that reference it:

```yaml
# .agents/sensors.yaml
gh-issues:
  type: github
  owner: myorg
  repo: myrepo
  mode: issues
  poll_interval_s: 30
  assignees:
    - "alice"
    - "bob"
```

This applies to all modes (`issues`, `pull_requests`, `projects`). The value propagates as the default `filter_assignees` for every workflow using this sensor.

### Override per workflow

A workflow can replace the sensor-level assignees with its own list:

```yaml
tracker:
  type: github
  sensor: gh-issues
  filter_assignees:
    - "carol" # overrides the sensor-level assignees for this workflow only
```

Omit `filter_assignees` in the workflow to inherit the sensor's `assignees` list. Set it to an explicit list to restrict or broaden the set for that workflow.

## Combining GitHub and Linear sensors

You can run multiple workflow files simultaneously, mixing sensor types:

```
.agents/workflows/
  linear-bugs.md      # watches Linear for bug issues
  github-prs.md       # watches GitHub PRs for review tasks
  github-issues.md    # watches GitHub issues labeled "agent"
```

```yaml
# .agents/sensors.yaml
linear-issues:
  type: linear
  api_key: ${LINEAR_API_KEY}
  mode: issues

gh-prs:
  type: github
  owner: myorg
  repo: myrepo
  mode: pull_requests
```

Each workflow file references its own sensor and runs independently with its own concurrency limits.

## Authentication in headless environments

For CI/CD pipelines or servers where `gh auth login` is not available, use a PAT:

```yaml
gh-issues:
  type: github
  token: ${GITHUB_TOKEN}
  owner: myorg
  repo: myrepo
  mode: issues
```

```bash
# .env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The `token` field sets `GH_TOKEN` in the environment when the `gh` CLI is called. See [GitHub documentation on PATs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) for token scopes required (`repo` is sufficient for most operations).
