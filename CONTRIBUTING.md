# Contributing to Pyreon

Thanks for your interest in contributing to Pyreon! This guide will help you get started.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.1+
- Node.js 20+ (for some tooling)

### Getting Started

```bash
# Clone the repo
git clone https://github.com/pyreon/pyreon.git
cd pyreon

# Install dependencies
bun install

# Run all tests
bun run test

# Type-check all packages
bun run typecheck

# Lint
bun run lint
```

### Workspace Structure

Pyreon is a monorepo with packages under `packages/`:

| Package                  | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `@pyreon/reactivity`     | Signals, computed, effects, stores                |
| `@pyreon/core`           | VNode, h(), Fragment, lifecycle, context, JSX     |
| `@pyreon/runtime-dom`    | DOM renderer, mount, hydrate, transitions         |
| `@pyreon/compiler`       | JSX transform, static hoisting, template emission |
| `@pyreon/runtime-server` | renderToString, renderToStream                    |
| `@pyreon/router`         | Client and SSR routing                            |
| `@pyreon/head`           | Document head management                          |
| `@pyreon/server`         | SSR handler, SSG prerender, islands               |
| `@pyreon/vite-plugin`    | Vite integration                                  |
| `@pyreon/react-compat`   | React compatibility layer                         |
| `@pyreon/preact-compat`  | Preact compatibility layer                        |
| `@pyreon/solid-compat`   | SolidJS compatibility layer                       |
| `@pyreon/vue-compat`     | Vue 3 Composition API compatibility layer         |

Each package resolves via `"bun": "./src/index.ts"` in exports — no build step needed during development.

## How to Contribute

### Reporting Bugs

1. Search [existing issues](https://github.com/pyreon/pyreon/issues) first.
2. Include a minimal reproduction (code snippet, repo link, or failing test).
3. Include your environment: Bun version, OS, browser (if relevant).

### Suggesting Features

Open a [discussion](https://github.com/pyreon/pyreon/discussions) or issue with:

- The use case you're trying to solve
- Your proposed API or approach
- Any alternatives you've considered

### Submitting Changes

1. **Fork and branch.** Create a feature branch from `main`.
2. **Write tests.** Every change should have test coverage.
3. **Follow the style.** Run `bun run lint` and `bun run typecheck` before committing.
4. **Keep commits focused.** One logical change per commit.
5. **Open a PR.** Describe what changed and why.

### Running Tests

```bash
# All packages
bun run test

# Single package
cd packages/reactivity && bun run test

# With watch mode
cd packages/core && bunx vitest
```

DOM-dependent packages (`runtime-dom`, `router`, `head`, compat packages) use `happy-dom` as the test environment.

### Code Style

- **Biome** for linting and formatting (`bun run lint`, `bun run check`)
- **TypeScript** strict mode with `exactOptionalPropertyTypes`
- No default exports — use named exports
- Prefer `const` over `let`
- No classes in core packages (plain functions + closures)

### Commit Messages

Use clear, imperative-tense messages:

```
fix(router): prevent open redirect via sanitizePath
feat(reactivity): add createSelector for O(1) lookups
test(core): add coverage for Suspense timeout
docs(head): update SSR examples
```

## Releases

Pyreon ships via [changesets](https://github.com/changesets/changesets). Every PR that touches `packages/` should include a changeset (`bun changeset`) describing the change.

### 0.x version policy — no `major` changesets

Pyreon is currently 0.x. **All changesets must be `minor` or `patch`** — never `major`. A `major` changeset on a 0.x package produces a 1.0.0 cascade across the `fixed` group of 60+ packages, which is not appropriate for the current pre-1.0 stability commitment.

Two layers enforce this:

1. **CI guard (`Check No Major Changesets`)** — runs on every PR via `scripts/check-no-major-changesets.ts`. Fails with a clear error if any `.changeset/*.md` contains `: major`. Caught at PR time so contributors fix it before merging.
2. **Release-time cap (`scripts/cap-changeset-bumps.ts`)** — defense-in-depth. If a `: major` ever lands on `main` (e.g. via a workflow path that bypasses the PR check), the release workflow rewrites it to `: minor` BEFORE `changesets/action` runs `version-packages`. Logs the downgrade so it's visible in the release run.

**Breaking changes are still allowed** in 0.x — write the changeset as `minor` and call out the breaking change explicitly in the prose. Consumers who track minor bumps get the right signal from the changelog.

When Pyreon goes 1.0 someday, **remove BOTH the CI guard and the release-time cap in a single deliberate PR**. That removal IS the explicit signal "we're going 1.0 now" — it's intentionally a manual step so it can't happen by accident.

### Release workflow

`.github/workflows/release.yml` runs on every push to `main`:

1. (No pre-validation — CI on the merge commit gates this; the release job is lean.)
2. **Cap any `: major` → `: minor`** in changesets via `scripts/cap-changeset-bumps.ts` (see 0.x policy above).
3. If unreleased changesets exist → opens / updates a "Version Packages" PR collecting them.
4. When that PR is merged → `scripts/publish.ts` publishes each package to npm with provenance, emits `New tag: <name>@<version>` lines per success so `changesets/action` populates `outputs.published='true'`.
5. The umbrella GitHub Release step (gated on `outputs.published`) creates the `v<version>` git tag + GitHub Release, which triggers `release-native.yml` to cross-compile + publish the Rust compiler binaries for all 7 platform triples.

### Setup: `RELEASE_PAT` (recommended)

The default `GITHUB_TOKEN` issued to workflows is forbidden from triggering downstream workflows when it pushes commits. The practical effect: the Version Packages PR opens with a **blank CI status** because CI doesn't fire on the commit `changesets/action` pushes. Merging a Version PR with no CI checks is awkward — you can't know if `bun.lock` got regenerated correctly, etc.

**Fix**: create a fine-grained PAT and store it as the repo secret `RELEASE_PAT`. The release workflow uses `${{ secrets.RELEASE_PAT || secrets.GITHUB_TOKEN }}` and falls back to the default token if `RELEASE_PAT` is missing.

PAT scope (fine-grained):

- Repository access: `pyreon/pyreon` only
- Repository permissions:
  - **Contents**: Read and write
  - **Pull requests**: Read and write
  - **Workflows**: Read and write
- Expiry: 90 days (rotate via GitHub UI)

After creating the PAT, add it as a repository secret named `RELEASE_PAT` under Settings → Secrets and variables → Actions.

Without `RELEASE_PAT` the workflow still works — just expect blank CI on the Version PR.

### Required GitHub Actions permission

Settings → Actions → General → Workflow permissions → check **"Allow GitHub Actions to create and approve pull requests"**. Without this, `changesets/action` cannot open the Version PR and the workflow fails with `GitHub Actions is not permitted to create or approve pull requests`.

## Architecture Notes

- **Signals** are the foundation — one closure per signal, subscribers tracked via `Set<() => void>`.
- **Components run once** (setup phase). Reactivity handles updates at the DOM node level.
- **SSR** uses `AsyncLocalStorage` for per-request context isolation.
- **The compiler** transforms JSX to `_tpl()` + `_bind()` calls for optimal DOM creation via `cloneNode`.

See [CLAUDE.md](./CLAUDE.md) for detailed architectural documentation.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
