# Test Environment Parity

Tests must run in the same environment as production. The recurring failure mode this rule prevents: tests pass because vitest provides something (`process`, hand-constructed vnodes, mocked APIs) that production does not — the LOGIC is correct given the test setup, but the test setup doesn't match reality.

This isn't theoretical. PR #197 found a silent metadata drop because no test ran a real rocketstyle primitive through the extraction pipeline (only mock vnodes did). PR #200 found a dev warning that was dead code in browsers because the gate used `typeof process` and tests ran in vitest where `process` exists.

## The rule

Categorize each package into one of three buckets and apply the matching rule:

### Browser packages

These run in real browsers in production. **Must have at least one Playwright/browser smoke test** in addition to vitest tests.

The canonical machine-readable list lives at [`.claude/rules/browser-packages.json`](./browser-packages.json) — consumed by the `pyreon/require-browser-smoke-test` lint rule, the MCP `get_browser_smoke_status` tool, and the CI script `scripts/check-browser-smoke.ts`. Update the JSON when adding a new browser-running package; this prose list is kept in sync manually.

- `@pyreon/runtime-dom`
- `@pyreon/router`
- `@pyreon/head`
- `@pyreon/flow`
- `@pyreon/code`
- `@pyreon/charts`
- `@pyreon/document-primitives`
- `@pyreon/ui-components`, `@pyreon/ui-primitives`, `@pyreon/ui-theme`
- `@pyreon/elements`, `@pyreon/styler`, `@pyreon/unistyle`, `@pyreon/rocketstyle`, `@pyreon/coolgrid`, `@pyreon/kinetic`
- `@pyreon/connector-document`
- `@pyreon/dnd`
- All `compat` packages (`react-compat`, `preact-compat`, `vue-compat`, `solid-compat`)

The smoke test imports the public API, mounts a minimal example, exercises 1-2 key flows, and asserts observable behavior in a real browser. Not exhaustive — just enough to catch environment divergence.

**This rule is enforced by the lint rule `pyreon/require-browser-smoke-test`** — every package in the list above MUST have at least one `*.browser.test.{ts,tsx}` file under `src/`. The rule fires on each package's `src/index.ts` during `bun run lint`. The default browser-package list inside the rule mirrors the categorization above; keep them in sync when adding a new browser-running package. Use the rule's `additionalPackages` option to extend, or `exemptPaths` to opt out (e.g. for packages still under construction).

### Server packages

These run in Node/Bun in production. Vitest in Node IS production, so vitest tests are sufficient.

- `@pyreon/runtime-server`
- `@pyreon/server`
- `@pyreon/zero` (server entry)
- `@pyreon/vite-plugin`
- `@pyreon/cli`, `@pyreon/lint`, `@pyreon/mcp`

For these packages, `typeof process !== 'undefined'` is a fine pattern because production has `process` defined.

### Universal packages

Environment-independent. Vitest is fine — but with one exception below.

- `@pyreon/reactivity`
- `@pyreon/core` (mostly — some browser-only paths)
- `@pyreon/compiler`
- `@pyreon/store`, `@pyreon/state-tree`
- `@pyreon/form`, `@pyreon/validation`
- `@pyreon/query`, `@pyreon/table`, `@pyreon/virtual`
- `@pyreon/i18n`, `@pyreon/hooks`, `@pyreon/hotkeys`
- `@pyreon/permissions`, `@pyreon/machine`
- `@pyreon/document` (the renderer — primitives are in `document-primitives`)
- `@pyreon/rx`, `@pyreon/toast`, `@pyreon/url-state`, `@pyreon/storage`
- `@pyreon/feature`

**Exception**: any code path that branches on environment must have a test that runs in the branched environment.

- Code that checks `typeof window !== 'undefined'` → must have a happy-dom test AND a Node-only test (the latter explicitly verifies the SSR fallback path).
- Code that checks `import.meta.env.DEV` → must have a vitest test (which sets `DEV = true`) AND an esbuild bundle inspection test (which verifies the prod-replaced literal tree-shakes correctly).
- Code that checks `typeof process !== 'undefined'` → DELETE the check. Use `import.meta.env.DEV` instead. See `flow/src/layout.ts:warnIgnoredOptions` for the reference implementation.

## Anti-patterns this rule explicitly forbids

### 1. Mock-vnode tests as the only coverage for a contract

**Bad:**

```ts
const vnode = { type: 'div', props: { _documentProps: {...} }, children: [] }
const tree = extractDocumentTree(vnode)
expect(tree.props).toEqual({...})
```

**Good (in addition to the mock test, not instead of):**

```ts
import { h } from '@pyreon/core'
import { DocDocument } from '../primitives/DocDocument'

const vnode = h(DocDocument, { title: 'Test' })
const tree = extractDocumentTree(vnode)
expect(tree.props.title).toBe('Test')
```

