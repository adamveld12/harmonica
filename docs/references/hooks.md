# Hooks Reference

> See also: [Workflow Templating Reference](./workflow-templating.md) | [CLI & Environment Reference](./cli-and-env.md)

Shell commands that execute at workspace lifecycle events. Hooks run inside the workspace directory and are configured in workflow frontmatter.

---

## Configuration

```yaml
hooks:
  after_create: |
    git clone {{ repo_url }} .
  before_run: git fetch --quiet || true
  after_run: |
    cd {{ workspace_dir }} && git diff --stat
  before_remove: ""
  timeout_s: 60
```

All hook fields are optional strings. An empty string or omitted field means no hook runs for that event.

---

## Lifecycle

Hooks fire at specific points in the worker lifecycle. Each hook runs **once per worker invocation** (not per agent turn).

```
Workspace created
  └─ after_create          ← first-time setup (clone, install deps)
      └─ before_run        ← pre-flight (fetch, reset)
          └─ Agent runs (multiple turns)
              └─ after_run  ← post-flight (push, notify)
                  └─ [if terminal/completed and cleanup_on_terminal]
                      └─ before_remove  ← final cleanup
                          └─ Workspace deleted
```

| Hook            | When                                                          | Use case                                           |
| --------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| `after_create`  | After workspace directory is created, before the agent starts | Clone repo, install dependencies, initial setup    |
| `before_run`    | Before the agent worker starts (including on retries)         | Fetch latest, reset state, pull updates            |
| `after_run`     | After the agent worker completes (any exit reason)            | Push changes, post PR comments, send notifications |
| `before_remove` | Before workspace directory is deleted                         | Archive logs, backup state                         |

### Retry behavior

On retries, only `before_run` fires again — `after_create` does NOT re-run because the workspace already exists. The full sequence for a retry:

```
before_run → Agent runs → after_run → [backoff] → before_run → Agent runs → after_run
```

---

## Error Handling

**Hook failures are fatal.** A non-zero exit code or timeout aborts the current run:

| Hook            | On failure                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `after_create`  | Worker launch aborted. Workspace preserved for investigation. 30s cooldown before re-dispatch. |
| `before_run`    | Worker launch aborted. Workspace preserved. 30s cooldown before re-dispatch.                   |
| `after_run`     | Logged as error. Retry and workspace cleanup are skipped.                                      |
| `before_remove` | Logged as error. Workspace is NOT deleted.                                                     |

### Timeout

Each hook has a maximum execution time controlled by `timeout_s` (default: 60s / 1 minute). If a hook exceeds this, the process is killed and treated as a hook failure.

---

## Environment Variables

Set by Harmonica before running each hook:

| Variable                | Value                                              |
| ----------------------- | -------------------------------------------------- |
| `HARM_ISSUE_ID`         | Work item UUID                                     |
| `HARM_ISSUE_IDENTIFIER` | Human identifier, e.g. `ENG-42` or project slug    |
| `HARM_WORKSPACE_DIR`    | Absolute path to the workspace directory           |
| `HARM_SESSION_ID`       | Claude session ID (empty string in `after_create`) |

---

## Liquid Variables

Hook strings support the same [Liquid](https://liquidjs.com/) variables as prompt templates (`strictVariables: false`):

| Variable              | Populated     | Description                                |
| --------------------- | ------------- | ------------------------------------------ |
| `{{ item }}`          | Always        | Generic work item (issue or project)       |
| `{{ issue }}`         | issues mode   | Full issue object; `null` in projects mode |
| `{{ project }}`       | projects mode | Full project object; `null` in issues mode |
| `{{ workspace_dir }}` | Always        | Absolute workspace path                    |
| `{{ attempt }}`       | Always        | Attempt number (starts at 1)               |
| `{{ repo_url }}`      | Always        | Repository URL from `workspace.repo_url`   |

See [Workflow Templating Reference](./workflow-templating.md#part-2-template-variables-reference) for complete field listings of `item`, `issue`, and `project`.

For flat scalar values (issue ID, session ID), use the `$HARM_*` environment variables instead.

---

## Examples

### Clone and setup

```yaml
hooks:
  after_create: |
    git clone {{ repo_url }} .
    npm install
  before_run: |
    git fetch origin main --quiet
    git reset --hard origin/main
```

### Push and notify after completion

```yaml
hooks:
  after_run: |
    if [ -n "$(git status --porcelain)" ]; then
      git add -A
      git commit -m "harmonica: ${HARM_ISSUE_IDENTIFIER}"
      git push origin HEAD
    fi
```

### Archive workspace before removal

```yaml
hooks:
  before_remove: |
    tar czf /tmp/harmonica-${HARM_ISSUE_IDENTIFIER}.tar.gz .
```
