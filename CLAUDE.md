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
src/                  # Orchestrator source code (TypeScript/Bun)
ui/                   # React dashboard frontend
workflows/            # Legacy single-workflow location (may be removed)
```

## Documentation Model

The `docs/` directory follows the [Divio documentation system](https://docs.divio.com/documentation-system/):

- **tutorials/** — Lessons that take a beginner through a complete project step by step
- **guides/** — How-to guides for solving real-world problems
- **references/** — Complete field-by-field descriptions of config, APIs, and template variables

## Tooling

**Package manager**: always use `pnpm` (not npm or bun for package management).

**Build & publish process**:
1. `bun run build` — compiles `src/` → `dist/` and builds `ui/dist/` (run automatically by `prepack`)
2. `pnpm pack --dry-run` — verify package contents before publishing
3. `pnpm publish` — publishes `@vdhsn/harmonica` to npm (public, scoped)

**Runtime**: Bun >= 1.0 is required to run the compiled output. `bun` must be in PATH.
