# Tool packages — atlas, lathe, loom, testing, CLI

Read before touching `packages/tools/{atlas,lathe,loom,cli}` or `@pyreon/testing`.

## `@pyreon/atlas` — component workbench

Derives a verified, machine-readable component catalog from source. You write no stories.

### Commands

| Command | What it does |
| --- | --- |
| `atlas init [dir]` | Detects workspace packages and writes `atlas.config.ts`. `--force`, `--dry-run`, `--title`. |
| `atlas scan [dir]` | Builds the catalog; writes `atlas-catalog.json` + `atlas-agent-guide.md`. Exits non-zero when any scenario fails a check. `--no-mount` = static only (never imports project modules). |
| `atlas verify [Component] [dir]` | Re-checks one component for the write → verify → fix loop. `--json`. |
| `atlas check <Component> [json]` | Validates a proposed usage against the derived contract (catches `state="primry"`). Non-zero on findings. |
| `atlas dev [dir]` | Zero-config workbench on the real Vite compiler. |
| `atlas verify-browser [dir]` | Browser half of verification in real Chromium. `--update-snapshots`. Needs `playwright-core` (optional peer). |
| `atlas build [dir]` | Static site. `--out` (default `atlas-dist`), `--title`, `--base`. |

### Scan and scenarios

- Controls come from props; scenarios from variant axes, including rocketstyle dimensions.
- Variant scenarios fan one axis at a time (`Σ|axis|`). `matrix: 'full'` opts into the full `Π|axis|` product.
- Every component gets a `Default` scenario. An authored `Default` in `atlas.config.ts` is the base for every derived scenario, and its args stay live (render-prop children and `h()` trees reach the canvas intact).
- Edge cases target a content prop.
- Every scenario gets placeholder content derived from the rendered tag (`__rs_attrs` / `__rs_component`) or the base a chain renders through (e.g. `open: true` for `ModalBase`). One `materializeContent` applies it in the verify harness, the SSR-parity check and the workbench render; keep it single-sourced.
- A scenario that mounts no DOM (no element, no text, nothing portaled) fails `interaction` with `empty-render`. An `auto-edge` scenario reports it without failing.
- Config escape hatches: `browserOnly: [...]` for components that return `null` on the server; `parts: { TabPanel: 'Tabs' }` for components that only render inside a parent (the canvas shows the parent's opening scenario).

### Verification

- Six checks per scenario, listed once in `CHECK_KEYS` (`atlas/src/core/types.ts`): `a11y`, `interaction`, `reactivityCoverage`, `leak`, `snapshot`, `ssrParity`. Iterate that list; never hand-write a copy.
- The report names which check failed: `checks: a11y 18/20 ✗ · interaction 43/43 · …` plus `not run:` lines with reasons.
- `N verified` counts scenarios, not checks. A scenario that ran two of six checks still counts as verified, so read the `not run:` lines.
- Findings are `{ code, message, fix? }` (catalog v2); `code` is stable. MCP refuses a v1 catalog.
- `atlas verify <Component>` verifies only the match and never writes the catalog. An unmatched name or a run that verified nothing exits non-zero.
- `--check` (on `scan` and `verify`) ratchets against the committed catalog: non-zero on regression, never rewrites the baseline, missing baseline = exit 0. A check that stopped running counts as a regression — losing coverage makes the counts improve.
- `atlas verify-browser` measures reactive coverage on the page's own devtools-bridge instance and diffs snapshots against `./atlas-snapshots`, merging verdicts into `atlas-catalog.json`.

### Workbench and static build

- `atlas dev` re-derives the catalog when a scanned file changes (debounced; a failed rescan keeps the previous catalog). The canvas opens on `Default` with all its args; a link carries only edits.
- `atlas build` bakes the node-answered panels (Docs source, Reactivity Lens) into each page, so a serverless deploy keeps real verdicts. An uncomputable answer bakes its reason.
- `e2e/atlas-ui-components.spec.ts` builds the real ui-components library and checks every page.

### Config and monorepos

- `atlas.config.ts` is optional: theme, wrapper, presets, authored `play` scenarios, `title`, `pages`. `pages` is presentation only and never overrides the real `name` (it drives imports and source lookup).
- `projects: [{ name, dir }]` merges packages into one catalog. Identity is `componentKey` = `project/Name` (bare `Name` outside a monorepo). An ambiguous bare name refuses and lists candidates; `pages` / `scenarios` accept `Core/Button` or a bare `Button` (every match).
- No singleton sentinel by design: the scan loader loads projects that themselves import atlas.

## `@pyreon/lathe` — OpenAPI client generator

OpenAPI 3.x in; `@pyreon/validate` schemas, `@pyreon/http` endpoints, `@pyreon/query` hooks, mock fixtures and `@pyreon/atlas` scenarios out.

### Commands

- `lathe generate [spec]` — write the client.
- `lathe check [spec]` — generate in memory; fail if output is stale (the `gen-docs --check` contract).
- `lathe pull <url>` — fetch a remote spec to the configured input path.
- Options: `--target web|multiplatform`, `--out` / `--output` (default `./src/gen`), `--base-url`, `--plugins a,b`, `--client pyreon|fetch|axios|ky`, `--validator pyreon|zod`, `--strict-native`, `--fail-on-breaking`, `--json`, `--watch` / `-w`.

### Input

- First-party parsing, including a YAML reader that refuses anchors, merge keys, explicit tags and tab indentation (with a line number).
- Anything the IR cannot represent becomes a `note` with a stable code and JSON pointer.
- Output is deterministic; an unchanged spec regenerates byte-identically.

### Output layout

- A layered graph, not one barrel: `index.ts` (production), `dev.ts` (fixtures/factories, node-safe), `endpoints/index.ts` + `queries/index.ts` per layer, per-tag files.
- An emitted `package.json` declares `sideEffects`, so the graph tree-shakes regardless of the consuming app's config.
- Dev isolation is structural: `index.ts` never names `./faker`, `./mocks` or `./components`. The entry-point tests run with and without the marker; the no-marker half catches regressions. `/* @__PURE__ */` per declaration does not fix this.
- Plugins: `types`, `schemas`, `client`, `queries`, `mocks`, `faker` (`createX(overrides?)`; spec constraints win over realism), `components`, `atlas`, `docs` (Markdown for the generated client, including native reach).

### `target: 'multiplatform'`

- PMTC sees one file's top level, so the native target emits one self-contained module per tag.
- It runs the real native compiler over its output and asserts the positive markers (`PyreonQuery<`, `PyreonZodSchema_`) and no leaked web-only symbols. Zero warnings is not evidence. A `does NOT compile` warning counts as broken; an absent compiler skips loudly.
- Per-operation reach is reported in spec terms (`lathe/src/core/generate.ts`):
  - a relative or missing `baseUrl` makes every operation `web-only` (PMTC bakes the request URL at compile time);
  - non-GET operations are `web-only` (PMTC does not lower mutations);
  - GET operations with path parameters reach native — the param becomes a component prop and lowers through `useQuery`.
- A non-Pyreon `--client` with `target: 'multiplatform'` is refused.

## `@pyreon/loom` — dependency observatory

- `loom scan [dir]` reads the workspace like an install tool (npm/bun/yarn/pnpm globs, including `packages/*/*`) and reports the fabric as data. Writes `loom-report.json` next to the root manifest; exits non-zero on error-severity findings. Flags: `--strict`, `--no-imports`, `--no-write`, `--json` (report only on stdout).
- `loom dev [dir]` (`--port=`) serves the observatory UI, built on the public Pyreon UI stack.
- `loom build [dir]` prerenders it to a static site (`--out=`, default `loom-dist`; `--base=`). `vite`, `@pyreon/vite-plugin` and `@pyreon/zero` are optional peers; `scan` needs none.
- Report: internal graph (depths, runtime cycles only, blast radius), external version usage, and 8 detector codes: `version-drift`, `internal-range`, `cycle`, `phantom-dep`, `phantom-type-dep`, `prod-import-of-dev-dep`, `peer-mismatch`, `unused-dep` (info).
- Type-aware: type-only imports/exports and `.d.ts` files are tracked apart from runtime imports; tsconfig `paths` aliases are never packages. The import scan strips comments and template literals.
- Config: root `package.json` `loom` key or a `loom` section in `pyreon.config.*` (same shape; `package.json` wins per key): `devPaths` (globs that are not shipping source), `ignore` (`[{ pkg?, dep?, code?, reason }]`, reason required), `strict`, per-code `severity`.
- Reads declared manifests only — no lockfile or registry.
- Served to agents by MCP `get_dependency_fabric`.
- No singleton sentinel (tool precedent).

## `@pyreon/testing` — public test kit

- Testing-Library parity: `render` / `screen` / `cleanup`, the full query families, `fireEvent`, `waitFor` / `waitForElementToBeRemoved`, `renderHook`.
- `fireEvent` dispatches real bubbling events through Pyreon's delegation root.
- `renderHook` runs the hook once; `rerender` updates the reactive props signal.
- jest-dom matchers via `@pyreon/testing/matchers`; the `/vitest` setup file adds auto-cleanup + matchers.
- Pyreon-specific matchers: `expectSignal` / `expectEffect` (fire counts, re-runs) and `expectGarbageCollected` / `expectNoReactiveLeak`.
- Subpaths gated on optional peers, not re-exported from the main entry:
  - `/form` — `renderForm`, `fillForm` / `submitForm` by accessible label through real events, `expectForm`;
  - `/ui` — `renderWithTheme` + reactive `setMode`, `expectComputedStyle` (real-browser territory);
  - `/router` — `renderWithRouter` is async and settles the initial route via `router.preload`, so `useLoaderData` is populated on first render; `navigate()` resolves post-commit; `expectRouter.toBeAt` matches a pattern or a concrete path;
  - `/store` — `installStoreReset` / `withFreshStore`;
  - `/i18n` — `renderWithI18n` + `setLocale`;
  - `/toast` — `expectToast` / `findToast` / `clearToasts` (store-level, string messages only);
  - `/query` — `renderWithQueryClient` / `createTestQueryClient` (retry off, `gcTime: Infinity`).
- Every harness takes `wrapper` for provider composition.
- Conventions: fluent assertions (`expectForm(form).toBeValid()`), never `expect.extend`; wraps `@testing-library/dom` + `jest-dom`.
- Browser package. Distinct from the private `@pyreon/test-utils` (framework-internal helpers).

## `pyreon` CLI

- `pyreon check [paths]` — file-scoped compiler-detector scan (`detectPyreonPatterns` + `detectReactPatterns`) with inline fixes. No paths → git-changed `.ts/.tsx`. `--fix` applies `migratePyreonCode` + `migrateReactCode`; `--json`. Non-zero on findings. Terminal twin of MCP `validate`.
- `pyreon add <pkg…>` — installs `@pyreon/*` packages with the lockfile's package manager and prints a setup recipe from `add-recipes.ts` (manifests are not shipped, so recipes cannot come from them). Bare names normalize (`query` → `@pyreon/query`). `--dry-run`, `--json`.
- `pyreon new [name] [--native]` — delegates to `npx @pyreon/create-zero@latest` (or `@pyreon/create-multiplatform@latest` with `--native`); other args pass through; `--dry-run` prints the command.
- `pyreon mcp [args]` — delegates to `npx @pyreon/mcp` without `@latest`, so a project-local `@pyreon/mcp` (matching the installed Pyreon version) wins. Inherits stdio. `--dry-run` passes through.
- `pyreon plain [paths] [--write] [--json]` — Plain Mode readiness report (per-file convertibility, each declined shape named, histogram). `--write` applies the classic → plain codemod. No paths → whole tree under cwd.
- `pyreon lint` (forwards every `pyreon-lint` flag via `runCli`), `pyreon info` (env + `@pyreon/*` version skew), `pyreon upgrade` (align versions, then run the versioned codemods the upgrade crosses — `packages/tools/cli/src/codemods`; a `@pyreon/zero` minor changeset must carry `Upgrade: none | codemod <id> | manual — <reason>`, gated by `check-breaking-changeset-codemod`).
- `pyreon atlas`, `pyreon lathe`, `pyreon loom` forward to those tools.

## `pyreon doctor`

- 15 gates: react-patterns, pyreon-patterns, lint, distribution, doc-claims, islands-audit, ssg-audit, content-audit, native-audit, audit-tests, check-dedup, audit-leak-classes, dependency-fabric, plus the slow audit-types and bundle-budgets. Sources: `packages/tools/cli/src/doctor/gates/`.
- Flags: `--full`, `--fix`, `--json`, `--gha`, `--ci`, `--only`, `--skip`, `--roots`, `--check-ssg`, `--check-islands`, `--audit-tests`.
- 0–100 score. The advisory `best-practices` category is excluded from the grade and from `--ci`.
- `dependency-fabric` runs the project's own `@pyreon/loom` (resolved, never fetched) and skips when absent.
- File-scanning gates take their scope from the workspace's own `workspaces` / pnpm globs (`doctor/utils/workspace-roots.ts`, cwd-independent, multi-root aware). `pyreon.doctor.excludeRoots` in the root `package.json` excludes roots.
- An empty scan is a skip with a warning, never a clean pass (`meta.emptyScan`). A skipped category is excluded from the mean, never scored 100. A run where nothing was measured renders `—` and fails `--ci` (`report.measured`).

## `.mcp.json` launcher

The repo's MCP server is launched through `bash -c` with an UNBRACED `$CLAUDE_PROJECT_DIR`, because no working directory is guaranteed. Claude Code substitutes `${VAR}` / `${VAR:-default}` in `.mcp.json` args from its own environment, where `CLAUDE_PROJECT_DIR` is unset, so a braced form becomes `.` before bash runs; the unbraced form reaches bash, which reads it from the server's environment (the `test -n … || CLAUDE_PROJECT_DIR=$PWD` guard covers a genuine absence). When testing a change, simulate both expansion stages, not just the bash one.
