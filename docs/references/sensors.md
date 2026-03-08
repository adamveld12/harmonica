# Sensors Reference

Sensors define how Harmonica connects to external data sources (currently Linear) to discover work items. They are **shared resources** — multiple workflows can reference the same sensor, allowing them to share a single API connection and polling loop.

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

Every sensor entry must conform to `SensorSchema`:

| Field             | Type                       | Default    | Description                                                                                                                                                                                                                                               |
| ----------------- | -------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | `"linear"`                 | —          | **Required.** Sensor type. Only `linear` is currently supported.                                                                                                                                                                                          |
| `api_key`         | `string`                   | —          | **Required.** Linear API key. Supports `${VAR}` environment variable substitution.                                                                                                                                                                        |
| `mode`            | `"issues"` \| `"projects"` | `"issues"` | Whether to poll for Linear issues or projects.                                                                                                                                                                                                            |
| `poll_interval_s` | `number`                   | `30`       | Seconds between Linear API polls.                                                                                                                                                                                                                         |
| `refresh_ttl_s`   | `number`                   | `5`        | Minimum seconds between forced refresh requests.                                                                                                                                                                                                          |
| `active_states`   | `string[]`                 | —          | State/status names to fetch from Linear. Controls fetch scope only — issues in these states are returned by the API. Completion classification (terminal vs. active) is configured per-workflow in the tracker section. If omitted, uses Linear defaults. |
| `assignees`       | `string[]`                 | —          | Filter to issues assigned to any of these Linear display names. Inherited by workflows as the default for `filter_assignees` unless overridden. Issues mode only.                                                                                         |

## Example: Multiple Sensors

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
```

Two workflows can then each reference a different sensor:

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
  type: linear
  sensor: linear-projects
  filter_labels: ["auto-plan"]
```

Both workflows share the same `LINEAR_API_KEY` and Linear connection configuration defined in the sensor, but apply their own filtering logic.

## Notes

- **Sharing:** Multiple workflows referencing the same sensor share its API connection and poll loop. This reduces redundant API calls to Linear.
- **`active_states` is fetch scope only:** The sensor's `active_states` controls which states are requested from the Linear API. It does not determine whether an item is considered complete. Terminal state classification is configured per-workflow via `tracker.terminal_states` in the workflow frontmatter.
- **Environment variables:** Use `${VAR}` syntax in `api_key` and other string fields. If the variable is not set, the literal `${VAR}` string is left intact (no error is thrown).
