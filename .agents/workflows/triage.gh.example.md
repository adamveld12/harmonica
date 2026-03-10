---
name: Harmonica - GH Issue Triage
description: Triages GH issues. If they are valid we tag them "triaged"

tracker:
  type: github
  sensor: gh-harmonica-issues
  filter_labels:
    - "needs-triage"


agent:
  model: sonnet
  max_turns: 80
  max_concurrency: 5
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

I want you to triage the Github issue specified.


To triage an issue effectively you must read the issue and comments, and then read the following sources for related context if relevant:
    - The codebase, preferably on `main` or whatever versions the Issue description calls out

Then, your ultimate goal is to assign a set of Github Issue labels to the issue to trigger other workflows and signal to others how to approach this issue.

To meet your goal, you should determine if the issue is:

- **Type**: A bug, feature, feedback or question
    - Tag the issue according to the existing labels along these lines

- **Relevance**: How relevant this is to our current codebase, roadmap and vision.
    - If the issue is not relevant, flag with the *needs-review* label.

- **Next course of action**: What steps to take.
    - Add labels to indicate
        - *needs-more-info*: There isn't enough information to effectively triage this issue
        - *needs-maintainer-approval*: if a maintainer needs to come along and manually route or handle this ticket.

Your ultimate output will be to do the following:

1. **Organize**: Mark the issue accordingly
    - Tag the issue with the relevant Github labels.
    - Leave a comment with notes on your findings and reasoning.
    - Leave a comment with your recommendations on the best next course of action.

2. **Communicate**: with the issue creator and others involved
    - Leave a comment explaining your reasoning for triaging the issue the way you did
    - Suggest & Advise 1-3 next courses of action for either maintainers, issue creator or both.

When finished, remove the `needs-triage` label

## CONTEXT

Github Issue: {{ item.identifier }}
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
- **ALWAYS** remove the needs-triage label as the last step

