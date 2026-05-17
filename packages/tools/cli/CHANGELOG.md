# @pyreon/cli

## 0.18.0

### Patch Changes

- Updated dependencies [[`f35e69b`](https://github.com/pyreon/pyreon/commit/f35e69b2ab53474ecf0ffb792866bc27215b68c3)]:
  - @pyreon/compiler@0.18.0
  - @pyreon/lint@0.18.0

## 0.17.0

### Minor Changes

- [#570](https://github.com/pyreon/pyreon/pull/570) [`c79ade7`](https://github.com/pyreon/pyreon/commit/c79ade7d8384ff7a0afe1a972db2db8c8fd18c88) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Foundation for `pyreon doctor` v2 — unified gate API + 4 programmatic gates.

  Introduces a shared `Finding` + `GateResult` shape (`packages/tools/cli/src/doctor/types.ts`) every doctor gate emits, and extracts four standalone-script gates as programmatic functions so the follow-up aggregator can produce a unified `DoctorReport` with per-category subscores + an overall 0-100 health score:

  - `runDistributionGate({ cwd })` — pure-function port of `scripts/check-distribution.ts`. Emits `distribution/missing-sideEffects`, `distribution/missing-map-exclusion`, `distribution/tarball-contains-map` findings under `category: 'architecture'`.
  - `runDocClaimsGate({ cwd })` — pure-function port of `scripts/check-doc-claims.ts`. Emits `doc-claims/<check>-drift` / `-hedged` / `-pattern-miss` / `-file-missing` findings under `category: 'documentation'`.
  - `runAuditTypesGate({ cwd })` — subprocess adapter over `scripts/audit-types.ts --json --all`. Maps HIGH/MEDIUM/LOW script severities onto `error`/`warning`/`info` and emits `audit-types/typed-but-unimplemented-<severity>` under `category: 'architecture'`. The script is 476 lines of mature AST-walking logic; the adapter shape keeps this PR tractable while letting the aggregator consume the same `Finding[]` as the other gates.
  - `runBundleBudgetsGate({ cwd })` — subprocess adapter over `scripts/check-bundle-budgets.ts --json`. Emits `bundle-budgets/over-budget`, `bundle-budgets/missing-budget`, `bundle-budgets/bundle-failed` under `category: 'performance'`. Slowest gate by a wide margin (~15-30s); doctor's follow-up `--full` flag is what enables it.

  The standalone scripts (`scripts/check-distribution.ts`, `scripts/check-doc-claims.ts`) are now thin CLI wrappers that delegate to the gate functions and preserve their historical JSON output shape (`{ violations, totalPackages }` / `{ drifts }`) for backward compat with any CI consumers parsing the output.

  No behavior change for CI gates or end users in this PR — this is foundation work for the upcoming `pyreon doctor` v2 aggregation + scoring + beautiful CLI output.

- [#575](https://github.com/pyreon/pyreon/pull/575) [`6960087`](https://github.com/pyreon/pyreon/commit/6960087fe09f984636c0ab0ef440280744f19a67) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor` v2 — feature-complete project health audit with a 0-100 score
  and beautiful CLI output (after [react.doctor](https://www.react.doctor/)).

  **What's new** (on top of PR 1's foundation):

  - **6 new gates** wired into the unified `GateResult` API:
    `react-patterns`, `pyreon-patterns`, `lint` (all 66 `@pyreon/lint` rules),
    `audit-tests`, `islands-audit`, `ssg-audit`.
  - **Score module** — pure per-category 0-100 subscores + overall weighted
    mean. Severity weights: `error=10 / warning=3 / info=1`. Letter grades
    A/B/C/D/F. Categories with no gate coverage are excluded from the mean
    rather than counted as perfect-100 (would inflate the score).
  - **DoctorReport aggregator** — `buildReport(gates) → { score, grade,
categories[], findings[], gates[], totals, elapsedMs, timestamp }`.
    Pure-function: gate results in, report out. Findings sorted errors →
    warnings → infos, then by category.
  - **Beautiful CLI output** — big-score banner with letter grade,
    per-category bar chart (12-cell ░/█ fill), severity-iconed top-N
    findings with code + clickable file:line:col location (OSC-8
    hyperlinks for iTerm2 / WezTerm / kitty / VSCode), fix hints, skipped-
    gates footer. ANSI colors respect `NO_COLOR` / `FORCE_COLOR`.
  - **`--json`** — full `DoctorReport` for AI agents + dashboards.
  - **`--gha`** — GitHub Actions annotation lines (`::error file=X,
line=Y,col=Z::msg`) for inline PR annotations.
  - **Modes** — `--full` (enable slow gates: audit-types, bundle-budgets),
    `--only <gates>`, `--skip <gates>`, `--fix` (lint + react-patterns),
    `--ci` (exit nonzero on error findings only). `--only` precedence
    over `--full`; `--skip` applies after `--only` (intersection).
  - **Parallel execution** — `Promise.all` over selected gates cuts
    wall-clock from ~5s sequential to ~1-2s for the fast set.
  - **Legacy flag compat** — `--audit-tests`, `--check-islands`,
    `--check-ssg` still work; they map to `--only <gate>` shortcuts so
    existing CI scripts continue to function unchanged.

  **Output sample** (text mode):

  ```text
    pyreon doctor · project health audit

    Score:  92/100   Grade: A

    Per category:

    correctness    █████████░░░  87 · 1E 1W
    performance    ████████████ 100 · clean
    architecture   ████████████ 100 · clean
    testing        ████████████ 100 · clean
    documentation  ████████████ 100 · clean

    Top findings (2 of 2):

    ✖ useState imported from React. Use signal() from @pyreon/reactivity.
       src/App.tsx:1:9
       fix: import { signal } from "@pyreon/reactivity"

    ⚠ className → class (HTML standard attribute).
       src/App.tsx:3:18

    1 error · 1 warning · 8 gates · 1.4s
  ```

  No breaking changes — all existing flags (`--audit-tests`,
  `--check-islands`, `--check-ssg`, `--fix`, `--json`, `--ci`) keep
  working.

### Patch Changes

- [#578](https://github.com/pyreon/pyreon/pull/578) [`acaa216`](https://github.com/pyreon/pyreon/commit/acaa216fb312e8da8f87125b9961834195c8e970) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor` v2 — two rough-edge fixes surfaced by real-app testing.

  **lint gate emitted absolute paths.** Every lint finding's `location.relPath`
  held the full absolute path from `fileResult.filePath` instead of a path
  relative to the doctor's `cwd`. Reports rendered as
  `/Users/.../packages/tools/react-compat/src/index.ts:830:4` instead of
  `packages/tools/react-compat/src/index.ts:830:4` — long, leaked the user's
  home directory, broke OSC-8 hyperlink alignment. Fix: route through
  `path.relative(opts.cwd, fileResult.filePath)`.

  **doc-claims gate flooded non-Pyreon projects with spurious errors.** The
  gate hardcodes Pyreon-monorepo-specific claim sites
  (`packages/fundamentals/hooks/README.md`, `CLAUDE.md`,
  `docs/docs/index.md`, etc.) — none of which exist in a downstream consumer
  app. Running `pyreon doctor` against a clean project produced 7
  `file-missing` errors that blamed the user for paths the gate had no
  business asserting. Fix: pre-check whether ANY of the gate's claim files
  exist; if zero do, return `meta.skipped: true` with
  `skipReason: 'no claim sites found in this project (gate targets Pyreon
monorepo paths)'`. The aggregator then excludes documentation from the
  score mean rather than counting it as 0/100.

  Test coverage: the original "emits file-missing when claim file absent"
  test was tightened to plant one claim file first (so the gate doesn't
  skip), and a new "skips gate when no claim files exist" test locks the
  non-Pyreon-project behavior. 102 tests pass.

- Updated dependencies [[`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/compiler@0.17.0
  - @pyreon/lint@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.16.0

## 0.14.0

### Minor Changes

- [#311](https://github.com/pyreon/pyreon/pull/311) [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Test-environment audit (T2.5.7) — scans every `*.test.ts(x)` under `packages/` for mock-vnode patterns (the PR [#197](https://github.com/pyreon/pyreon/issues/197) bug class: tests that construct `{ type, props, children }` literals or a custom `vnode()` helper instead of going through the real `h()` from `@pyreon/core`). Classifies each file as HIGH / MEDIUM / LOW based on the balance of mock literals, helper definitions, helper call-sites, real `h()` calls, and the `@pyreon/core` import.

  Scanner lives in `@pyreon/compiler` (`auditTestEnvironment`, `formatTestAudit`) so both `@pyreon/mcp` and `@pyreon/cli` can use it without pulling in each other.

  - **MCP**: new `audit_test_environment` tool. Options `minRisk` (default `medium`) and `limit` (default 20). Scans 400+ test files in ~50ms.
  - **CLI**: `pyreon doctor --audit-tests` appends the audit output. `--audit-min-risk high|medium|low` to filter. Honors `--json` for machine-readable output.

### Patch Changes

- Updated dependencies [[`aa8e61b`](https://github.com/pyreon/pyreon/commit/aa8e61b873b7d42c60a613f57841a75293080c8a), [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d), [`4638c27`](https://github.com/pyreon/pyreon/commit/4638c2761ec34b1102a36c4675cfcfa805c2168c), [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d)]:
  - @pyreon/compiler@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

- Updated dependencies []:
  - @pyreon/compiler@0.5.1

## 0.5.0

### Minor Changes

- ### New packages

  - `@pyreon/cli` — project doctor command that detects React patterns (className, htmlFor, React imports) and auto-fixes them for Pyreon
  - `@pyreon/mcp` — Model Context Protocol server providing AI tools with project context, API reference, and documentation

  ### Features

  - **JSX type narrowing** — added `JSX.Element`, `JSX.ElementType`, and `JSX.ElementChildrenAttribute` for full TypeScript JSX compatibility
  - **Callback refs** — `ref` prop now accepts `(el: Element) => void` in addition to `{ current }` objects
  - **React pattern interceptor** (`@pyreon/compiler`) — AST-based detection and migration of React patterns to Pyreon equivalents
  - **Vite plugin context generation** — automatically generates `pyreon-context.json` and `llms.txt` during dev/build
  - **MCP server tools** — `get-context`, `lookup-api`, `diagnose-error`, `suggest-migration` for AI-assisted development

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.0
