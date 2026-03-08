# How to install Harmonica

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0 — required at runtime
- A package manager: npm, pnpm, or bun

## Install from npm (recommended)

```bash
pnpm install -g @vdhsn/harmonica
harmonica --help
```

## Run without installing

```bash
bunx @vdhsn/harmonica --workflows .agents/workflows/
```

## Install from source

```bash
git clone https://github.com/vdhsn/harmonica
cd harmonica
pnpm install
bun run server/src/index.ts --workflows .agents/workflows/
```

## Verify the installation

```bash
harmonica --help
```

You should see the CLI usage output. If you get `command not found`, ensure your global bin directory is in `PATH` (e.g., `$(pnpm root -g)/../bin`).
