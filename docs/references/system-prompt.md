# System Prompt Reference

> See also: [Workflow Templating Reference](./workflow-templating.md) | [Sensors Reference](./sensors.md)

Complete reference for the `agent.system_prompt` configuration field.

---

## Overview

Harmonica automatically prepends a **system prompt** to the first agent turn of every workflow. This gives every agent consistent, reliable context — workspace path, work item details, sensor configuration, and available tools — without requiring any per-workflow boilerplate.

The system prompt is sent as part of the first user message. The Claude Agent SDK does not support a dedicated `systemPrompt` parameter that persists across session resumption; prepending to the first user turn is the only reliable way to carry context forward across retries.

---

## Configuration

Control the system prompt per workflow via `agent.system_prompt` in the workflow frontmatter:

| Value               | Behaviour                                           |
| ------------------- | --------------------------------------------------- |
| _(omitted)_         | Use the built-in pre-canned system prompt (default) |
| `""` (empty string) | Disable the system prompt entirely                  |
| Non-empty string    | Use as the system prompt, rendered through Liquid   |

```yaml
agent:
  # Use the default pre-canned system prompt (no field needed)

  # -- OR --

  # Disable the system prompt entirely
  system_prompt: ""

  # -- OR --

  # Provide a custom system prompt (Liquid variables supported)
  system_prompt: |
    You are working on {{ item.identifier }}: {{ item.title }}.
    Your workspace is at {{ workspace_dir }}.
    Use the task_complete tool when you are done.
```

---

## Liquid Variables in Custom System Prompts

Custom `system_prompt` strings are rendered through the same [Liquid](https://liquidjs.com/) engine as the workflow body. All standard template variables are available:

| Variable              | Description                                        |
| --------------------- | -------------------------------------------------- |
| `{{ item }}`          | Current work item (always populated)               |
| `{{ issue }}`         | Normalized issue (populated in `mode: issues`)     |
| `{{ project }}`       | Normalized project (populated in `mode: projects`) |
| `{{ attempt }}`       | Attempt number, starting at 1                      |
| `{{ workspace_dir }}` | Absolute path to the workspace directory           |

See [Workflow Templating Reference](./workflow-templating.md) for all available fields on `item`, `issue`, and `project`.

**Example custom system prompt with Liquid:**

```yaml
agent:
  system_prompt: |
    You are an autonomous engineer working on {{ item.identifier }}: {{ item.title }}.

    Your workspace is at `{{ workspace_dir }}` (attempt {{ attempt }}).

    {% if issue.description %}
    Issue description:
    {{ issue.description }}
    {% endif %}

    Call `task_complete` when done.
```

---

## Default System Prompt Content

When `system_prompt` is omitted, Harmonica generates a pre-canned prompt that includes:

### Work Item Context

The current work item's identifier, title, URL, and state label — so the agent knows exactly what it is working on from the very first turn.

### Workspace Information

The absolute path to the isolated workspace directory created for this work item. On retry attempts (`attempt > 1`), the workspace may contain uncommitted changes or partial work from a previous attempt.

### Available Tools

- **`task_complete`** — explains how to call the MCP tool to signal completion and stop the worker cleanly
- **GitHub CLI (`gh`)** — common usage patterns with a note that `gh` is only available for GitHub-hosted repositories

### Active Sensor Configuration

The sensor name, tracker type, mode, and all active filters (labels, states, project, assignees, milestone, base branch, draft filter, active states, terminal states). This gives the agent full awareness of which work items this workflow is dispatching.

---

## Security: `api_key` is never included

The `tracker.api_key` field is populated at runtime from the sensor configuration but is deliberately excluded from the default system prompt output. Only the fields needed for agent context are surfaced. Custom `system_prompt` strings rendered through Liquid also do not expose `tracker.api_key` (it is not a template variable).

---

## Example: Default Prompt Structure

The default system prompt follows this structure:

```
# Harmonica Agent Context

You are an autonomous software engineering agent running inside Harmonica...

## Your Current Work Item

You are working on issue **ENG-42**: Fix the widget
- URL: https://linear.app/team/issue/ENG-42
- Current state: In Progress

## Workspace

Your workspace is an isolated directory on the local filesystem...
- Path: `/home/user/.harmonica/workspaces/ENG-42-abc123`

...

## Available Tools

### task_complete
...

### GitHub CLI (gh)
...

## Active Sensor Configuration

This workflow was dispatched by the following sensor:
- Sensor: linear-issues
- Mode: issues
- Tracker type: linear
- Required labels (ALL must match): bug, agent
...

---
```

---

## Disabling the System Prompt

Set `system_prompt: ""` to send no system prompt. The agent will receive only the rendered workflow body on the first turn. This is useful if your workflow body already contains all necessary context, or if you are working with a model that behaves better without a preamble.

```yaml
agent:
  system_prompt: "" # disabled — workflow body only
```
