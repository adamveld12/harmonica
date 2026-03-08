# Set up a Code Reviewer

## What you'll build

A workflow where Harmonica picks up "In Review" issues labeled `!review`, finds the associated GitHub PR, reads review comments, fixes the issues, commits, and pushes. This automates the tedious cycle of addressing PR feedback.

## Prerequisites

- [Bun](https://bun.sh) installed
- A Linear API key (Settings > API > Personal API keys)
- A Claude subscription (or Anthropic API key)
- The [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- A git repository with push access

## Step 1: Create or update the sensor

If you already have a `linear-issues` sensor in `.agents/sensors.yaml`, add `"In Review"` to `active_states`:

```yaml
linear-issues:
  type: linear
  api_key: ${LINEAR_API_KEY}
  mode: issues
  poll_interval_s: 15
  active_states:
    - "Backlog"
    - "In Progress"
    - "In Review"
```

If you prefer a dedicated sensor for review workflows, add a second entry:

```yaml
linear-reviews:
  type: linear
  api_key: ${LINEAR_API_KEY}
  mode: issues
  poll_interval_s: 15
  active_states:
    - "In Review"
```

## Step 2: Create the workflow

Create `.agents/workflows/reviewer.md`:

```markdown
---
name: Code Reviewer
tracker:
  type: linear
  sensor: linear-issues
  filter_states:
    - "In Review"
  filter_labels:
    - "!review"
  terminal_states:
    - "Done"
    - "Cancelled"

agent:
  model: claude-opus-4-20250514
  max_turns: 50
  permission_mode: bypassPermissions
  auth_method: subscription

workspace:
  repo_url: ${HARM_REPO_URL}

hooks:
  after_create: git clone {{ repo_url }} .
  before_run: |
    git fetch --quiet || true
    # Check out the PR branch associated with this issue
    PR_BRANCH=$(gh pr list --search "{{ issue.identifier }}" --json headRefName --jq '.[0].headRefName' 2>/dev/null)
    if [ -n "$PR_BRANCH" ]; then
      git checkout "$PR_BRANCH" && git pull --quiet
    fi
  timeout_s: 60

policy:
  max_concurrency: 2
  allow_multiple_per_issue: false
---

You are a senior engineer addressing PR review feedback for {{ issue.identifier }}: {{ issue.title }}.

## Issue Details

{{ issue.description }}

Issue URL: {{ issue.url }}
Working directory: {{ workspace_dir }}
Attempt: {{ attempt }}

## Your Task

1. **Find the PR.** Run `gh pr list --search "{{ issue.identifier }}"` to find the associated pull request. Then run `gh pr view <number>` to get the full details.

2. **Read review comments.** Run `gh pr view <number> --comments` to see all review comments and requested changes.

3. **Address each review comment.** For every piece of feedback:
   - Read and understand the reviewer's concern
   - Make the appropriate code change
   - If a comment is unclear or you disagree, leave a reply on the PR explaining your reasoning using `gh pr comment`

4. **Commit your changes.** Make focused commits with descriptive messages that reference the review feedback:
```

git add -A
git commit -m "address review: <summary of change>"

```

5. **Push.** Push your changes to the PR branch:
```

git push

```

6. **Clean up.** Use the Linear MCP tool to remove the "!review" label from issue {{ issue.id }}.

Do NOT merge the PR. Only address review comments, commit, and push.
```

### Why Opus?

Code review requires reading nuanced feedback and making careful, context-aware changes. Opus handles this well. You can use Sonnet for simpler codebases, but Opus is recommended for production review workflows.

## Step 3: Set up .env

Ensure your `.env` has:

```bash
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The `gh` CLI must already be authenticated (`gh auth login`).

## Step 4: Run

```bash
bun run server/src/index.ts --workflows .agents/workflows/
```

## Step 5: Test and trigger

To trigger the code reviewer:

1. Create a PR for your branch as usual
2. Get review comments on the PR
3. In the corresponding Linear issue, move it to **In Review** and add the `!review` label
4. Harmonica picks it up, addresses the feedback, and pushes fixes

After the agent finishes, check the PR for new commits addressing the review comments.

## Tips

- **Multiple review rounds:** Each time you get new review feedback, add the `!review` label again to trigger another pass. The agent removes it when done, so it's safe to re-add.
- **Commit message style:** Customize the prompt to match your team's commit conventions. Add examples of good commit messages in the prompt template.
- **Scoping:** If the agent is making changes beyond what reviewers asked for, tighten the prompt with instructions like "Only modify code directly referenced in review comments."
- **Lower concurrency:** Review work is heavier than planning. Keep `max_concurrency` at 2-3 to avoid overwhelming your git hosting.
