# CLI & Environment Reference

Complete reference for Harmonica's command-line flags, environment variables, and `.env` file behavior.

---

## CLI Flags

```
bun run server/src/index.ts [flags]
```

| Flag                         | Description                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--workflows <path>`         | Load workflows from a directory of `.md` files. Default: `./workflows/`                                                                                      |
| `--config-dir <path>`        | Config/data directory. Contains `harmonica.db` and `workspaces/`. Env fallback: `HARM_CONFIG_DIR`. Default: `~/.harmonica`                                   |
| `--server.port <num>`        | Enable HTTP dashboard on this port. Env fallback: `HARM_SERVER_PORT` (CLI takes precedence)                                                                  |
| `--server.host <host>`       | Bind dashboard to this host. Env fallback: `HARM_SERVER_HOST` (CLI takes precedence)                                                                         |
| `--workspace.repo_url <url>` | Repository URL for workspaces. Overrides `workspace.repo_url` in YAML                                                                                        |
| `--env-file <path>`          | Load environment variables from file. Default: `./.env` if present (silently skipped if missing). Warning emitted if an explicitly specified file is missing |
| `--debug`                    | Enable debug logging. **Note:** parsed but doesn't currently change log behavior                                                                             |
| `--help`, `-h`               | Show help and exit                                                                                                                                           |

---

## Environment Variables

| Variable            | Description                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `LINEAR_API_KEY`    | Linear personal API key. Referenced in `sensors.yaml` via `${LINEAR_API_KEY}`                                |
| `ANTHROPIC_API_KEY` | Anthropic API key. Only needed when `agent.auth_method` is `"api_key"`                                       |
| `HARM_CONFIG_DIR`   | Config/data directory. Overridden by `--config-dir` CLI flag (CLI takes precedence). Default: `~/.harmonica` |
| `HARM_SERVER_PORT`  | Fallback for `--server.port` (CLI flag takes precedence)                                                     |
| `HARM_SERVER_HOST`  | Fallback for `--server.host` (CLI flag takes precedence)                                                     |

---

## .env File

Harmonica automatically loads environment variables from a `.env` file at startup.

**Loading behavior:**

- `./.env` is auto-loaded silently if present
- `--env-file <path>` loads a specific file; emits a warning if the file is missing
- Existing environment variables are **never overridden** by `.env` values

**Supported syntax:**

```env
# Comments are supported
KEY=value
KEY="double quoted value"
KEY='single quoted value'

# Blank lines are ignored
```

---

## Precedence

Configuration values are resolved in this order (highest priority first):

1. **CLI flag** — e.g. `--server.port 8080`
2. **Environment variable** — e.g. `HARM_SERVER_PORT=8080`
3. **`.env` file** — loaded at startup, never overrides existing env vars
4. **YAML config default** — schema defaults from frontmatter/config
