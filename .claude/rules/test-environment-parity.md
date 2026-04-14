# Test Environment Parity

Tests must run in the same environment as production. The recurring failure mode this rule prevents: tests pass because vitest provides something (`process`, hand-constructed vnodes, mocked APIs) that production does not — the LOGIC is correct given the test setup, but the test setup doesn't match reality.

This isn't theoretical. PR #197 found a silent metadata drop because no test ran a real rocketstyle primitive through the extraction pipeline (only mock vnodes did). PR #200 found a dev warning that was dead code in browsers because the gate used `typeof process` and tests ran in vitest where `process` exists.

## The rule

Categorize each package into one of three buckets and apply the matching rule:

### Browser packages

These run in real browsers in production. **Must have at least one Playwright/browser smoke test** in addition to vitest tests.

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

## Bisect-verify regression tests

When you add a regression test, you must bisect-verify it before the PR is ready:

1. Save the fix.
2. Revert the fix (temporary).
3. Run the test — assert it fails with the right error message.
4. Restore the fix.
5. Run the test — assert it passes.

If step 3 doesn't fail, the test passes for the wrong reason and provides false confidence. PR #200's first regression test passed even with the broken pattern because esbuild's minifier folds the dead code regardless of the gate. The bisect verification caught that. Without it, the test would have shipped with no actual coverage.

This is mandatory for any test marked as a regression test. Document the bisect result in the PR description: "Bisect-verified: reverted gate to broken pattern, test failed with `<error>`, restored, test passed."
