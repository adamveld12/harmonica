# How to release Harmonica

## Prerequisites

- Write access to the GitHub repository
- npmjs.com trusted publishing configured for this repo (see [First-time setup](#first-time-setup))
- CI passing on `main` (the release workflow is independent, but a broken build will fail mid-release)

## Choosing a version

Check the current version:

```bash
cat package.json | grep '"version"'
```

Follow [semver](https://semver.org/):

| Change                           | Bump                      |
| -------------------------------- | ------------------------- |
| Backwards-compatible bug fix     | patch (`0.1.0` → `0.1.1`) |
| New backwards-compatible feature | minor (`0.1.0` → `0.2.0`) |
| Breaking change                  | major (`0.1.0` → `1.0.0`) |

## Running the release

1. Go to **GitHub** → **Actions** → **Release** (left sidebar)
2. Click **Run workflow**
3. Enter the version number — no `v` prefix (e.g. `0.2.0`)
4. Click **Run workflow**

That's it. The workflow handles everything from here.

## What the workflow does

1. Bumps `package.json` to the specified version
2. Runs `bun run build` to compile `src/` → `dist/` and `ui/dist/`
3. Publishes `@vdhsn/harmonica` to npm via OIDC trusted publishing (no stored token needed)
4. Commits the version bump as `release: v<version>` and pushes to `main`
5. Creates and pushes a `v<version>` tag
6. Creates a GitHub Release with auto-generated notes from merged PRs and commits

## Verifying the release

Check npm:

```bash
npm info @vdhsn/harmonica version
```

Check GitHub Releases:

```
https://github.com/vdhsn/harmonica/releases
```

Check that the version commit and tag landed on `main`:

```bash
git fetch --tags
git log --oneline -5
git tag | sort -V | tail -5
```

## First-time setup

Trusted publishing must be configured on npmjs.com before the first release. This is a one-time step.

1. Log in to [npmjs.com](https://www.npmjs.com/)
2. Open the `@vdhsn/harmonica` package settings → **Publishing** → **Automated publishing**
3. Add a trusted publisher:
   - **Publisher**: GitHub Actions
   - **Repository**: `vdhsn/harmonica` (or the actual org/repo)
   - **Workflow filename**: `release.yml`
4. Save

After this is configured, the workflow can publish without a stored `NPM_TOKEN` secret.

## Troubleshooting

**OIDC not configured** — if the publish step fails with a 403 or "OIDC token" error, trusted publishing has not been set up on npmjs.com. Complete the [First-time setup](#first-time-setup) steps.

**First publish of a new package** — npm may reject the first OIDC publish for a package that does not yet exist. Run the initial publish manually:

```bash
npm publish --access public
```

Then re-run the release workflow for subsequent releases.

**CI failing on main** — the Release workflow does not depend on CI and will still run. However, if `bun run build` fails inside the release job, the workflow will abort before publishing. Fix the build on `main` first.