**Detection.** The `audit_test_environment` MCP tool (also wired into `pyreon doctor --audit-tests`) scans every test file for this anti-pattern and classifies the file HIGH / MEDIUM / LOW based on the balance of mock-vnode literals + helpers + helper-call sites vs real `h()` calls + `@pyreon/core` import. Run it before merging a new test file or after a framework change to verify the parallel real-`h()` coverage is in place. The scanner's heuristics include three context-aware skips (helper-def vs binding discrimination, type-guard call-arg skip, template-string fixture mask) so genuine code patterns aren't drowned out by false positives — see `packages/core/compiler/src/test-audit.ts` for the implementation and `tests/test-audit.test.ts` for the bisect-verified test suite.

The mock test is the fast unit-test path. The real-`h()` test is the safety net that catches contract bugs. Always have both. The connector-document bug fixed in PR #197 was hidden for the entire lifetime of the package because no test used the real-`h()` form.

### 2. `typeof process !== 'undefined'` as a dev-mode gate in browser packages

Dead code in real Vite browser bundles. See `.claude/rules/anti-patterns.md` and the reference implementation in `flow/src/layout.ts`.

### 3. happy-dom as a stand-in for a real browser

happy-dom is a partial DOM polyfill running in Node. It does not catch:

- Real `IntersectionObserver`, `ResizeObserver`, `requestAnimationFrame` timing
- Touch/pointer event sequencing
- Real CSS rendering (computed styles, scroll behavior, layout)
- Vite-specific `import.meta.env` behavior in browser context
- Web Worker, SharedWorker, ServiceWorker runtime behavior
- Real network fetch, WebSocket, EventSource

happy-dom is fine for testing your component renders ANY DOM at all. It is NOT fine for testing your component renders the RIGHT DOM in a real browser. Use Playwright (or `@vitest/browser`) for the latter.

### 4. Mocking the entire framework in tests

If a test mocks `@pyreon/core`, `@pyreon/runtime-dom`, or any other framework package, it's testing the mock, not the framework integration. Use the real package. If the real package is too slow to set up, the package itself probably has an ergonomics problem worth fixing.

## Pre-merge audit guard

Before merging any PR that adds or modifies `*.test.{ts,tsx}` files, run `pyreon doctor --audit-tests` and verify HIGH + MEDIUM count is still 0. If it regressed, either convert the new test to use real `h()` from `@pyreon/core` (or rename mock helpers off the scanner's name list — `mockVNode` / `vnode` / `createVNode` / `VNodeMock` / `makeVNode`) or document the exception in the PR description with the rationale. The T1.2 sweep brought the count to 0/0; this guard locks it in without CI tooling.

## How to add a browser smoke test

The harness is set up (T1.1 Phase 1). Tests run in real Chromium via `@vitest/browser` + Playwright — not happy-dom, not Node.

Per-package opt-in:

1. Add `vitest.browser.config.ts` next to the existing `vitest.config.ts`:

   ```ts
   import { playwright } from '@vitest/browser-playwright'
   import { defineBrowserConfig } from '../../../vitest.browser'
   export default defineBrowserConfig(playwright())
   ```

2. Add `"test:browser": "vitest run --config ./vitest.browser.config.ts"` to the package's `package.json` scripts.
3. Add `@vitest/browser-playwright` to the package's devDeps (required for Vite's static resolver inside the package directory).
4. If the package also has a regular `vitest.config.ts`, merge `nodeExcludeBrowserTests` from `vitest.shared` into it so `bun run test` skips `.browser.test.*` files.
5. Write tests as `*.browser.test.ts(x)` anywhere under `src/`. Import `mountInBrowser` + `flush` from `@pyreon/test-utils/browser` for a disposable container + a microtask+rAF flush helper.

CI runs the root `test:browser` script across every opt-in package via the `Test (browser)` job. Playwright Chromium is cached between runs.

Reference implementation: [packages/internals/test-utils/src/browser/sanity.browser.test.ts](../../packages/internals/test-utils/src/browser/sanity.browser.test.ts).

## Real-app regression gate (ui-showcase)

Browser smoke tests cover ONE package's surface in isolation. They do not cover the cross-package shapes where most real-world regressions land — rocketstyle's `attrs()` HOC moving props through styler + unistyle + elements + runtime-dom in a real app, with real signal handlers and real hydration.

