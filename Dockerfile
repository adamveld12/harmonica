# syntax=docker/dockerfile:1

# ---- build stage ----
FROM oven/bun:1-alpine AS builder

# Install Node.js (needed by Vite for UI build) and pnpm
RUN apk add --no-cache nodejs npm \
    && npm install -g pnpm

WORKDIR /build

# Copy manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY server/package.json server/package.json
COPY ui/package.json ui/package.json
COPY cli/package.json cli/package.json
COPY sensors/core/package.json sensors/core/package.json
COPY sensors/linear/package.json sensors/linear/package.json
COPY sensors/github/package.json sensors/github/package.json

# Install all dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# Copy source
COPY server/ server/
COPY ui/ ui/
COPY cli/ cli/
COPY sensors/ sensors/
COPY tsconfig.json ./

# Build everything (server + ui + cli assembly via turbo)
RUN pnpm run build

# Use pnpm deploy to produce a self-contained, flat node_modules for the cli package
# This resolves pnpm's virtual store symlinks into a real, portable node_modules tree
RUN pnpm deploy --filter=@vdhsn/harmonica --prod /deploy

# Copy the built dist into the deploy directory so everything is in one place
RUN cp -r /build/cli/dist /deploy/dist

# ---- runtime stage ----
FROM oven/bun:1-alpine AS runtime

# Install runtime dependencies:
#   - gh  (GitHub CLI — agents use it for PRs/issues)
#   - git (workspace cloning & hooks)
#   - pnpm (available inside agent workspaces)
#   - ca-certificates (HTTPS)
RUN apk add --no-cache \
        ca-certificates \
        git \
        github-cli \
    && bun install -g pnpm

# Create a non-root user
RUN addgroup -S harmonica && adduser -S -G harmonica harmonica

# App lives here
WORKDIR /app

# Copy the self-contained deployment (flat node_modules + dist + package.json)
COPY --from=builder /deploy/ ./

# Data directory — mount a volume here to persist DB and workspaces
ENV HARM_CONFIG_DIR=/data
VOLUME ["/data"]

# Claude config directory — mount ~/.claude from the host for subscription auth
# e.g. -v $HOME/.claude:/home/harmonica/.claude:ro
ENV HOME=/home/harmonica

# Expose the dashboard port (use --server.port at runtime or set HARM_SERVER_PORT)
EXPOSE 6543

USER harmonica

ENTRYPOINT ["bun", "/app/dist/server/index.js"]
CMD ["--workflows", "/data/workflows"]
