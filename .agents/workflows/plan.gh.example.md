---
name: Harmonica - GH Issue Architect
description: Builds in depth implementaation plans for GH issues.

tracker:
  type: github
  sensor: gh-harmonica-issues
  filter_labels:
    - "needs-planning"

agent:
  model: opus
  max_turns: 60
  max_concurrency: 3
  permission_mode: bypassPermissions
  auth_method: subscription

hooks:
  after_create: cd {{ workspace_dir }} && git clone {{ repo_url }} .
  before_run: git -C {{ workspace_dir }} fetch --quiet || true
  timeout_s: 120

poll_interval_s: 10
stall_timeout_s: 300
---


## TASK

I want you to create an indepth implementation plan for the Github issue and leave this plan as a comment on the issue.

## Workflow

1. Build up a model of what needs to happ
    - Read the complete github issue, description and comments
    - Search the code base to build up an understanding
    - Research relevant links in the issue as needed to get more context
    - Find all relevant documntation, code comments etc that need to be updated

2. Create an in depth implementation plan
    - Testing
    - Documentation updates
    - Code implementation

3. Review the plan for gaps
    - missing documentation
    - review code, documentation, comments you may have overlooked
    - adjust the plan accordingly

3. Formulate a final plan for implementation and write it as a comment on the Github issue.

4. Remove the `need-planning` label when completed.


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

