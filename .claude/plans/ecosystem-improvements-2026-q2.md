# Pyreon Ecosystem Improvement Plan — 2026 Q2

**Status**: Draft, awaiting user input on tier sequencing
**Last updated**: 2026-04-10
**Triggered by**: Self-critique of the F3/F1/D-series catalog work (PRs #193–#200), surfacing recurring failure patterns

---

## Executive summary

The recent catalog work (PRs #193–#200) shipped real fixes but exposed five recurring failure modes that no individual PR could fix on its own. They are systemic — patches will keep appearing as long as the underlying gaps remain. This plan groups them into 5 priority tiers and defines concrete deliverables, success criteria, and sequencing.

**The six failure modes** (see "Findings" below for the audit):

1. **Test environments silently diverge from production.** Tests run in vitest/Node where `process` exists; production runs in browsers where it doesn't. Same shape: tests prove the LOGIC is correct given the test setup, but the test setup doesn't match the production environment. Caught twice in one week (PR #197 mock-vnode bug, PR #200 dev-warning bug).
2. **The 9-doc-surface manual sync is unsustainable.** Every substantive PR touches CLAUDE.md (634 lines), llms.txt (384), llms-full.txt (1321), MCP api-reference (1302), 59 VitePress docs, 60 READMEs, JSDoc, source code, source comments. They drift constantly.
3. **Mock-vnode test patterns hide real bugs.** 18 test files construct vnode literals instead of going through `h(RealComponent)`. The connector-document silent metadata drop went undetected since the package existed because no test used a real rocketstyle primitive.
4. **The catalog is symptom-driven, not cause-driven.** "F3: doc note" turned into 3 PRs because the right deliverable was "make the silent footgun impossible to hit." Each catalog item papers over a deeper issue without naming it.
5. **Workflow ergonomics break in worktrees.** `app-showcase` build fails in git worktrees with `Failed to resolve entry for package "@pyreon/vite-plugin"`. Real Vite builds can't be used for empirical verification of changes — I had to fall back to esbuild probes for PR #200.
6. **MCP server reflects 2026-Q1 knowledge of Pyreon.** The AI integration surface (`@pyreon/mcp`) has a 1302-line hand-maintained `api-reference.ts`, only validates against React anti-patterns (none of the recently-discovered Pyreon footguns), and has no awareness of the patterns directory, anti-patterns rules, or recent PRs. Every AI session using Pyreon today gets stale knowledge — and that cost is paid every interaction. Tier 2.5 is dedicated to fixing this.

---

## Findings (audit data, not opinion)

| Metric | Value | Source |
|---|---|---|
| Packages in monorepo | 60 | `find packages -name package.json -not -path '*/node_modules/*'` |
| Test files | 340 | `find packages -name '*.test.*'` |
| Browser-runtime tests (Playwright/etc.) | **0** | `find packages -name 'playwright*'` |
| `@pyreon/lint` rules | 57 | `find packages/tools/lint/src/rules -name '*.ts' -not -name 'index.ts'` |
| Files using broken `typeof process` dev gate | **16** total, **12** in browser-running packages | `grep -r "typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'" packages/` |
| Files using correct `import.meta.env.DEV` dev gate | **1** (`flow/src/layout.ts`, post PR #200) | `grep -r 'import\.meta\.env\??\.DEV' packages/` |
| Mock-vnode test files (constructing `{ type, props, children }` literals) | 18 | `grep -l 'vnode\(\|\{ type:' packages/**/__tests__/**/*.ts` |
| Doc surfaces requiring manual sync per substantive PR | 9 | CLAUDE.md, llms.txt, llms-full.txt, MCP api-reference, docs/, README, JSDoc, source code, source comments |
| Total lines under manual sync | 3641 (CLAUDE.md + llms*.txt + MCP api-reference) | `wc -l` |
| VitePress doc pages | 59 | `find docs -name '*.md'` |
| Package READMEs | 60 | `find packages -name README.md -not -path '*/node_modules/*'` |
| Worktree app-showcase build | **broken** (resolves to `node_modules/@pyreon/vite-plugin` instead of workspace `src/`) | manual reproduction |
| Same build in main repo | works (434ms) | manual reproduction |

**Concrete bug exposure**: 12 files in browser-running packages have a dev warning that **silently does not fire in production browsers**. The unit tests for those warnings all pass because vitest has `process` defined. Users get nothing.

---

## Tier 0 — Critical bugs shipping in production

> **Definition**: bugs that exist in `main` right now, affect real users, and have been verified to reproduce.

### T0.1 — Codebase-wide `typeof process` dev-gate cleanup

**Status**: 12 files identified, 1 fixed (flow/src/layout.ts), 11 remaining.

**Files to fix** (browser-running packages only — server-side packages can keep `typeof process` because they always run in Node):

- `packages/core/runtime-dom/src/transition.ts`
- `packages/core/runtime-dom/src/props.ts`
- `packages/core/runtime-dom/src/nodes.ts`
- `packages/core/runtime-dom/src/mount.ts`
- `packages/core/runtime-dom/src/index.ts`
- `packages/core/runtime-dom/src/hydration-debug.ts`
- `packages/core/router/src/router.ts`
- `packages/core/core/src/suspense.ts`
- `packages/core/core/src/lifecycle.ts`
- `packages/core/core/src/error-boundary.ts`
- `packages/core/core/src/dynamic.ts`
- `packages/core/core/src/context.ts`

**Out of scope (server-side, the pattern is correct there)**:

- `packages/zero/zero/src/logger.ts`
- `packages/core/server/src/handler.ts`
- `packages/core/runtime-server/src/index.ts`

**Reference implementation**: `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions` (post PR #200). Uses `if (!import.meta.env?.DEV) return`.

**Approach**: one PR per package category (runtime-dom, core, router) — 3 PRs total. Each PR includes:

1. Mechanical replacement of the gate
2. Bisect-verified regression test (revert pattern, watch test fail with the right message, restore, watch test pass)
3. Empirical esbuild bundle inspection assertion (warning text absent in prod, present in dev)

**Success criterion**: `grep -r "typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'" packages/core packages/fundamentals` returns 0 results. `grep -r "import.meta.env" packages/core packages/fundamentals` returns ≥12 results.

---

### T0.2 — Compiler stack overflow on cross-referencing const accessors

**Status**: discovered while building examples, no investigation has happened yet, no reproduction script exists.

**Symptoms**: when a JSX template has multiple `const` declarations that reference each other and are derived from `props.*`, the compiler's reactive-prop inlining pass enters an infinite recursion (the `const a = props.x; const b = a + 1; const c = b * 2; return <div>{c}</div>` pattern).

**Approach**:

1. **Reproduction first**: write a minimal failing test in `@pyreon/compiler/src/tests/`. Without a repro the fix is guessing.
2. Identify which transitive-resolution function is recursing without a base case.
3. Add a depth-limit + visited-set guard to break the cycle.
4. Regression test: the original repro + 3-4 variants (chains of length 1, 2, 5, 10).

**Success criterion**: The repro test exists and passes. The compiler does not crash on any chain length. CLAUDE.md compiler section gains a note about transitive-resolution depth limits.

**Open question**: should the compiler emit a warning when a chain exceeds N depth (potential perf issue) or silently support arbitrary depth?

---

### T0.3 — Worktree build resolution

**Status**: confirmed broken in `/tmp/pyreon-plan` worktree; works in `/Users/vitbokisch/dev/pyreon/pyreon` main repo.

**Error**: `Failed to resolve entry for package "@pyreon/vite-plugin". The package may have incorrect main/module/exports specified in its package.json.`

**Root cause hypothesis**: Vite's config bundling step (which runs vite.config.ts itself through esbuild) doesn't honor the `bun` condition from `tsconfig.json`'s `customConditions` because that's a TypeScript-only setting. In the main repo it works because something else (likely a stale `node_modules/.bun/` cache) provides the right resolution.

**Approach**:

1. Confirm the root cause by inspecting `node_modules/@pyreon/vite-plugin/package.json` in both worktrees and looking for the difference.
2. Add a top-level `import` condition to `@pyreon/vite-plugin/package.json` that points to the same file as the `bun` condition (likely `./src/index.ts` if Vite can transform it, or a built `./lib/index.js` if not).
3. Verify the fix by running `bun run build` in a fresh worktree.

**Success criterion**: `bun run build` succeeds in `examples/app-showcase` from a fresh git worktree.

**Why this matters**: blocks empirical verification of changes against real Vite production builds. Forced PR #200 to use esbuild probes instead of building the actual showcase. Every future change that needs "does this actually work in a real build" verification hits this wall.

---

## Tier 1 — Test environment parity

> **Definition**: changes that prevent future bugs of the same shape as the ones found in PRs #197 and #200.

### T1.1 — Browser-runtime test layer (Playwright)

**Status**: 0 browser tests exist today. 340 unit tests run in vitest/happy-dom.

**Problem**: vitest is Node-based. happy-dom is a partial DOM polyfill running in Node. Neither catches:

- `typeof process` dead code in real browser bundles (PR #200 bug)
- Vite-specific `import.meta.env` behavior
- Real `IntersectionObserver`, `ResizeObserver`, `requestAnimationFrame` timing
- Touch/pointer event sequencing
- Real CSS rendering (computed styles, scroll behavior, layout)

**Approach**:

1. Add `@pyreon/browser-tests` as a new package under `packages/internals/`. Private, not published.
2. Set up Playwright with Chromium + Firefox + WebKit.
3. Each runtime-affecting package gets a smoke suite: import the public API, mount a minimal example, exercise 1-2 key flows, assert observable behavior.
4. CI runs browser tests on PR + main. Slow tests (1-3 min each) but catch real bugs.

**Initial smoke targets** (highest-leverage):

- `@pyreon/runtime-dom` — mount a component, update a signal, verify DOM patches
- `@pyreon/router` — navigate, verify `history.pushState`, verify View Transitions trigger
- `@pyreon/head` — set title/meta, verify `document.head` updates
- `@pyreon/flow` — render a 5-node graph, click a node, verify selection
- `@pyreon/document-primitives` — render the resume template, verify layout
- `@pyreon/code` — mount a CodeMirror editor, type, verify signal updates
- `@pyreon/charts` — render an ECharts chart, verify canvas dimensions

**Success criterion**: 7 browser smoke suites passing in CI. Each ≤30s. Total ≤5min added to CI time.

**Open question**: vitest 4 has experimental browser mode (`@vitest/browser`). Worth evaluating before committing to Playwright. Tradeoff: vitest browser mode is in-process and faster but newer; Playwright is mature but a separate test runner. Recommendation: prototype both in `runtime-dom` and pick whichever ergonomics are better.

---

### T1.2 — Mock-vnode test audit + parallel real-h() tests

**Status**: 18 test files identified. None have parallel "real `h()` through" tests.

**Problem**: a test that constructs `{ type: 'div', props: {}, children: [] }` directly is not testing the contract — it's testing the test fixture. The connector-document bug (PR #197) was hidden for as long as the package existed because no test ran a real rocketstyle primitive through `extractDocumentTree`. Vitest passed; production broke.

**Files to audit** (categorized by package):

- `ui-system/elements/src/__tests__/` — 7 files (Element, Text, List, Portal, Overlay, Iterator, useOverlay, responsiveProps, equalBeforeAfter)
- `ui-system/coolgrid/src/__tests__/` — 4 files (Container, Row, Col, contextCascading)
- `ui-system/styler/src/__tests__/styled.test.ts`
- `ui-system/rocketstyle/src/__tests__/context.test.ts`
- `ui-system/unistyle/src/__tests__/context.test.ts`
- `ui-system/connector-document/src/__tests__/extractDocumentTree.test.ts` (partial fix in PR #197 — a real-primitive test was added but the existing mock tests remain)
- `ui-system/document-primitives/src/__tests__/useDocumentExport.test.ts` (same — partial fix)

**Approach**:

For each file:

1. Identify which tests are "fixture tests" (testing the mock structure works) vs "contract tests" (testing the public API behavior).
2. For each contract test using a mock vnode, add a sibling test that uses `h(RealComponent, ...)` and asserts the same property.
3. If the real-h() test fails when the mock test passes, that's a real bug — fix it before adding the test.
4. If both pass, keep both — the mock is the fast path, the real-h() is the safety net.

**Success criterion**: every public-API contract assertion has at least one test that goes through `h()` with a real component, not a mock vnode. Fixture tests are clearly labeled `// fixture test:` so future devs understand the difference.

**Estimated bug yield**: based on PR #197 (one bug found in one file from this audit), I'd guess 2-5 more silent bugs hiding in the other 17 files.

---

### T1.3 — `@pyreon/lint` rule for `typeof process` dev-gate anti-pattern

**Status**: `@pyreon/lint` has 57 rules. None catch this pattern.

**New rule ID**: 58 (next sequential)
**Category**: `architecture` (existing category, 5 rules currently)
**Severity**: `error` in `strict` preset, `warn` in `recommended`
**Rule name**: `no-process-dev-gate`

**What it catches**: any expression matching `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` (or similar variants) used as a dev-mode gate. Exception: files in server-only packages (`zero`, `runtime-server`, `server`, `vite-plugin`).

**Auto-fix**: replace with `import.meta.env?.DEV`. Add `@ts-ignore` if `ImportMeta` doesn't have `env.DEV` in scope.

**Why a lint rule and not just docs**: docs decay. The 12 files we have today were written by devs who never read CLAUDE.md's anti-patterns section. A lint rule fires automatically on `bun run lint` and on every file save in editor.

**Success criterion**: rule exists, has tests, is in `recommended` preset, fires on the 12 broken files (before T0.1 fixes them), does not fire on the 1 correct file (`flow/src/layout.ts`).

---

## Tier 2 — Doc generation pipeline

> **Definition**: replace 9 manual sync surfaces with 1-2 generated outputs from a single source of truth.

### T2.1 — Single-source manifest for cross-package docs

**Status**: 3641 lines of doc surfaces (CLAUDE.md + llms.txt + llms-full.txt + MCP api-reference) maintained by hand. Drift is constant. The F3 round 1 PR missed updates to 7 of 9 surfaces.

**Approach**: introduce a `packages/*/manifest.ts` per package that exports a structured object:

```ts
// packages/fundamentals/flow/manifest.ts
import type { PackageManifest } from '@pyreon/manifest'

export const manifest: PackageManifest = {
  name: '@pyreon/flow',
  description: 'Reactive flow diagrams for Pyreon',
  features: [
    'createFlow<TData> generic over node data shape',
    'NodeComponentProps reactive accessors',
    'Auto-layout via lazy-loaded elkjs',
    // ...
  ],
  api: [
    {
      name: 'createFlow',
      signature: '<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>',
      example: `const flow = createFlow<MyData>({ nodes: [...], edges: [...] })`,
    },
    // ...
  ],
  mistakes: [
    'Setting LayoutOptions.direction on force/stress/radial — silently ignored',
    // ...
  ],
}
```

A build script (`scripts/gen-docs.ts`) reads all manifests and generates:

- `llms.txt` — one-line per package (from `name` + `description` + key `features`)
- `llms-full.txt` — full per-package section (everything)
- `packages/tools/mcp/src/api-reference.ts` — structured array output (from `api` + `mistakes` + `example`)
- `CLAUDE.md` package list — auto-updated section delimited by `<!-- BEGIN PACKAGES -->` / `<!-- END PACKAGES -->`

CI check: regenerate the files and `git diff --exit-code` to fail if anyone hand-edits them.

**Success criterion**: manifest files exist for ≥10 packages. Generation script produces output identical to current llms.txt for those packages. CI check enforces sync. Doc surfaces drop from 9 to 4 (manifest, README, docs/, source — the rest are generated).

**Open question**: which 10 packages to start with? Recommendation: the fundamentals tier (flow, document, code, charts, form, query, store, table, virtual, i18n) — they're the most user-facing and the most-touched in recent PRs.

---

### T2.2 — VitePress page consistency check

**Status**: 59 VitePress pages exist. Some are out of date — the F3 round 1 missed `docs/docs/flow.md`'s stale `spacing` field name (the actual API field is `nodeSpacing`).

**Approach**: lower-effort version of T2.1. A check script that:

1. Reads each `docs/docs/<package>.md`
2. Extracts code examples (\`\`\`tsx blocks)
3. Type-checks them against the actual package types (using `tsc --noEmit` with a generated harness file)
4. Reports any examples that fail typecheck

**Success criterion**: every code example in `docs/docs/` typechecks against the current package types. CI runs the check.

---

## Tier 2.5 — MCP server overhaul

> **Definition**: dedicated tier for `@pyreon/mcp` because it's the AI integration surface and the audit revealed gaps that aren't covered by T2.1's manifest pipeline.

### Audit findings

**Current state** (`packages/tools/mcp/src/`):

- 6 tools: `get_api`, `validate`, `migrate_react`, `diagnose`, `get_routes`, `get_components`
- 1302 lines of hand-maintained `api-reference.ts` (a `Record<string, ApiEntry>`)
- `validate` only catches **React anti-patterns** via `detectReactPatterns` — does not check for any of the recently-discovered Pyreon footguns (`typeof process` dev gates, mock-vnode tests, missing `import.meta.env.DEV`, rocketstyle layout-in-theme mistakes, accessor-prop misuse, etc.)
- `diagnose` parses Pyreon error messages but the catalog is small and grows by hand
- `get_routes` / `get_components` use a project scanner that's only 10 lines (`packages/tools/mcp/src/project-scanner.ts`) — barely scratches the surface
- No tool for "what's the right pattern for X?" — only "look up symbol Y"
- No tool that exposes the anti-patterns catalog (`.claude/rules/anti-patterns.md`)
- No tool that exposes the patterns directory (T3.2)
- No tool for "is this dev warning gate correctly written?"
- No streaming tool output — everything is blocking
- No telemetry on which tools are actually used (so we don't know what to invest in)

**The core gap**: MCP is essentially "API reference + React migration." It doesn't reflect any of the Pyreon-specific lessons learned from PRs #197/#200 or from the anti-patterns rules file. AI agents using MCP today get 2026-Q1 knowledge of Pyreon, not 2026-Q2 knowledge.

---

### T2.5.1 — Generate `api-reference.ts` from manifests (replaces T2.2)

**Status**: 1302 lines hand-maintained. Drift from JSDoc and CLAUDE.md is constant.

**Approach**: dependent on T2.1. The `api` field in each package's `manifest.ts` becomes the canonical source. The MCP entry is generated:

```ts
// Generated by scripts/gen-mcp.ts from packages/*/manifest.ts
export const API_REFERENCE: Record<string, ApiEntry> = {
  'flow/createFlow': {
    signature: '<TData>(config: FlowConfig<TData>) => FlowInstance<TData>',
    example: '...',
    notes: '...',
    mistakes: '...',
  },
  // ...
}
```

**Success criterion**: `api-reference.ts` has a `// GENERATED — do not edit` header. CI check fails on hand-edits. The generation script reads ≥10 manifests.

---

### T2.5.2 — `validate` tool catches Pyreon-specific anti-patterns (not just React)

**Status**: `validate` only runs `detectReactPatterns(code)`. Misses every Pyreon-specific footgun.

**New checks to add**:

1. **`typeof process` dev gate** — fires on `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` outside server-only files. References T0.1.
2. **Mock vnode in tests** — fires on `{ type: 'div', props: ... }` literals in `*.test.ts`/`*.test.tsx` files when the test imports a real component from the package being tested. References T1.2.
3. **Rocketstyle layout-in-theme** — fires on `direction`, `alignX`, `alignY`, `gap`, `block`, `tag` inside a `.theme()` callback. They belong in `.attrs()`. References `.claude/rules/code-style.md`.
4. **Empty `.theme({})`** — fires on no-op `.theme({})` chain calls.
5. **`as unknown as VNodeChild`** — fires on this unnecessary cast.
6. **Accessor read outside reactive scope** — fires on `props.data().kind` (or any `(...)()` accessor call) outside JSX expression thunks, `effect()`, or `computed()`.
7. **`signal(newValue)` to write** — fires on `signal(value)` where `signal` was previously declared as `const signal = signal(...)`. Should be `signal.set(value)`.
8. **Destructuring props** — fires on `const { x } = props` patterns that lose reactivity. Suggests `splitProps(props, ['x'])` or direct `props.x` access.
9. **Static return null in conditional rendering** — fires on `if (!cond()) return null` outside a reactive accessor wrapper. Components run once.
10. **`element.theme.borderTopWidth`** — fires on CSS-spec property naming. Should be `borderWidthTop` (unistyle convention).

**Implementation**: each check is a function that takes the parsed AST (oxc-parser, already used by `@pyreon/lint`) and returns diagnostics. Reuse the existing `detectReactPatterns` infrastructure. Each check has unit tests that fire on a positive example and don't fire on a negative example.

**Approach**: factor the checks into a shared `@pyreon/diagnostics` package (or `@pyreon/compiler/diagnostics`) so both `@pyreon/lint` and `@pyreon/mcp` use the same engine. Avoids drift between "lint catches X" and "MCP catches X."

**Success criterion**: `validate` tool fires on each of the 10 anti-patterns when given a positive example, and is silent on a negative example. The diagnostics catalog is shared between `@pyreon/lint` and `@pyreon/mcp` (one source of truth for what's an anti-pattern).

---

### T2.5.3 — New tool: `get_pattern`

**Status**: doesn't exist. Currently AI agents have to read CLAUDE.md prose to find patterns.

**Spec**:

```ts
server.tool(
  'get_pattern',
  {
    name: z.string().describe('Pattern name (e.g., "dev-warnings", "controllable-state")'),
  },
  async ({ name }) => {
    // Returns the pattern file from docs/patterns/<name>.md
    // (created by T3.2)
  },
)
```

**What it returns**: the contents of `docs/patterns/<name>.md` plus a list of related patterns.

**Why**: AI agents writing new code need "what's the right way to write a dev-mode warning in this codebase?" — not "what's the signature of `effect()`?". Patterns answer that question; api-reference doesn't.

**Success criterion**: `get_pattern('dev-warnings')` returns the contents of `docs/patterns/dev-warnings.md`. Listed as the canonical entry point for "how do I do X" questions in the MCP server's tool description.

---

### T2.5.4 — New tool: `get_anti_patterns`

**Status**: doesn't exist. The 50+ anti-patterns in `.claude/rules/anti-patterns.md` are invisible to AI agents.

**Spec**:

```ts
server.tool(
  'get_anti_patterns',
  {
    category: z
      .enum([
        'reactivity',
        'jsx',
        'context',
        'architecture',
        'testing',
        'documentation',
        'all',
      ])
      .optional(),
  },
  async ({ category = 'all' }) => {
    // Parses .claude/rules/anti-patterns.md and returns matching entries.
  },
)
```

**Why**: anti-patterns prevent bugs. AI agents writing new code should see them BEFORE writing the buggy version, not after a code review.

**Success criterion**: `get_anti_patterns('reactivity')` returns the 9 reactivity anti-patterns. `get_anti_patterns()` returns all 50+. Each entry has a description and (where applicable) a fix example.

---

### T2.5.5 — `diagnose` tool: error catalog from real bugs

**Status**: `diagnose` calls `diagnoseError(error)` which has a small hand-curated catalog of error patterns.

**Approach**: every PR that fixes a bug must add an entry to the error catalog with:

- The error message regex
- The cause (1-2 sentences)
- The fix (code snippet if applicable)
- A link to the PR that fixed it (so the trail is traceable)

This is enforced by a CI check on PRs that touch source files: if the PR description has "Fixes:" or includes a `console.error` change, the check requires a corresponding catalog entry.

**Success criterion**: error catalog grows from N today to N+12 after the Tier 0 PRs land (each Tier 0 fix contributes its catalog entry). CI check exists.

---

### T2.5.6 — New tool: `validate_dev_gate`

**Status**: doesn't exist. Specific to the bug PR #200 fixed.

**Spec**:

```ts
server.tool(
  'validate_dev_gate',
  {
    code: z.string().describe('Code containing a dev-mode warning gate'),
  },
  async ({ code }) => {
    // 1. Find any `typeof process` checks
    // 2. Find any `import.meta.env.DEV` checks
    // 3. Run the code through esbuild with both 'dev' and 'prod' defines
    // 4. Inspect the output bundles
    // 5. Return: "this gate fires in dev / does not fire in prod"
    //    OR "this gate is dead in browser dev mode (uses typeof process)"
  },
)
```

**Why**: this is the specific footgun PR #200 fixed. A tool that catches it interactively prevents the regression at write time, not at code review time.

**Implementation**: bundles the snippet via esbuild with the same defines Vite uses. Same approach as PR #200's regression test. Reusable for future "is this gate correct" questions.

**Success criterion**: tool exists. Given a `typeof process` gate, it reports "dead in browser." Given an `import.meta.env.DEV` gate, it reports "fires in dev, tree-shaken in prod."

**Open question**: is this too specific? Alternative: fold it into `validate` as one of the 10 checks from T2.5.2. Recommendation: keep it as a separate tool because it's interactive (user gives a snippet, gets back a structured report) vs the catch-all `validate` (which just lints).

---

### T2.5.7 — New tool: `audit_test_environment`

**Status**: doesn't exist. Catches the PR #197 mock-vnode bug class.

**Spec**:

```ts
server.tool(
  'audit_test_environment',
  {
    package: z.string().describe('Package name (e.g., "flow")'),
  },
  async ({ package: pkg }) => {
    // 1. Scan the package's tests for mock-vnode patterns
    // 2. Check whether each contract test has a parallel real-h() test
    // 3. Report files that only have mock tests
  },
)
```

**Why**: makes the T1.2 audit interactive. AI agents working on a package can call this tool and see the mock-vnode coverage gap before adding new mock tests.

**Success criterion**: `audit_test_environment('flow')` reports the current state of flow's tests (mock vs real-h() coverage). Listed in the MCP tool description as the entry point for "how trustworthy are this package's tests?"

---

### T2.5.8 — New tool: `get_changelog`

**Status**: doesn't exist. AI agents have no way to know what changed recently.

**Spec**:

```ts
server.tool(
  'get_changelog',
  {
    package: z.string().optional(),
    since: z.string().optional().describe('Date or version (e.g., "2026-04-01" or "v0.12.0")'),
  },
  async ({ package: pkg, since }) => {
    // Reads CHANGELOG.md or git log for the package
    // Returns recent entries
  },
)
```

**Why**: when an AI agent is asked "use the latest pattern for X" and X has changed recently, it should know about the change. Currently the MCP server returns whatever was in `api-reference.ts` at the last manual update — could be months stale.

**Success criterion**: tool exists. `get_changelog('flow', since='2026-04-01')` returns PRs #195 (createFlow generic), #198, #199, #200 (LayoutOptions applicability + dev gate fix).

---

### T2.5.9 — Tool description manifest

**Status**: each tool has an inline description in `index.ts`. Hard to discover. AI agents have no top-level "what tools are available and which to use when" guide.

**Approach**: add a `mcp_overview` tool that returns a structured catalog:

```
## When to use which tool

| Need | Tool |
|---|---|
| Look up an API signature | `get_api` |
| "How do I do X?" | `get_pattern` |
| "What should I avoid?" | `get_anti_patterns` |
| "Is this code right?" | `validate` |
| "Is this dev gate correct?" | `validate_dev_gate` |
| Migrate React code | `migrate_react` |
| Parse an error message | `diagnose` |
| What changed recently? | `get_changelog` |
| List routes in this project | `get_routes` |
| List components in this project | `get_components` |
| Audit test trust | `audit_test_environment` |
```

Plus a "first time using Pyreon MCP? Start here" pointer that lists the 3-5 most useful tools.

**Success criterion**: `mcp_overview` tool exists. New AI agents calling it get a clear map of what's available.

---

### T2.5.10 — Telemetry (optional, opt-in)

**Status**: no usage data. We don't know which tools are useful and which are dead.

**Approach**: opt-in usage logging. The MCP server can log tool invocations to a local file (`.pyreon/mcp-usage.log`) with:

- Timestamp
- Tool name
- Arguments (sanitized — no code snippets, only param names)
- Result size

A new `pyreon mcp-stats` CLI command reads the log and reports:

- Tools used most frequently
- Tools never used
- Average tool latency

This informs T2.5.11+ — what to invest in next.

**Open question**: privacy. Even sanitized logs could leak project structure. Make it explicit opt-in via env var (`PYREON_MCP_TELEMETRY=1`) and document what's logged.

**Success criterion**: opt-in telemetry exists. After 1 week of dogfooding, we have usage data to inform the next round of tool design.

---

### T2.5.11 — MCP integration tests

**Status**: `packages/tools/mcp/src/tests/` exists but only tests the API reference shape, not real tool invocations.

**Approach**: add an integration test suite that:

1. Spawns the MCP server in a child process
2. Sends real MCP protocol messages over stdio
3. Asserts the responses match expected shapes

For each tool: 1-2 happy-path tests + 1 error-path test.

**Why**: the MCP server is the AI integration surface. If it breaks, every Pyreon-using AI agent breaks. Currently we have no end-to-end test that the server actually starts and responds.

**Success criterion**: MCP integration test suite has ≥20 tests covering all tools. CI runs them.

---

### T2.5.12 — Documentation: MCP usage guide

**Status**: README mentions the tools exist. No "how to use them effectively" guide.

**Approach**: new `docs/docs/mcp.md` page covering:

- How to install MCP in Claude Code, Cursor, Continue, etc.
- The 5 most useful tools and example queries
- Power-user tips (chaining tools, using `validate` in PR review, etc.)
- Troubleshooting (server not starting, tool not found, etc.)

**Success criterion**: `docs/docs/mcp.md` exists. Linked from main README.

---

## Tier 3 — Architectural improvements

> **Definition**: design changes that simplify or improve underlying architecture, removing workarounds.

### T3.1 — Rocketstyle `.statics()` hoisting from `.attrs()` callbacks

**Status**: PR #197 deferred this. The current `extractDocumentTree` workaround (Path B) invokes the component to read post-attrs `_documentProps`. Works because `.attrs()` is "supposed to be" pure — but that's an unenforced contract.

**The architectural fix**: teach `.statics({ key })` to support a `from: 'attrs'` mode that hoists the value from the `.attrs()` callback's return:

```ts
DocDocument
  .attrs<{ title?: string }>((props) => ({
    tag: 'div',
    _documentProps: { title: props.title },
  }))
  .statics({
    _documentType: 'document',
    _documentProps: { from: 'attrs' }, // ← new
  })
```

After this change, `extractDocumentTree` reads `_documentProps` directly off the component function (the "fast path" that's currently only used by mock-vnode test fixtures) without ever invoking the component. This eliminates:

- The Path B workaround
- The idempotence assumption (the component never has to be called twice)
- The performance cost (per-extract component invocation)

**Implementation**: extend `packages/ui-system/rocketstyle/src/utils/statics.ts:createStaticsEnhancers` to support the `from: 'attrs'` mode. The hoisting happens at component-creation time by running the `.attrs()` callback once with a special "static-hoist" props object that records which fields are accessed.

**Risk**: if the `.attrs()` callback reads `props.x` to compute `_documentProps`, the static hoist needs to handle that case (record the dependency, re-evaluate at extraction time). May need a closure-based design rather than a simple object.

**Success criterion**: the Path B branch in `extractDocumentTree` is deleted. All existing tests pass. A new test verifies that `extractDocumentTree` does not invoke the component function (using a spy that asserts call count is 0).

---

### T3.2 — Reference patterns directory (`docs/patterns/`)

**Status**: cross-cutting patterns are currently buried in PR descriptions and CLAUDE.md prose. Hard to discover.

**Approach**: create `docs/patterns/` with one file per pattern. Each file follows a template:

```md
# Pattern: <name>

**Reference implementation**: <file path>
**Used in**: <list of packages>
**Why this pattern**: <one paragraph>

## The pattern

<code example>

## Anti-patterns

<what NOT to do, with explanations>

## Tests

<how to test this pattern works>
```

**Initial patterns to document**:

1. **dev-mode warnings** — `import.meta.env.DEV` gate, bisect-verified regression test, esbuild bundle inspection. Reference: `flow/src/layout.ts`.
2. **controllable state** — `useControllableState({ value, defaultValue, onChange })`. Reference: `ui-primitives` packages.
3. **accessor reactive props** — `() => T` vs `T`, when to use which. Reference: `flow/NodeComponentProps`.
4. **template accessor pattern** — accept `Signal<T> | T` union, read inside body via per-text-node thunks. Reference: `document-primitives/ResumeTemplate`.
5. **rocketstyle layout in attrs, CSS in theme** — the bases convention. Reference: `ui-components/Card`.
6. **mock vnode vs real h() tests** — when to use each. Reference: T1.2 audit results.
7. **bisect-verified regression tests** — the revert→fail→restore→pass cycle. Reference: PR #200.
8. **doc surface checklist** — what to update on every PR (until T2 generates them).

**Success criterion**: `docs/patterns/` exists with 8 pattern files. CLAUDE.md links to it. Each pattern file has a reference implementation, anti-patterns, and a test approach.

---

### T3.3 — Catalog meta-pattern: symptoms vs causes

**Status**: the current catalog is symptom-driven. "F3: doc note" → "fix the dev gate" → "fix it again because it doesn't fire in browser". Each catalog item should be linked to an underlying gap, and the underlying gap should get its own item.

**Approach**: introduce two tiers in the catalog:

- **Strategic items**: address an underlying gap. Each strategic item links to ≥1 symptom item that justifies it.
- **Symptom items**: tactical fixes for visible bugs. Each symptom item links to its parent strategic item (if any).

When picking up a symptom item, the workflow is:

1. Read the symptom item.
2. Ask: what's the underlying gap? Is there a parent strategic item?
3. If yes, decide whether to fix the symptom alone (small) or the cause (bigger but eliminates the whole symptom class).
4. If no, create the strategic item for future consideration.

**Document this in `.claude/rules/workflow.md`** as part of the "Before writing code" section.

---

## Tier 4 — Strategic direction (needs user input)

> **Definition**: high-level questions about where Pyreon is going. I can't answer these alone — they need user input on priorities, target audience, competitive positioning.

### T4.1 — Competitive positioning

**Open questions for the user**:

1. Where does Pyreon need to win against Solid/Vue/React in 2026?
2. Is the target audience "React refugees who want signals" or "greenfield projects starting fresh"?
3. Are the benchmarks (krausest js-framework-benchmark) the right measure, or should we be benchmarking something else (TTI, INP, bundle size, dev-server cold start)?
4. What's the realistic adoption path? OSS-only, or commercial backing?

### T4.2 — User wall analysis

**Open questions for the user**:

1. What costs users hours when building real apps?
2. What's missing from the docs?
3. What error messages are unhelpful?
4. What patterns are surprising and need a docs page (or a new abstraction)?

These need to be answered by either user research or by you spending ≥1 day building a non-trivial app from scratch and noting every wall.

---

## Process changes

These don't fix specific bugs but change how we work to prevent future issues.

### P1 — Bisect-verify regression tests (new rule)

**Where**: add to `.claude/rules/workflow.md` under "Validation Checklist".

**The rule**: every regression test added in a PR must be bisect-verified before merge:

1. Save the fix
2. Revert the fix (temporary)
3. Run the test — assert it fails with the right error message
4. Restore the fix
5. Run the test — assert it passes

If step 3 doesn't fail, the test passes for the wrong reason and provides false confidence.

**Why**: PR #200 had a regression test that passed even with the broken pattern, because esbuild's minifier folds the dead code regardless of `typeof process`. The bisect verification caught it. Without bisect verification, the test would have shipped with no actual coverage.

### P2 — Test-environment-parity rule (new rule file)

**Where**: new file `.claude/rules/test-environment-parity.md`.

**The rule**: tests must run in the same environment as production. Categorized as:

- **Browser packages** (`runtime-dom`, `router`, `head`, `flow`, `code`, `charts`, `document-primitives`, `ui-*`, `coolgrid`) — must have at least one Playwright/browser smoke test in addition to vitest tests.
- **Server packages** (`runtime-server`, `server`, `zero`, `vite-plugin`) — vitest in Node is fine because that IS production.
- **Universal packages** (`reactivity`, `core`, `compiler`, `store`, `hooks`, etc.) — vitest is fine because they're environment-independent. Exception: any code path that branches on environment (`typeof window`, `import.meta.env.DEV`, etc.) must have a test that runs in the branched environment.

### P3 — Strategic vs symptom catalog tiering

**Where**: add to `.claude/rules/workflow.md` under "API Design Philosophy" or as new section.

**The rule**: see T3.3.

### P4 — Feedback memory after every PR

**Where**: already exists as `feedback_*` memories. Reinforce in `.claude/rules/workflow.md`.

**The rule**: every PR that introduces a new pattern, anti-pattern, or surprising behavior must be saved to a feedback memory in the same session. The catalog of feedback memories IS the institutional knowledge.

---

## Sequencing & milestones

### Milestone 1 — Tier 0 (critical bugs)

Order matters here:

1. **T0.3 first** (worktree build resolution) — unblocks empirical verification for everything else
2. **T1.3** (lint rule for `typeof process`) — prevents any new instances while T0.1 is in flight
3. **T0.1** (cleanup the 12 files) — 3 sub-PRs (runtime-dom, core, router)
4. **T0.2** (compiler stack overflow) — independent, can run in parallel

### Milestone 2 — Tier 1 (test parity)

5. **T1.1** (Playwright smoke layer) — start with `runtime-dom`, expand to others
6. **T1.2** (mock-vnode audit) — independent, can run in parallel with T1.1

### Milestone 3 — Tier 2 (doc pipeline)

- **T2.1** (manifest-based generation) — start with 1-2 packages as proof of concept, then expand
- **T2.2** (VitePress code-example typecheck) — independent

### Milestone 3.5 — Tier 2.5 (MCP overhaul)

- **T2.5.1** (generate api-reference from manifests) — depends on T2.1
- **T2.5.2** (validate tool catches Pyreon anti-patterns) — depends on shared `@pyreon/diagnostics` package; can start independent
- **T2.5.3** (`get_pattern` tool) — depends on T3.2 (patterns directory)
- **T2.5.4** (`get_anti_patterns` tool) — independent, parses existing `.claude/rules/anti-patterns.md`
- **T2.5.5** (diagnose error catalog growth) — process change, runs alongside Tier 0 PRs
- **T2.5.6** (`validate_dev_gate` tool) — independent
- **T2.5.7** (`audit_test_environment` tool) — depends on T1.2
- **T2.5.8** (`get_changelog` tool) — independent
- **T2.5.9** (`mcp_overview` tool) — depends on the rest landing first
- **T2.5.10** (telemetry, opt-in) — independent
- **T2.5.11** (MCP integration tests) — independent
- **T2.5.12** (MCP usage docs) — independent

### Milestone 4 — Tier 3 (architecture)

10. **T3.1** (rocketstyle `.statics()` hoisting) — independent, but should land before T3.2 because it's a reference pattern for the patterns directory
11. **T3.2** (patterns directory) — depends on T3.1 (and others) for reference impls
12. **T3.3** (catalog meta-pattern) — process change, can land any time

### Tier 4 (strategic) — depends on user input

Open questions need answers before T4 items can be planned.

---

## Open questions for the user

Please answer these so I can refine the plan:

**Sequencing**:

- **Q1**: Of the milestones, which order do you want? My recommendation is M1 → M2 → M3 → M3.5 → M4. But M3.5 (MCP overhaul) could go earlier because every AI session that uses Pyreon today gets stale knowledge, and the cost is paid every interaction. Alternatively M3.5.4 (`get_anti_patterns`), M3.5.6 (`validate_dev_gate`), M3.5.10 (`get_changelog`) could ship as a quick win bundle in the first MCP PR — they're the cheapest tools and unlock the most AI-agent value.
- **Q2**: For T0.1 (typeof process cleanup), one big sweep PR or 3 smaller PRs (runtime-dom, core, router)?
- **Q3**: For T1.1 (browser tests), Playwright vs `@vitest/browser`? I'd prototype both, but if you have a strong preference, say so.

**Scope**:

- **Q4**: For T2.1 (doc generation), is it OK to introduce a new package (`@pyreon/manifest`) for the manifest type definition + generator? Or should it live in `packages/internals/`?
- **Q5**: For T1.1 (browser tests), is it OK to add Playwright as a dev dependency (~150MB) to the monorepo?
- **Q6**: T3.1 (rocketstyle `.statics()` hoisting) is a non-trivial design change to a critical package. Is this in scope, or should we defer until there's a second consumer asking for it?

**MCP-specific**:

- **Q7**: For T2.5.2 (Pyreon anti-pattern checks), should the diagnostics engine live in a new `@pyreon/diagnostics` package shared by `@pyreon/lint` and `@pyreon/mcp`, or should I duplicate the rules in both? Recommendation: shared package — the duplication risk is exactly the kind of drift this whole plan is trying to eliminate.
- **Q8**: For T2.5.10 (MCP telemetry), is opt-in local logging acceptable? It would be invaluable for understanding which tools are actually used, but I want explicit approval before adding any logging at all.
- **Q9**: For T2.5.6 (`validate_dev_gate`), is this too narrow to be its own tool, or should I fold it into `validate` as one of the rules from T2.5.2?
- **Q10**: Currently the MCP server's `get_components` and `get_routes` rely on a 10-line scanner that barely works. Is improving the scanner in scope, or should those tools be deprecated/removed?

**Strategic**:

- **Q11**: T4.1/T4.2 — do you want to schedule a strategic-thinking session to answer these, or is it OK to defer them indefinitely?
- **Q12**: The catalog has 13 items currently. Do you want me to re-tier them according to T3.3 (strategic vs symptom)?

---

## What this plan does NOT include

**Out of scope** (intentionally):

- **New features**. This plan is about hardening what exists, not adding new packages or APIs. Feature work goes through the existing catalog process.
- **Performance work**. Pyreon already wins benchmarks. Performance regressions are caught by existing perf tests.
- **Migration to a new bundler/toolchain**. Vite/rolldown/esbuild are working; the worktree resolution issue is a config bug, not a toolchain problem.
- **Documentation rewrite**. T2 generates docs from a manifest, but the manifest content is still hand-written. A full docs rewrite is a separate effort.
- **Refactoring for refactoring's sake**. Each item in this plan is justified by a concrete failure mode, not "the code looks ugly."

---

## Closing

This plan came out of a single week of catalog work that surfaced the same failure mode three times in three PRs. The pattern of "fix the symptom, miss the cause, ship the bug" is going to keep happening as long as the underlying gaps remain. The plan addresses those gaps directly.

The total work is large (months, not days). But each tier delivers value independently — Tier 0 alone fixes a real production bug (12 dev warnings dead in browsers), Tier 1 alone prevents future bugs of the same shape, Tier 2 alone eliminates the manual doc sync that's been costing time on every PR.

Pick a starting point and I'll start implementing. My recommendation: T0.3 (worktree build) first because it unblocks everything else, then T1.3 (lint rule) to prevent new `typeof process` instances, then T0.1 (clean up the 12 existing files) split into 3 PRs. That's roughly 1-2 weeks of focused work for the entire Tier 0.
