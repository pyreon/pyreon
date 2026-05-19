# @pyreon/cli

## 0.20.0

### Patch Changes

- [#656](https://github.com/pyreon/pyreon/pull/656) [`abda63c`](https://github.com/pyreon/pyreon/commit/abda63c541343cfe967a5c70ce223a6675ceaa8e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor` text output now follows the Pyreon brand handoff ([#651](https://github.com/pyreon/pyreon/issues/651)) — CLI spec §6.5 / `pyr doctor` §6.6.

  `render/ansi.ts` maps every brand token to its nearest **xterm-256** index and emits 8-bit SGR (`38;5;N`). The handoff is explicit — _"256-color terminal palette must survive (no truecolor-only colors)"_ — so there is no `38;2;r;g;b`; the codes render identically on truecolor terminals and remain correct on 256-only ones. Mapping: `red`→ember-core `#FF5E1A` (202, errors / fail grade / `✗`), `yellow`→ember-warm `#FFC83D` (220, warnings · hints · `!`), `green`→ok-green `#4ADE80` (78, pass / grade A), `cyan`→brand cyan `#22D3EE` (45, info · links), `gray`→muted-2 `#8A8696` (245, separators · headings · skipped), `magenta`→ember-plasma (198). Severity glyphs aligned to §6.5: `✗` error, `!` warning (`ℹ` kept for info — the findings list only renders problems, never passes, so the brand `✓` would mislead).

  Ember stays scarce by construction, as the brand mandates — it only colors error/fail states and the worst grade, never decoration. No structural/output-shape change; `NO_COLOR` / `FORCE_COLOR` / TTY logic and OSC-8 hyperlinks untouched, so `--json` / `--gha` / `--ci` and all snapshots are unaffected (render tests run `FORCE_COLOR=0`).

  Verified: dependency-free assertion that the emitted codes are exactly `38;5;{202,220,78,45,245,198}` with zero `38;2` (truecolor) sequences; `@pyreon/cli` render tests 14/14 pass; oxlint clean.

- Updated dependencies [[`c3df9db`](https://github.com/pyreon/pyreon/commit/c3df9dbbcf9e939c92e1c4843b59686cdd25589e), [`9a54705`](https://github.com/pyreon/pyreon/commit/9a54705c645ff2c3bee54fa8c6d411d1530b3187), [`bbccaaf`](https://github.com/pyreon/pyreon/commit/bbccaaf3ec2f5dc3eed3e7195a09023fc59575d1), [`abda63c`](https://github.com/pyreon/pyreon/commit/abda63c541343cfe967a5c70ce223a6675ceaa8e), [`24a063c`](https://github.com/pyreon/pyreon/commit/24a063ccfa2ef267927dfd68886be24c397ccd72), [`a086769`](https://github.com/pyreon/pyreon/commit/a0867699bdeca87f34e60fef7aa867a75a24d815), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/compiler@0.20.0
  - @pyreon/lint@0.20.0

## 0.19.0

### Minor Changes

- [#638](https://github.com/pyreon/pyreon/pull/638) [`dcd2136`](https://github.com/pyreon/pyreon/commit/dcd21360cca7528cbfe87020428394a11aa30ea0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(cli): doc-claims gate covers lint-rule / lint-category / detector-code counts

  Extends the `doc-claims` gate (consumed by `pyreon doctor` AND
  `scripts/check-doc-claims.ts`) from 2 to 5 source-of-truth counters,
  7 → 19 claim sites:

  - **lint rule count** — the `allRules` array in
    `packages/tools/lint/src/rules/index.ts`. Claim sites: CLAUDE.md (×3),
    the package README, `docs/docs/lint.md`, `lint/src/manifest.ts` (6×).
  - **lint category count** — distinct `category:` literals across the
    rule files. Claim sites: CLAUDE.md (×2), README, manifest.
  - **detector-code count** — the `PyreonDiagnosticCode` union in
    `packages/core/compiler/src/pyreon-intercept.ts`. Claim sites:
    `.claude/rules/anti-patterns.md`, CLAUDE.md.

  New `ClaimSpec.all` flag asserts EVERY occurrence of a pattern in a file
  agrees (not just the first) — `manifest.ts` carries the rule count 6×;
  bumping 5 of 6 would otherwise pass silently.

  **Counters TEXT-PARSE in-repo source via `repoRoot`, never
  `import { allRules }`.** A dynamic import resolves via bun's module
  cache to a STALE published snapshot (observed: 0.18.0 cache → 66 rules
  while the working tree had 76); asserting against that is worse than no
  gate. Same `repoRoot`-relative approach the existing hook/doc-page
  counters already use.

  Fixes the live drift this gate immediately surfaced on `main`:
  `lint/src/manifest.ts` (`62`/`67`/`13` → `76`/`76`/`17` across 3
  occurrences) and `.claude/rules/anti-patterns.md` ("flags 12" → 15).
  The `@pyreon/lint` manifest correction regenerates `llms-full.txt` +
  the MCP `api-reference.ts` region (`bun run gen-docs`).

  Bisect-verified: stubbing `countLintRules → 0` fails the real-repo
  shape + 2 new specs; restored → all 27 cli gate tests pass. Gate green
  (19/19); `gen-docs --check`, lint manifest-snapshot, oxlint, cli +
  lint typecheck all clean.

- [#635](https://github.com/pyreon/pyreon/pull/635) [`c8d6f27`](https://github.com/pyreon/pyreon/commit/c8d6f27b8d207b25a2f378eedc21af11adfe3653) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(cli): non-grade-gating `best-practices` advisory category for `pyreon doctor`

  Follow-up [#4](https://github.com/pyreon/pyreon/issues/4). Resolves the objectivity tension from the doctor-objective
  work ([#630](https://github.com/pyreon/pyreon/issues/630)): enabling the opt-in `@pyreon/lint` best-practice rules
  ([#632](https://github.com/pyreon/pyreon/issues/632)/[#634](https://github.com/pyreon/pyreon/issues/634) — `frontend`/`query`/`rx`/`i18n` + form/router opt-in) used
  to fold into `correctness`/`architecture`, tanking the objective health
  grade and failing `--ci` — punishing projects for adopting opinionated
  best practices (opinionated ≠ broken).

  New advisory `FindingCategory: 'best-practices'`. The lint gate routes
  every `meta.optIn` rule's findings here regardless of its lint category
  (`gates/lint.ts`). It is **scored + displayed** (own breakdown, labeled
  `advisory — excluded from grade & --ci` in the text renderer; never
  shown as "skipped") but **always `included: false`** so it never enters
  the overall mean/grade, and `doctor.ts` excludes advisory errors from
  the `--ci` exit code. `isAdvisoryCategory()` exported from `doctor/score`.

  Verified: `@pyreon/cli` 141 tests pass (+3 advisory specs: always-
  excluded-from-mean, scored-for-visibility, 10 advisory errors don't move
  the grade); typecheck clean; full-repo oxlint 0 errors. Self-run proof:
  doctor grade/score/errors **byte-identical** to baseline with the
  category added (zero regression), advisory row renders correctly.
  Doctor/CLI-only — runtime-inert (no e2e impact, same class as [#632](https://github.com/pyreon/pyreon/issues/632)/[#634](https://github.com/pyreon/pyreon/issues/634)).

  NOTE — deferred (honest scope): [#4](https://github.com/pyreon/pyreon/issues/4)'s "more frontend a11y rules" half is
  deliberately NOT in this PR. Adding lint rules off `main` while [#632](https://github.com/pyreon/pyreon/issues/632)'s
  rule-count manifest claims and [#634](https://github.com/pyreon/pyreon/issues/634)'s are still unmerged would create
  manifest/count-claim merge conflicts across the stack. Those a11y rules
  land cleanly in a follow-up once [#632](https://github.com/pyreon/pyreon/issues/632)/[#634](https://github.com/pyreon/pyreon/issues/634) merge (rebased onto the real
  76-rule baseline) — not faked into this PR.

- [#630](https://github.com/pyreon/pyreon/pull/630) [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: make `pyreon doctor` objective + close the real first-party findings it then surfaced

  `pyreon doctor` reported a meaningless **F (score 55, 987 errors)** because
  its `lint` / `react-patterns` / `pyreon-patterns` gates scanned the WHOLE
  repo: example apps (intentionally framework-idiomatic, incl. react-compat
  demos), `e2e/`/`docs/`/`scripts/`, detector test-fixtures (which
  _deliberately_ contain anti-patterns so the detectors can be tested), and
  the `*-compat` packages (whose public API IS React/Vue/etc. by design).
  ~705/987 errors were examples + fixtures; the rest a never-CI-enforced
  advisory backlog or by-design.

  **Objectivity (the deliverable):** the three gates now audit ONLY
  first-party published source — `packages/<cat>/<pkg>/src/**`, excluding
  tests/fixtures/`.d.ts` — via pure, unit-tested predicates
  (`isFirstPartySourceFile` / `isCompatPackageFile`); `react-patterns`
  additionally skips `*-compat` src (a React-API shim containing `useState`
  is a definitional false positive). Errors **987 → 86**.

  **Detector precision (false positives are the antithesis of objective):**

  - `@pyreon/compiler` `dot-value-signal`: now requires the receiver to be a
    tracked signal binding — no longer flags `input.value` / `cell.value` /
    `o.value` (17 FPs; bisect-verified).
  - `@pyreon/lint` `no-window-in-ssr`: recognizes field-captured typeof
    (`this.isSSR = typeof document === 'undefined'`) and function-head
    early-return guards covering nested closures (bisect-verified).
  - `@pyreon/lint` `no-bare-signal-in-jsx`: now supports `exemptPaths`
    (consistent with the other exemptable rules) — render-function
    primitives read signals in JSX _attribute_ positions which the compiler
    `_rp()`-wraps; the text-position heuristic over-fired there.

  **Genuine first-party SSR bugs fixed** (the rule correctly did NOT silence
  these — cross-function/method guards aren't lexically traceable):

  - `@pyreon/head` `createNewTag` — added `typeof document` guard.
  - `@pyreon/styler` `Sheet.mount()` — in-method `if (this.isSSR) return`.
  - `@pyreon/hotkeys` `detachListener` — `typeof window` guard.
  - `@pyreon/flow` flow-component — guarded `new ResizeObserver` with
    `typeof ResizeObserver === 'function'`.
  - `@pyreon/core` lifecycle — renamed a local `location` shadowing the
    browser global (hygiene; also removed an SSR-analysis false positive).

  **Curated `.pyreonlintrc.json`** exemptions (with rationale) for
  genuinely-non-SSR-runtime surfaces: `@pyreon/compiler` (build-time Node)
  and `*-compat` (DOM-runtime framework adapters, consistent with the
  existing `runtime-dom` exemption) for `no-window-in-ssr`; `*-compat` for
  `dev-guard-warnings` (intentional user-facing "[Pyreon] X not supported"
  guidance that must reach prod).

  **Result: errors 987 → 1.** The single remaining `no-window-in-ssr` in
  `@pyreon/ui-core` (`_isBrowser && matchMedia(...)`) is provably SSR-safe
  (short-circuit; `_isBrowser` is a `typeof`-AND const) — a documented
  known rule-precision limitation, left visible (NOT exempted: silencing it
  would hide future _real_ ui-core SSR bugs — anti-objective).

  Verified: 8 touched packages, 3091 unit tests pass; typecheck clean;
  full-repo `oxlint` 0 errors; e2e 127 specs pass (default 92 +
  ui-regression 26 + app-showcase 9); each detector change bisect-verified.

### Patch Changes

- Updated dependencies [[`bcc3cd5`](https://github.com/pyreon/pyreon/commit/bcc3cd50d3cc19b486a8169fbe941848edd793c7), [`82d78b4`](https://github.com/pyreon/pyreon/commit/82d78b4889344bad26175d4adf07c682d639dfa3), [`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9), [`5b69841`](https://github.com/pyreon/pyreon/commit/5b69841a6ab30963977e276d120c33d66682da23), [`e274fce`](https://github.com/pyreon/pyreon/commit/e274fceeb37d0893c7425463e443185388fce475), [`dcd2136`](https://github.com/pyreon/pyreon/commit/dcd21360cca7528cbfe87020428394a11aa30ea0), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`6472de0`](https://github.com/pyreon/pyreon/commit/6472de00ffdbcff1fd453c125c404b75fc5cc46d), [`0408e47`](https://github.com/pyreon/pyreon/commit/0408e475e63770996eff17bfb6ac318e89c45df4), [`8f1aad3`](https://github.com/pyreon/pyreon/commit/8f1aad3cc44d86f9248cfd4b7def10c914748bb0), [`7e0fe1a`](https://github.com/pyreon/pyreon/commit/7e0fe1a4f7cbb68f7647d85bef843de90d04d506), [`9de49da`](https://github.com/pyreon/pyreon/commit/9de49dab97c91c8707decd10ce89085d8d6942e0), [`c5b2ea2`](https://github.com/pyreon/pyreon/commit/c5b2ea2fe0df3f52b2af21e0d79b1e391ca9fad5), [`6581f07`](https://github.com/pyreon/pyreon/commit/6581f073293a72360fe9391990d08316e0dc5b4b), [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3)]:
  - @pyreon/lint@0.19.0
  - @pyreon/compiler@0.19.0

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
