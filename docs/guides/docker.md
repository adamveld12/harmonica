# Running Harmonica with Docker

Harmonica ships as a Docker image so you can run it in a sandboxed environment without installing Bun, `gh`, or `pnpm` locally.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (or compatible runtime such as Podman)
- A Linear personal API key
- Either an Anthropic API key **or** a Claude Pro/Max subscription (see [Authentication](#authentication))

## Pulling the image

```bash
docker pull ghcr.io/adamveld12/harmonica:latest
```

Or pin to a specific version:

```bash
docker pull ghcr.io/adamveld12/harmonica:0.2.0
```

## Basic usage

```bash
docker run --rm \
  -e LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxx \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v "$PWD/.agents/sensors.yaml:/data/.agents/sensors.yaml:ro" \
  -v "$PWD/.agents/workflows:/data/workflows" \
  ghcr.io/adamveld12/harmonica:latest
```

This mounts your local `.agents/sensors.yaml` and `.agents/workflows/` into the container and starts Harmonica.

## Persisting workspaces and the database

Harmonica stores its SQLite database and per-issue workspaces under `$HARM_CONFIG_DIR` (default: `/data` inside the container). Mount a host directory there to persist data across restarts:

```bash
docker run --rm \
  -e LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxx \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v "$HOME/.harmonica:/data" \
  -v "$PWD/.agents/sensors.yaml:/data/.agents/sensors.yaml:ro" \
  -v "$PWD/.agents/workflows:/data/workflows" \
  ghcr.io/adamveld12/harmonica:latest
```

The database will be written to `$HOME/.harmonica/harmonica.db` on your host and workspaces will be created under `$HOME/.harmonica/workspaces/`.

## Authentication

### API key mode (default in Docker)

Set `ANTHROPIC_API_KEY` as an environment variable:

```bash
docker run --rm \
  -e LINEAR_API_KEY=lin_api_... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v "$PWD/.agents/sensors.yaml:/data/.agents/sensors.yaml:ro" \
  -v "$PWD/.agents/workflows:/data/workflows" \
  ghcr.io/adamveld12/harmonica:latest
```

Your workflow frontmatter should specify:

```yaml
agent:
  auth_method: api_key
```

### Claude subscription passthrough

If you have a Claude Pro/Max subscription and have already run `claude login` on your host, you can share the OAuth credentials with the container by mounting your `~/.claude` directory:

```bash
docker run --rm \
  -e LINEAR_API_KEY=lin_api_... \
  -v "$HOME/.claude:/home/harmonica/.claude:ro" \
  -v "$PWD/.agents/sensors.yaml:/data/.agents/sensors.yaml:ro" \
  -v "$PWD/.agents/workflows:/data/workflows" \
  ghcr.io/adamveld12/harmonica:latest
```

Your workflow frontmatter:

```yaml
agent:
  auth_method: subscription
```

The `:ro` flag mounts the credentials directory read-only so the container cannot modify your local Claude config.

## Enabling the dashboard

Expose port `6543` and pass `--server.port`:

```bash
docker run --rm \
  -e LINEAR_API_KEY=lin_api_... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -p 6543:6543 \
  -v "$PWD/.agents/sensors.yaml:/data/.agents/sensors.yaml:ro" \
  -v "$PWD/.agents/workflows:/data/workflows" \
  ghcr.io/adamveld12/harmonica:latest \
  --workflows /data/workflows \
  --server.port 6543 \
  --server.host 0.0.0.0
```

Open `http://localhost:6543` in your browser.

## Environment variables reference

| Variable            | Required            | Description                                                   |
| ------------------- | ------------------- | ------------------------------------------------------------- |
| `LINEAR_API_KEY`    | Yes                 | Linear personal API key (referenced in `sensors.yaml`)        |
| `ANTHROPIC_API_KEY` | `api_key` mode only | Anthropic API key                                             |
| `HARM_CONFIG_DIR`   | No                  | Data directory inside the container (default: `/data`)        |
| `HARM_SERVER_PORT`  | No                  | Dashboard port (also settable via `--server.port`)            |
| `HARM_SERVER_HOST`  | No                  | Dashboard host (also settable via `--server.host`)            |
| `HARM_REPO_URL`     | Workflow-dependent  | Repository URL used by `workspace.repo_url: ${HARM_REPO_URL}` |

## Volume mount reference

| Mount path                          | Purpose                                              |
| ----------------------------------- | ---------------------------------------------------- |
| `/data`                             | Config dir: database + workspaces (persist this)     |
| `/data/.agents/sensors.yaml`        | Sensor definitions (required for workflow execution) |
| `/data/workflows`                   | Workflow `.md` files (default `--workflows` path)    |
| `/home/harmonica/.claude`           | Claude OAuth credentials (subscription auth)         |

## Docker Compose example

```yaml
services:
  harmonica:
    image: ghcr.io/adamveld12/harmonica:latest
    restart: unless-stopped
    environment:
      LINEAR_API_KEY: ${LINEAR_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      HARM_SERVER_PORT: "6543"
    ports:
      - "6543:6543"
    volumes:
      - harmonica-data:/data
      - ./.agents/sensors.yaml:/data/.agents/sensors.yaml:ro
      - ./.agents/workflows:/data/workflows:ro
    command:
      - --workflows
      - /data/workflows
      - --server.port
      - "6543"
      - --server.host
      - "0.0.0.0"

volumes:
  harmonica-data:
```

Save as `docker-compose.yml`, create a `.env` file with your keys, then:

```bash
docker compose up -d
```

## SSH keys for private repositories

If your `workspace.repo_url` uses SSH (`git@github.com:...`), mount your SSH key:

```bash
docker run --rm \
  -e LINEAR_API_KEY=lin_api_... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v "$HOME/.ssh/id_ed25519:/home/harmonica/.ssh/id_ed25519:ro" \
  -v "$HOME/.ssh/known_hosts:/home/harmonica/.ssh/known_hosts:ro" \
  -v "$PWD/.agents/sensors.yaml:/data/.agents/sensors.yaml:ro" \
  -v "$PWD/.agents/workflows:/data/workflows" \
  ghcr.io/adamveld12/harmonica:latest
```

Or use HTTPS URLs with a `GITHUB_TOKEN` environment variable set in your workflow hooks.

## Building the image locally

```bash
git clone https://github.com/adamveld12/harmonica.git
cd harmonica
docker build -t harmonica:local .
```
