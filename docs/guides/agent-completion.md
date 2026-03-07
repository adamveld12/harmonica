# How to signal task completion

> See also: [Workflow Templating Reference](../references/workflow-templating.md#part-6-agent-completion)

By default, Harmonica workers run until the Linear issue changes state externally or the agent hits `max_turns`. This guide shows how to let agents self-terminate as soon as they've finished their work.

---

## Option 1: `task_complete` tool (recommended)

Harmonica automatically registers `task_complete` as an MCP tool for every agent session — no extra configuration needed. Include an instruction in your prompt telling the agent to call it when done:

```
When you have completed all tasks, call the `task_complete` tool with a brief
summary of what you did. Do not call it until you are fully finished.
```

When the agent calls `task_complete`, Harmonica intercepts the tool_use event and immediately exits the worker with `exitReason: "completed"`. The optional `reason` input field is logged and displayed in the dashboard.

```
Tool: task_complete
Input: { "reason": "Implemented the feature, added tests, opened PR #42" }
```

This is the simplest approach — no Linear state change is required.

### Full example prompt

```markdown
---
name: Bug Fixer
tracker:
  type: linear
  sensor: linear-issues
  filter_labels: [agent, bug]
  terminal_states:
    - "Done"
    - "Cancelled"
agent:
  model: claude-sonnet-4-20250514
  max_turns: 40
workspace:
  repo_url: ${HARM_REPO_URL}
hooks:
  after_create: git clone {{ repo_url }} .
  before_run: git fetch --quiet || true
---

You are an autonomous software engineer fixing {{ issue.identifier }}: {{ issue.title }}.

## Issue Description

{{ issue.description }}

## Instructions

1. Read the codebase to understand the bug
2. Implement a fix
3. Write or update tests
4. Open a pull request

When you have completed all steps, call the `task_complete` tool with a summary
of the changes you made and the PR link.
```

---

## Option 2: Linear state change

The agent can use the **Linear MCP tool** (available automatically inside Harmonica) to change the issue's state. After each agent turn, the worker checks the item's current `stateLabel` from Linear — **any change** to the stateLabel triggers completion:

- If the new state is in `terminal_states` (configured per-workflow in the `tracker` section) → worker exits with `exitReason: "terminal"`
- If the new state is not in `active_states` → worker exits with `exitReason: "completed"`

This approach is useful when your workflow requires that Linear reflect the real-time status — for example, a planner workflow that moves issues from "Backlog" to "In Progress" once a plan is ready.

Configure `terminal_states` in your workflow's `tracker` section:

```yaml
tracker:
  type: linear
  sensor: linear-issues
  terminal_states:
    - "Done"
    - "Cancelled"
```

### Example prompt instruction

```
When you have finished, use the Linear MCP tool to move this issue to "Done".
The worker will detect the state change and stop automatically.
```

---

## Comparison

| | `task_complete` tool | Linear state change |
|---|---|---|
| Auto-registered by Harmonica | Yes | N/A |
| Linear state updated | No | Yes |
| Requires Linear MCP call | No | Yes |
| Trigger condition | Explicit tool call | Any stateLabel change |
| Exit reason | `completed` | `terminal` or `completed` |
| Simplicity | Simpler | Requires GraphQL mutation |

Both paths result in the workspace being cleaned up (if configured) and the item not being retried.
