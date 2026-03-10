# Harmonica

An autonomous issue-driven coding agent orchestrator. Harmonica polls your Linear board, spins up isolated workspaces for active issues, and runs [Claude Code](https://github.com/anthropics/claude-code) agents to resolve them — continuously, in parallel, with retry and stall detection.

Read the @README.md for details.

## Folder Structure

```
.agents/
  sensors.yaml        # Named sensor definitions (Linear API connections)
  workflows/          # Workflow .md files (YAML frontmatter + Liquid template)
docs/
  tutorials/          # Lessons for beginners (step-by-step setup)
  guides/             # How-to guides for real-world problems
  references/         # Field-by-field API and config reference
server/src/           # Orchestrator source code (TypeScript/Bun)
ui/                   # React dashboard frontend
```

## Documentation Model

The `docs/` directory follows the [Divio documentation system](https://docs.divio.com/documentation-system/):

- **tutorials/** — Lessons that take a beginner through a complete project step by step
- **guides/** — How-to guides for solving real-world problems
- **references/** — Complete field-by-field descriptions of config, APIs, and template variables

## Tooling

**Package manager**: always use `pnpm` (not npm or bun for package management).

**Build & publish process**:

1. `bun run build` — compiles `server/src/` → `server/dist/` and builds `ui/dist/` (run automatically by `prepack`)
2. `pnpm pack --dry-run` — verify package contents before publishing
3. `pnpm publish` — publishes `@vdhsn/harmonica` to npm (public, scoped)

**Runtime**: Bun >= 1.0 is required to run the compiled output. `bun` must be in PATH.

**Scripts**:

| Script            | Description                                       |
| ----------------- | ------------------------------------------------- |
| `pnpm dev`        | Start server + UI dev server concurrently         |
| `pnpm dev:server` | Server only with `--watch` auto-reload            |
| `pnpm dev:ui`     | Vite dev server for the dashboard                 |
| `pnpm build`      | Build server (`server/dist/`) and UI (`ui/dist/`) |
| `pnpm typecheck`  | Run `tsc --noEmit` against `server/`              |
| `pnpm lint`       | Lint server + UI source                           |
| `pnpm format`     | Format all source files                           |
| `pnpm test`       | Run tests                                         |

## BEHAVIOR: Non-negotiable behaviors

- **ALWAYS** review documentation and code comments thoroughly when you are planning implementation or making code changes. The docs must always reflect the actual state.

- **PREFER** pure functions, functional programming patterns and clean interface abstractions when designing implementation.

- **ALWAYS** take opportunities to reuse existing functionality.
