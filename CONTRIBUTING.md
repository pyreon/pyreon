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

### Memory-Leak Avoidance

Before introducing a new **module-level cache / stack / registry** (`new Map()`, `new Set()`, `let stack: T[] = []`, etc.), read [`.claude/rules/anti-patterns.md`](.claude/rules/anti-patterns.md) → "Memory Leak Classes". The 8-PR leak-hunt sweep (#725 → #741) produced a 5-class taxonomy (A position-based pop, C unbounded cache, D event-listener pile-up, F promise stale resolution, I orphaned `Promise.race + setTimeout`) with canonical fix shapes for each.

Three preventative layers are in place:

- **Lint rules** (in the `recommended` preset): `pyreon/promise-race-needs-cleartimeout` (Class I) and `pyreon/init-fn-needs-idempotency` (Class D) — fire at edit time.
- **Static audit** (`bun run audit-leak-classes` or `pyreon doctor --only audit-leak-classes`): permissive offline scan with 4 detectors. Produces an advisory report for manual triage.
- **Anti-patterns catalog** (`.claude/rules/anti-patterns.md`): the canonical reference for the 5 classes + cross-references to the PRs that fixed each instance.

The 3-question defensive check when adding new module-level state:

1. What's the eviction trigger?
2. What's the cleanup contract?
3. Is the cleanup path actually exercised by any test?

If any answer is "the GC will handle it" or "the user will dispose it manually", treat the design as a leak source until proven otherwise.

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

### Native binary publishing (OIDC trusted publishing)

The 7 platform packages (`@pyreon/compiler-darwin-arm64`, `darwin-x64`, `linux-x64-gnu`, `linux-arm64-gnu`, `linux-x64-musl`, `linux-arm64-musl`, `win32-x64-msvc`) ship via `release-native.yml` triggered by tag push. The workflow uses **npm OIDC trusted publishing** — no long-lived `NPM_TOKEN` secret stored in the repo.

**One-time manual bootstrap (required once, because the packages don't exist yet).** Per [npm's docs](https://docs.npmjs.com/trusted-publishers), trusted publishing is configured on a package's **own settings page** (`npmjs.com → Packages → <package> → Settings → Trusted publishing`) — there is **no** account/org-level pre-registration page, and a trusted publisher **cannot** be configured for a package that has never been published. (An earlier revision of this doc claimed otherwise and pointed at a non-existent `/settings/<org>/publishing/oidc/new` URL — that was wrong; npm has no such flow.) The 7 platform packages therefore need a one-time manual first publish to bring them into existence, after which all future releases are fully automated via OIDC.

Do this **once** (any maintainer with `@pyreon` publish rights):

1. **Build the 7 binaries without publishing.** GitHub → Actions → `release-native.yml` → *Run workflow*, set input `publish: false`. The build matrix produces all 7 `pyreon-compiler-<triple>.node` artifacts (the publish job is gated off). Download all 7 artifacts.
2. **Stage + print the publish commands.** Run `bun scripts/bootstrap-native-publish.ts <downloaded-artifacts-dir>` — it copies each binary into the matching `packages/core/compiler/npm/<short>/pyreon-compiler.node`, runs the >100 KB sanity check, and prints the exact per-package publish command. It does **not** publish anything itself.
3. **Publish each, manually.** Confirm the account first (`npm whoami` → must have `@pyreon` rights), then run the printed command for each of the 7:
   ```
   cd packages/core/compiler/npm/<short> && npm publish --access public
   ```
   **No `--provenance` here** — provenance attestation requires the GitHub Actions OIDC runtime and fails on a local publish. (Provenance is added automatically by the OIDC path from the next release onward.) The packages publish at the current stub version (it tracks the release version via changesets), which backfills native binaries for that already-released `@pyreon/compiler` version too.
4. **Now configure trusted publishing** (the packages exist, so this works). For **each** of the 7: `npmjs.com → Packages → @pyreon/compiler-<short> → Settings → Trusted publishing → Add publisher → GitHub Actions`:
   - **Repository**: `pyreon/pyreon`
   - **Workflow filename**: `release-native.yml`
   - **Environment**: leave blank (the workflow doesn't use GitHub Environments)

After the bootstrap, every subsequent `release-native.yml` run on a `v*.*.*` tag publishes all 7 via OIDC at the new version — the workflow's `id-token: write` permission lets npm 11+ (Node 24) exchange a short-lived OIDC token for a per-publish npm token, scoped to this workflow + package + commit SHA. npm versions are immutable, so the bootstrap runs exactly once; CI never re-publishes an existing version, only new ones.

**Why no `NPM_TOKEN`**: long-lived tokens are an exfil surface during publish (they have full publish scope). OIDC trusted publishing replaces that with per-deploy attestation; the published tarballs also gain a `provenance` field that consumers can verify against the GitHub workflow run.

**Recovery**: if all 7 are registered correctly and the workflow still fails with `ENEEDAUTH`, check the workflow file does NOT set `NODE_AUTH_TOKEN` on the Publish step — even an empty-string token (which `${{ secrets.NPM_TOKEN }}` resolves to when the secret is unset) prevents npm from falling back to OIDC. See the comment on the Publish step in `release-native.yml`.

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