The audit (PR #351) found that 5 packages — `runtime-dom`, `styler`, `rocketstyle`, `elements`, `unistyle` — produced 24% of all `fix:` commits. Every one of those fixes came from a real app surfacing a bug that synthetic tests structurally couldn't catch:

- **PR #197** — silent metadata drop. Mock-vnode test passed; real `h()` flow broke (rocketstyle attrs HOC moved `_documentProps`).
- **PR #200** — `typeof process` dev-gate dead in real Vite browser bundles; vitest had `process` defined and missed it.
- **PR #336** — 4 production regressions on a real consumer app (Show/Match crash on signal accessor, void-tag children leak, styler malformed-CSS silent, zero SSG typed-but-unimplemented).
- **PR #349** — `_layout` double-mount in SSR (partial fix; full fix landed in the structure/data-decoupling RouterView refactor on top of #402, which dropped per-page-load PyreonUI invocations from 27 → 4 in the ui-showcase mount probe), plus 5 compiler bugs only visible when real JSX runs through the compiler.

The gate that catches this shape: `e2e/ui-showcase-regression.spec.ts` runs against `examples/ui-showcase` in real Chromium via `bun run test:e2e:ui-regression` (own [`playwright.ui-regression.config.ts`](../../playwright.ui-regression.config.ts), separate webServer boot to avoid resource contention with the existing `test:e2e` boot). Each spec maps to one of the bug-shapes above:

- **Composition + interaction** — rocketstyle Button click increments via signal end-to-end (catches #336.1, #349)
- **HOC contract walk-through** — `size` dimension prop reaches the rendered DOM with visibly different sizes (catches #197 — mock-vnode tests bypass the HOC)
- **Element + Wrapper composition** — no `undefined` leaks, dev markers present (catches #336.2 void-tag children)
- **SSR / hydration smoke** — full goto → wait → click → assert path; no console errors (catches #349)
- **Theme + signal-driven styling** — styler injects ≥1 CSS rule, classes are non-empty (catches #336.3 styler dev-gate dead)

CI runs `bun run test:e2e:ui-regression` as a separate step in the `E2E` job, after the existing `bun run test:e2e` (playground + ssr-showcase).

**Adding a new spec when a real-app regression surfaces.** When a real consumer app finds a bug in any of the 5 target packages, the same PR that fixes the bug should also add a spec to `e2e/ui-showcase-regression.spec.ts` that would have caught it BEFORE merge. The bar is "would the spec have failed against the broken version?" — i.e. bisect-verify it (see below). The gate is only as good as its specs; treat each new bug as an opportunity to lock its shape in.

**What this gate doesn't catch.** Bugs in packages OUTSIDE the 5 target ones (router, query, form, etc. — those have their own browser-test stories). Visual regressions (separate `visual` project, currently disabled). Performance regressions (covered by `@pyreon/perf-harness`). Bug shapes nobody wrote a spec for — gate is reactive, not predictive.

## Multi-render-cycle bugs need e2e coverage, not just unit tests

Some framework contracts are invisible in synchronous-mount unit tests but break end-to-end under signal-driven re-execution. Reference case: the compat-mode `nativeCompat()` marker contract (PRs #419/#422/#425/#427/#429).

The marker tells `@pyreon/{react,preact,vue,solid}-compat`'s `jsx()` runtime to route framework components through `h(type, props)` directly instead of through `wrapCompatComponent`. Without the marker, the component body runs inside the wrapper's accessor instead of Pyreon's setup frame — `provide()` calls end up in a torn-down context stack, `effect()` re-runs lose live-signal access.

**The unit test layer can prove the JSX-runtime bypass fires** (`vnode.type === Native` for marked, `vnode.type === wrapper` for unmarked — see each compat package's `native-marker-bypass.test.tsx`). It CANNOT prove the contract holds across multiple render cycles, because synchronous mount preserves `provide()` context even WITH the wrapper (provide() pushes onto the global context stack regardless). A unit test that mounts a marked Provider + Consumer once and reads the value will pass even if you remove the marker.

**The e2e test layer is required to catch the genuine bug shape.** PR #427's `e2e/cpa-app-compat.shared.ts` runs against the cpa-app-compat fixtures with real router state — when a navigation re-fires `RouterView`'s effect inside the wrapper, the loader's `provide(LoaderDataContext, ...)` lands in a stale context stack and `useLoaderData()` reads `undefined`. Bisect-verified by removing `nativeCompat(RouterView)` from `packages/core/router/src/components.tsx`: the cpa-app posts test fails with `<main>` empty.

**Pattern for any contract that depends on Pyreon's setup frame surviving across re-runs**:
- **Unit layer**: prove the structural / identity contract (function identity, prop shape, marker presence). Fast, focused per-package.
- **E2E layer**: prove the runtime contract under real-app reactivity (signal click, loader-populated route, signal-driven re-render). Slower, cross-package, real-shape.

Both layers are required. Comments in `*-compat/src/tests/native-marker-bypass.test.tsx` explicitly document which assertions are bisect-load-bearing (the structural ones) and which are smoke (the mount + provide() integration check) so a future contributor doesn't mistake the smoke test for a regression guard it isn't.

## Bisect-verify regression tests

When you add a regression test, you must bisect-verify it before the PR is ready:

1. Save the fix.
2. Revert the fix (temporary).
3. Run the test — assert it fails with the right error message.
4. Restore the fix.
5. Run the test — assert it passes.

If step 3 doesn't fail, the test passes for the wrong reason and provides false confidence. PR #200's first regression test passed even with the broken pattern because esbuild's minifier folds the dead code regardless of the gate. The bisect verification caught that. Without it, the test would have shipped with no actual coverage.

This is mandatory for any test marked as a regression test. Document the bisect result in the PR description: "Bisect-verified: reverted gate to broken pattern, test failed with `<error>`, restored, test passed."
