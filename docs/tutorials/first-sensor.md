# Setting up your first sensor

## What is a sensor?

A **sensor** is a named connection to an issue tracker. It polls on an interval, caches results, and makes work items available to your workflows. Multiple workflows can share a single sensor, which means one API connection serves all of them.

Harmonica supports two sensor types: **`linear`** (Linear issues and projects) and **`github`** (GitHub issues, pull requests, and Projects v2). This tutorial covers the Linear sensor. For GitHub, see [Setting up a GitHub sensor](./github-sensor.md).

Sensors are defined in `.agents/sensors.yaml` and referenced by name in workflow files.

## Step 1: Create the .agents directory

```bash
mkdir -p .agents
```

This is where Harmonica looks for sensor and workflow configuration.

## Step 2: Get your Linear API key

1. Open [Linear](https://linear.app)
2. Go to **Settings** (gear icon in the bottom-left)
3. Navigate to **API** under "My Account"
4. Click **Create key** under "Personal API keys"
5. Give it a name like "Harmonica" and copy the key

The key will look like `lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.

## Step 3: Create .env

Create a `.env` file in your project root:

```bash
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Replace with your actual key. Harmonica loads `.env` automatically at startup.

## Step 4: Create .agents/sensors.yaml

Create the file `.agents/sensors.yaml`:

```yaml
linear-issues:
  type: linear
  api_key: ${LINEAR_API_KEY}
  mode: issues
  poll_interval_s: 30
  active_states:
    - "In Progress"
```

Here's what each field does:

| Field             | Description                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `linear-issues`   | The sensor name. Workflows reference this to connect.                                                      |
| `type: linear`    | The sensor type. `linear` or `github` are supported.                                                       |
| `api_key`         | Your Linear API key. `${LINEAR_API_KEY}` pulls from the environment.                                       |
| `mode: issues`    | What to poll for. Use `issues` for individual issues or `projects` for Linear projects.                    |
| `poll_interval_s` | How often to poll Linear, in seconds. 30 = every 30 seconds.                                               |
| `active_states`   | Issue state names to fetch from Linear (fetch scope only). Harmonica will poll for issues in these states. |

> **Note:** `terminal_states` is not configured on the sensor. Terminal state classification (which states mean "done, stop processing") is configured per-workflow in the tracker frontmatter via `tracker.terminal_states`.

You can add more active states later. For example, to also track Backlog and On Deck issues:

```yaml
active_states:
  - "Backlog"
  - "On Deck"
  - "In Progress"
```

## Step 5: Verify

Run Harmonica briefly to confirm the sensor connects:

```bash
bun run server/src/index.ts --workflows .agents/workflows/
```

You'll need at least one workflow file for the command to work (covered in the next tutorial). But if you see log output mentioning your sensor name polling Linear, the connection is working.

If you see authentication errors, double-check your `LINEAR_API_KEY` value.

## What's next

Now that your sensor is set up, create your first workflow to start processing issues. Continue to [Creating your first workflow](../tutorials/first-workflow.md).
