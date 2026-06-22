---
title: "Testing Pyreon Apps"
description: "How to test Pyreon components and logic — vitest setup, happy-dom vs real-browser smoke tests, the test-environment-parity rule, and bisect-verifying regression tests."
---

# Testing Pyreon Apps

Pyreon tests run on **vitest**, with one guiding rule: **tests must run in the same environment as production**. A test that passes only because vitest provided something production doesn't (a `process` global, a hand-built vnode, a mocked API) gives false confidence.

## When to use what

- **Logic, reactivity, universal code** → vitest in Node (Node *is* production for these).
- **DOM components** → vitest with `environment: 'happy-dom'` for fast unit coverage.
- **Anything that runs in a real browser in production** (renderers, the router, UI/styling, compat layers) → **also** a real-Chromium smoke test, because happy-dom is a polyfill, not a browser.

## Vitest config

Every package uses the shared helper — never a hand-rolled `mergeConfig`:

```ts
import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({ category: 'fundamentals', environment: 'happy-dom' })
```

Browser configs use `defineBrowserConfig`. The helpers bake the canonical merge order, the 20s timeout, CI retries, and per-category coverage defaults.

## Real-browser smoke tests

Browser-running packages must ship at least one `*.browser.test.tsx` under `src/` (enforced by the `require-browser-smoke-test` lint rule). They run in real Chromium via `@vitest/browser` + Playwright:

```tsx
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'

it('increments', async () => {
  const { container } = mountInBrowser(() => <Counter />)
  container.querySelector('button')!.click()
  await flush()
  expect(container.querySelector('button')!.textContent).toBe('1')
})
```

## Test-environment parity

The recurring bug class is "passes in test, breaks in production":

- **Mock-vnode tests need a parallel real-`h()` test.** A hand-built `{ type, props, children }` object bypasses the real component pipeline. The mock test is the fast path; the real-`h()` test is the safety net. Have both.
- **happy-dom is not a browser.** It won't catch real `IntersectionObserver` timing, CSS rendering, or Vite `import.meta.env` browser behavior. Use Playwright for those.
- **Dev-mode warnings use bare `process.env.NODE_ENV !== 'production'`.** Not `typeof process` (dead in Vite browser bundles), not `import.meta.env.DEV` (Vite-only).

## Bisect-verify regression tests

A regression test is only load-bearing if it fails against the broken code:

1. Save the fix.
2. Revert the fix.
3. Run the test — assert it **fails** with the right message.
4. Restore the fix.
5. Run the test — assert it **passes**.

Document the result in the PR. A test that passes both ways covers nothing.

## Common pitfalls

- **Stale DOM references after re-render in compat-layer tests.** Compat layers do full DOM replacement on state change — re-query the DOM after the change, don't hold a pre-click element handle.
- **Mocking the framework.** Mocking `@pyreon/core` tests the mock, not the integration. Use the real package.
- **Cross-tab Playwright specs reloading via Vite HMR.** Suppress `@vite/client` per-context for multi-tab listener specs.

## Related

- [Reactivity in Depth](/docs/guides/reactivity-in-depth)
- [Reactivity Rules](/docs/reactivity-rules)
