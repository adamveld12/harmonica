---
name: Planner
description: Plans linear tickets and moves them to Ready

tracker:
  type: linear
  sensor: linear-issues
  filter_states:
    - "Backlog"
  filter_labels:
    - "!plan"
  terminal_states:
    - "On Deck"
    - "In Progress"
    - "In Review"
    - "Done"
    - "Cancelled"


agent:
  model: opus
  max_turns: 150
  max_concurrency: 3
  permission_mode: bypassPermissions
  auth_method: subscription

workspace:
  repo_url: ${HARM_REPO_URL}

hooks:
  after_create: |
    cd {{ workspace_dir }} && git clone ${HARM_REPO_URL:-.} .
  before_run: git -C {{ workspace_dir }} fetch --quiet || true
  timeout_ms: 120000

poll_interval_ms: 10000
stall_timeout_ms: 300000
---

You are an autonomous software engineer planning work

## Issue: {{ issue.identifier }} — {{ issue.title }}

{% if issue.description %}

## Description

{{ issue.description }}
{% endif %}

## Your Task

Fully explore and produce an implementation plan for the issue described above. Work in this order:

### 1. Gather Context
- Use the Linear MCP tool to read the full issue: title, description, and all comments
- Understand the intent and any constraints mentioned

### 2. Explore the Codebase
- Read relevant files to understand existing patterns and conventions
- Identify all files that will need to change
- Note any dependencies, tech debt, or risks

### 3. Produce the Plan
Write a detailed implementation plan that includes:
- **Files to change** — exact paths and what changes are needed in each
- **New files** — any new files to create and their purpose
- **Test changes** — what tests to add or update
- **Documentation** — any docs or comments that need updating
- **Follow-ups** — tech debt or out-of-scope items to track separately

### 4. Update Linear
- Post the complete implementation plan as a comment on the issue
- Move the ticket to **"On Deck"**
- Remove the `!plan` label
- If the plan is a trivial or simple change (less than 3 files and fewer than 10 lines of code)
    - add the `!work` label

After updating linear, immediately exit using the task_complete tool

## Workspace

Your workspace directory: `{{ workspace_dir }}`

Attempt: {{ attempt }}

When complete, provide a brief summary of the plan you posted.
