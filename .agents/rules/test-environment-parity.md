# Test Environment Parity

Tests must run in the environment the code runs in production. The failure this prevents: the logic is correct given the test setup, but vitest supplies something production does not — `process`, hand-built vnodes, mocked APIs — so the test passes and the product is broken. General test rules and the bisect-verify procedure are in `.agents/rules/testing.md`.

## Package categories

### Browser packages

Packages that run in real browsers must have at least one real-browser smoke test (`*.browser.test.{ts,tsx}` under `src/`) in addition to vitest tests. The smoke test imports the public API, mounts a minimal example, exercises one or two key flows, and asserts observable behaviour in real Chromium.

The list is `.agents/rules/browser-packages.json` — the single source of truth; do not copy it elsewhere. It is consumed by:

- the lint rule `pyreon/require-browser-smoke-test` (fires on each package's `src/index.ts`; options `additionalPackages` to extend, `exemptPaths` to opt out),
- `scripts/check-browser-smoke.ts` (CI), which checks both directions: a listed package without a browser test fails, and a package with a browser test that is not listed also fails,
- the MCP tool `get_browser_smoke_status`.

Add a package to the JSON when it ships browser-running code.

### Server packages

These run in Node/Bun in production, so vitest in Node is production: `@pyreon/runtime-server`, `@pyreon/server` (also on the browser list for its client entry), `@pyreon/zero` (server entry), `@pyreon/vite-plugin`, `@pyreon/cli`, `@pyreon/lint`, `@pyreon/mcp`. `typeof process !== 'undefined'` is fine here.

### Universal packages

Environment-independent; vitest is sufficient. Examples: `@pyreon/reactivity`, `@pyreon/core` (mostly), `@pyreon/compiler`, `@pyreon/store`, `@pyreon/state-tree`, `@pyreon/form`, `@pyreon/validation`, `@pyreon/query`, `@pyreon/table`, `@pyreon/i18n`, `@pyreon/hotkeys`, `@pyreon/permissions`, `@pyreon/machine`, `@pyreon/document` (the renderer; primitives are in `document-primitives`), `@pyreon/rx`, `@pyreon/url-state`, `@pyreon/storage`, `@pyreon/feature`.

Exception — a code path that branches on the environment needs a test in each branch:

- `typeof window !== 'undefined'` → a happy-dom test and a node-environment test for the SSR fallback.
- A dev-only gate → a vitest test plus a bundle-inspection test: bundle with `define: { 'process.env.NODE_ENV': '"production"' }` and assert the dev strings are gone, then with `"development"` and assert they are present. Reference: `packages/fundamentals/flow/src/tests/integration.test.ts`.
- Library dev gates use bare `process.env.NODE_ENV !== 'production'`. Never `typeof process !== 'undefined'` (dead in Vite browser bundles) and never `import.meta.env.DEV` (Vite-only). Reference: `warnIgnoredOptions` in `packages/fundamentals/flow/src/layout.ts`; enforced by `pyreon/no-process-dev-gate`.

## Forbidden patterns

### Mock-vnode tests as the only coverage for a contract

A hand-built vnode skips the real pipeline (for example, the rocketstyle attrs HOC that moves props). Keep the fast mock test if you like, but always add a real-`h()` test:

```ts
// Mock (not sufficient on its own)
const vnode = { type: 'div', props: { _documentProps: {...} }, children: [] }
expect(extractDocumentTree(vnode).props).toEqual({...})

// Real h() (required)
import { h } from '@pyreon/core'
import { DocDocument } from '../primitives/DocDocument'
expect(extractDocumentTree(h(DocDocument, { title: 'Test' })).props.title).toBe('Test')
```

Detection: `pyreon doctor --only audit-tests` (also the MCP `audit_test_environment` tool) classifies each test file HIGH / MEDIUM / LOW by the balance of mock-vnode literals and helpers against real `h()` calls. Implementation: `packages/core/compiler/src/test-audit.ts`; tests: `packages/core/compiler/src/tests/test-audit.test.ts`.

Before merging a PR that adds or changes `*.test.{ts,tsx}`, run it and keep HIGH + MEDIUM at 0. If a file regresses, convert it to real `h()` or document the exception in the PR description. The scanner recognises the helper names `mockVNode`, `vnode`, `createVNode`, `VNodeMock` and `makeVNode`.

### happy-dom as a stand-in for a real browser

happy-dom is a partial DOM in Node. It does not model real `IntersectionObserver`/`ResizeObserver`/`requestAnimationFrame` timing, touch/pointer sequencing, CSS rendering (computed style, layout, scroll), browser-context `import.meta.env`, workers, or real network. Use it to check that a component renders some DOM; use a real browser to check it renders the right DOM.

### Mocking the framework

A test that mocks `@pyreon/core`, `@pyreon/runtime-dom` or another framework package tests the mock. Use the real package.

### A spec that hardcodes a platform modifier

Playwright resolves `Meta`/`Control` against the host OS; a component resolves its shortcut from the user agent (for example `packages/zero/zero-content/src/search/search-runtime.tsx`: `navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey`). A spec pressing `Meta+k` passes on a Mac and silently does nothing on the Linux CI runner.

Press `ControlOrMeta+<key>`, which follows the same branch. When the product branches on the environment, derive the branch in the spec; never restate one side of it. Limits:

- A spoofed user agent breaks the pairing; drive the modifier that UA implies.
- A chord the browser claims itself (`Control+Shift+R`) never reaches the page; see `e2e/reactive-overlay.spec.ts`.

## Typed test helpers (`@pyreon/test-utils`)

Use these instead of inline casts:

- `accessInternal<T>(obj)` — read framework-internal state.

  ```ts
  expect(accessInternal<{ _d: Set<unknown> }>(c)._d.size).toBe(1)
  // instead of (c as unknown as { _d: Set<unknown> })._d.size
  ```

- `callInternal<TKey, TReturn>(obj, method, ...args)` — call an internal method.

  ```ts
  return callInternal<'_resolve', unknown>(router, '_resolve', path)
  ```

- `mockAdapter<TOpts, TReturn>(impl)` — type a `vi.mock` callback.

  ```ts
  vi.mock('@x/lib', () => ({ doThing: mockAdapter<Opts, void>((opts) => { ... }) }))
  ```

Accepted casts: DOM element narrowing (`as HTMLInputElement`), deliberate SSR global deletion (`delete (document as any).body`), `@ts-expect-error` in error-path tests, and framework shape casts (`as unknown as VNodeChild`, `as unknown as ComponentFn<...>`). `packages/fundamentals/dnd/src/tests/integration.test.ts` keeps a deliberate `any` on its pdnd adapter mock callbacks, because a typed shape breaks the assertions that call across many option shapes.

## Adding a browser smoke test

Tests run in real Chromium via `@vitest/browser` + Playwright.

1. Add `vitest.browser.config.ts` next to `vitest.config.ts`:

   ```ts
   import { playwright } from '@vitest/browser-playwright'
   import { defineBrowserConfig } from '@pyreon/vitest-config'
   export default defineBrowserConfig(playwright())
   ```

2. Add `"test:browser": "vitest run --config ./vitest.browser.config.ts"` to the package scripts.
3. Add `@vitest/browser-playwright` to devDependencies.
4. Set `excludeBrowserTests: true` in the package's `defineNodeConfig({...})` so `bun run test` skips `*.browser.test.*` files.
5. Write `*.browser.test.ts(x)` under `src/`. Import `mountInBrowser` and `flush` from `@pyreon/test-utils/browser` (a disposable container and a microtask + rAF flush). Pass `mountInBrowser` a VNode, not an arrow — see `.agents/rules/testing.md`.
6. Add the package to `.agents/rules/browser-packages.json`.

The root `bun run test:browser` runs every package's `test:browser`; CI runs it in the `Test (browser)` job. Reference: `packages/internals/test-utils/src/browser/sanity.browser.test.ts`.

## Real-app regression gate (ui-showcase)

Browser smoke tests cover one package in isolation. Most real-world regressions land in cross-package shapes — the rocketstyle `attrs()` HOC moving props through styler, unistyle, elements and runtime-dom with real signals and hydration. Those five packages (`runtime-dom`, `styler`, `rocketstyle`, `elements`, `unistyle`) produce a disproportionate share of `fix:` commits.

`e2e/ui-showcase-regression.spec.ts` runs against `examples/ui-showcase` in real Chromium via `bun run test:e2e:ui-regression` (`e2e-configs/ui-regression.config.ts`, its own webServer). CI selects it through `scripts/e2e-affected.ts`. It covers:

- composition + interaction: a rocketstyle Button click updates a signal end to end;
- the HOC contract: a `size` dimension prop reaches the DOM with visibly different sizes;
- Element/Wrapper composition: no `undefined` leaks (void-tag children);
- SSR/hydration: goto → click → assert, with no console errors;
- theme + signal-driven styling: styler injects rules and classes are non-empty.

When a real app finds a bug in one of the five packages, the fixing PR adds a spec here that fails against the broken version (bisect-verified). The gate does not cover other packages, visual regressions or performance.

## Multi-render-cycle contracts need e2e

Some contracts hold on a single synchronous mount and break only when signals re-run code. Example: the `nativeCompat()` marker makes the `*-compat` `jsx()` runtimes call a framework component through `h(type, props)` instead of `wrapCompatComponent`. Without it, the component body runs in the wrapper's accessor, so `provide()` lands in a stale context and `effect()` re-runs lose live signals.

- **Unit layer** proves the structural contract (marker presence, `vnode.type` identity) — each compat package's `src/tests/native-marker-bypass.test.tsx`. A single-mount Provider + Consumer test passes even without the marker, so it is not a regression guard.
- **E2E layer** proves the runtime contract under navigation: `e2e/cpa-app-compat.shared.ts`, where removing `nativeCompat(RouterView)` in `packages/core/router/src/components.tsx` leaves `<main>` empty after a route change.

Any contract that depends on Pyreon's setup frame surviving re-runs needs both layers.
