# Sensors Reference

Sensors define how Harmonica connects to external data sources (Linear or GitHub) to discover work items. They are **shared resources** — multiple workflows can reference the same sensor, allowing them to share a single API connection and polling loop.

## File Location

Sensors are defined in `.agents/sensors.yaml` at the project root. This is a top-level YAML map where each key is a sensor name.

```yaml
# .agents/sensors.yaml
my-sensor:
  type: linear
  api_key: ${LINEAR_API_KEY}
  mode: issues
  # ...
```

Workflows reference sensors by name in their frontmatter:

```yaml
tracker:
  type: linear
  sensor: my-sensor # must match a key in sensors.yaml
  filter_labels: ["agent"]
```

## Hot Reload

Harmonica watches `.agents/sensors.yaml` for changes. When the file is modified, sensors are reloaded automatically without restarting the process. Workflows using the updated sensor will pick up the new configuration on their next poll cycle.

## Schema

Sensors use a discriminated union on `type`. Every sensor shares the common polling fields.

### Linear sensor (`type: linear`)

| Field             | Type                       | Default    | Description                                                                                                                                                                                                                                               |
| ----------------- | -------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | `"linear"`                 | —          | **Required.** Sensor type.                                                                                                                                                                                                                                |
| `api_key`         | `string`                   | —          | **Required.** Linear API key. Supports `${VAR}` environment variable substitution.                                                                                                                                                                        |
| `mode`            | `"issues"` \| `"projects"` | `"issues"` | Whether to poll for Linear issues or projects.                                                                                                                                                                                                            |
| `poll_interval_s` | `number`                   | `30`       | Seconds between Linear API polls.                                                                                                                                                                                                                         |
| `refresh_ttl_s`   | `number`                   | `5`        | Minimum seconds between forced refresh requests.                                                                                                                                                                                                          |
| `active_states`   | `string[]`                 | —          | State/status names to fetch from Linear. Controls fetch scope only — issues in these states are returned by the API. Completion classification (terminal vs. active) is configured per-workflow in the tracker section. If omitted, uses Linear defaults. |
| `assignees`       | `string[]`                 | —          | Filter to issues assigned to any of these Linear display names. Inherited by workflows as the default for `filter_assignees` unless overridden. Issues mode only.                                                                                         |

### GitHub sensor (`type: github`)

Requires the `gh` CLI to be installed and authenticated (`gh auth login`), or a PAT via `token`.

| Field             | Type                                            | Default    | Description                                                                                                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | `"github"`                                      | —          | **Required.** Sensor type.                                                                                                                                                                                                                                                                         |
| `owner`           | `string`                                        | —          | **Required.** GitHub organization or user name (e.g. `"acme"`).                                                                                                                                                                                                                                    |
| `repo`            | `string`                                        | —          | **Required.** Repository name (e.g. `"widget"`).                                                                                                                                                                                                                                                   |
| `mode`            | `"issues"` \| `"pull_requests"` \| `"projects"` | `"issues"` | What to poll: open issues, open PRs, or GitHub Projects v2 items.                                                                                                                                                                                                                                  |
| `project`         | `string`                                        | —          | **Required when `mode: projects`.** GitHub Project name (e.g. `"Q3 Roadmap"`).                                                                                                                                                                                                                     |
| `token`           | `string`                                        | —          | Personal access token. If omitted, uses `GH_TOKEN` env var or `gh` CLI credentials.                                                                                                                                                                                                                |
| `poll_interval_s` | `number`                                        | `30`       | Seconds between GitHub API polls.                                                                                                                                                                                                                                                                  |
| `refresh_ttl_s`   | `number`                                        | `5`        | Minimum seconds between forced refresh requests.                                                                                                                                                                                                                                                   |
| `active_states`   | `string[]`                                      | —          | For `mode: projects` only — project item status values to treat as active. Required to dispatch project items.                                                                                                                                                                                     |
| `assignees`       | `string[]`                                      | —          | Filter to issues/PRs/project items assigned to any of these GitHub login usernames (OR logic). Inherited by workflows as the default for `filter_assignees` unless overridden. Works for all three modes (`issues`, `pull_requests`, `projects`). Uses GitHub login usernames (not display names). |

## Example: Multiple Sensors (Linear + GitHub)

```yaml
# .agents/sensors.yaml

linear-issues:
  type: linear
  api_key: ${LINEAR_API_KEY}
  mode: issues
  poll_interval_s: 15
  active_states: ["Backlog", "On Deck", "In Progress", "In Review"]
  assignees:
    - "Adam Veldhousen"

linear-projects:
  type: linear
  api_key: ${LINEAR_API_KEY}
  mode: projects
  poll_interval_s: 30
  active_states: ["Planning"]

gh-issues:
  type: github
  owner: acme
  repo: widget
  mode: issues
  poll_interval_s: 30
  assignees:
    - "alice"

gh-prs:
  type: github
  token: ${GITHUB_TOKEN}
  owner: acme
  repo: widget
  mode: pull_requests
  poll_interval_s: 30

gh-project:
  type: github
  owner: acme
  repo: widget
  mode: projects
  project: "Q3 Roadmap"
  poll_interval_s: 60
  active_states: ["In Progress"]
```

Workflows reference sensors by name:

```yaml
# workflow-a.md frontmatter
tracker:
  type: linear
  sensor: linear-issues
  filter_labels: ["agent"]
```

```yaml
# workflow-b.md frontmatter
tracker:
  type: github
  sensor: gh-issues
  filter_labels: ["agent-task"]
```

```yaml
# workflow-c.md frontmatter
tracker:
  type: github
  sensor: gh-prs
  filter_draft: false
  filter_base_branch: main
```

## Notes

- **Sharing:** Multiple workflows referencing the same sensor share its API connection and poll loop. This reduces redundant API calls to Linear.
- **`active_states` is fetch scope only:** The sensor's `active_states` controls which states are requested from the Linear API. It does not determine whether an item is considered complete. Terminal state classification is configured per-workflow via `tracker.terminal_states` in the workflow frontmatter.
- **Environment variables:** Use `${VAR}` syntax in `api_key` and other string fields. If the variable is not set, the literal `${VAR}` string is left intact (no error is thrown).
- **Assignee field differences:** The Linear sensor's `assignees` field takes Linear **display names** (e.g. `"Adam Veldhousen"`), while the GitHub sensor's `assignees` field takes GitHub **login usernames** (e.g. `"alice"`). Both fields propagate as the default `filter_assignees` for workflows using that sensor, and can be overridden per workflow.
