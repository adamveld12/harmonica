---
name: Harmonica - GH PR Follow up
description: Implements PR code review feedback

tracker:
  type: github
  sensor: gh-harmonica-prs
  filter_base_branch: main
  filter_draft: false
  filter_labels:
    - "needs-implementation"

agent:
  model: sonnet
  max_turns: 120
  max_concurrency: 2
  permission_mode: bypassPermissions
  auth_method: subscription

hooks:
  after_create: |
    cd {{ workspace_dir }};
    git clone {{ repo_url }} . || true
  before_run: git -C {{ workspace_dir }} fetch --quiet || true
  timeout_s: 120

poll_interval_s: 10
stall_timeout_s: 300
---


## TASK

You are review and implement code review feedback on Pull requests

## Workflow

1. Create a branch named after the issue
    - `git checkout -b {{ item.identifier }}/<some name>`

2. Build up a model of what needs to happen
    - Read the complete github issue, description and comments
    - Search the code base to build up an understanding
    - Research relevant links in the issue as needed to get more context
    - Find all relevant documentation, code comments etc that need to be updated

3. Review the code review feedback, favoring the latest code review and suggestions
    - Read the summary
    - Read the inline suggestions

3. Create an in depth implementation plan
    - Testing
    - Documentation updates
    - Code implementation

3. Review the plan for gaps
    - missing documentation
    - review code, documentation, comments you may have overlooked
    - adjust the plan accordingly

4. Implement the fixes in the feedback
    - Use parallel sub agents as needed
    - pay careful attention to testing and verification checks.
    - make commits at logical points.
    - Focus on CRITICAL feedback first, then move on to medium

5. Commit and push your changes to the existing PR
    - Update the PR description to encompass the feedback & original intent
    - Mark or hide the comment of the original PR as "resolved"

6. Watch the PR checks for failures and fix them
    - poll for pr check failures `gh pr checks <number> --watch`
    - perform an RCA on the failures
    - fix all failures, commit and push
    - repeat this loop until all checks have passed.

    ```
    gh pr checks <pr-number> --watch
    # Optionally add --fail-fast to exit on the first failed check, or --interval <seconds> to control poll frequency (default 10s).
    ```

7. Resolve & dismiss the review
    - Resolve all comments you fixed
    - Re-request/dismiss the code review if needed

7. Add the "needs-code-review" label

## CONTEXT

Github Issue: {{ item.identifier }}: {{ item.title }}
Your workspace directory: `{{ workspace_dir }}`
Attempt: {{ attempt }}

## Helpers

1. To see and manage labels:
```
gh label list
gh label create 'needs-triage' --color 'd73a4a' --description 'Triggers the triage workflow'
```

2. Maintainers
```
gh api repos/{owner}/{repo}/collaborators
```

3. Labels on an issue
```
gh issue view {id} --json labels --jq '.labels[].name'
```


## RULES

- **ALWAYS** use the `gh` CLI tool to read the issue content.
- **DO NOT WRITE CODE**, **PREFER** to explore and reading files
- **ALWAYS** remove the label as the last step
- **ALWAYS** use the existing PR, do not open another one.

