# @pyreon/test-utils

> **Private — internal to the Pyreon monorepo. Not published to npm.**

Testing utilities for Pyreon UI system + framework tests. Eliminates boilerplate when testing rocketstyle / styled / provider-based components, and ships the two helpers (`mountReactive`, `mountAndExpectOnce`) that catch fine-grained reactivity regressions — components patching DOM in place vs re-running their parent. Separate `/browser` subpath helpers for real-Chromium tests via `@vitest/browser`.

## Subpath exports

- `@pyreon/test-utils` — happy-dom / Node-vitest helpers (theme context, mocks, mount + reactive helpers).
- `@pyreon/test-utils/browser` — real-Chromium helpers (`mountInBrowser`, `flush`) for `*.browser.test.ts(x)` files.

## Main entry (`@pyreon/test-utils`)

```ts
import {
  initTestConfig,
  withThemeContext,
  buildThemeContextMap,
  getComputedTheme,
  renderProps,
  resolveRocketstyle,
  mountReactive,
  mountAndExpectOnce,
  ThemeCapture,
  BaseComponent,
  mockCss,
  mockStyled,
} from '@pyreon/test-utils'
```

### Mock factories

| Export                       | Purpose                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mockCss`                    | No-op CSS tagged template that returns `''` — drop-in for `@pyreon/ui-core`'s `config.css` in tests that don't need rendered CSS.                                             |
| `mockStyled`                 | Pass-through `styled` — returns the wrapped component unchanged.                                                                                                              |
| `initTestConfig(overrides?)` | Initialize `@pyreon/ui-core` `config` with the mocks. Returns a cleanup fn restoring the original. Pass `{ css, styled, component, textComponent }` to override individually. |

```ts
let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())
```

### Theme context

| Export                           | Purpose                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `withThemeContext(fn, options?)` | Run `fn()` inside a pushed rocketstyle theme context. Pops on the way out, even when `fn` throws. |
| `buildThemeContextMap(options?)` | Lower-level — produces a `Map<symbol, unknown>` suitable for `pushContext()` directly.            |
| `TestThemeOptions`               | `{ theme?, mode?: 'light'                                                                         | 'dark', isDark?, isLight? }`. Defaults: `mode: 'light'`, `theme: { rootSize: 16 }`. |

```ts
it('works in dark mode', () => {
  const theme = withThemeContext(() => Button({ state: 'primary' }), { mode: 'dark' })
})
```

### Render helpers

| Export                                      | Purpose                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `getComputedTheme(Component, props?, ctx?)` | Render a rocketstyle component within theme context, resolve and return `$rocketstyle`.       |
| `renderProps(Component, props?, ctx?)`      | Same render flow but returns the VNode's resolved props (after `attrs` / `theme` resolution). |
| `resolveRocketstyle(value)`                 | Resolve a value that may be a function accessor or a plain object.                            |

```ts
const theme = getComputedTheme(Button, { state: 'primary' })
expect(theme.color).toBe('red')

const props = renderProps(MyComponent, { label: 'Hello' })
expect(props.children).toBe('Hello')
```

### Mount-and-mutate helpers (require DOM)

| Export                                   | Purpose                                                                                                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mountReactive(vnode)`                   | Mount a VNode into a fresh container appended to `document.body`. Returns `{ container, cleanup, unmount }`. Throws a clear error if `document` is undefined.                                                   |
| `mountAndExpectOnce(factory, mutations)` | Mount `factory()`'s output, track how many times `factory` was invoked across the supplied mutations, return `{ container, parentCalls, cleanup }`. The canonical assertion is `expect(parentCalls()).toBe(1)`. |

Both require `environment: 'happy-dom'` in your package's `vitest.config.ts` (or the merged `sharedConfig` from the repo root).

```ts
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'
import { mountReactive, mountAndExpectOnce } from '@pyreon/test-utils'

// 1. text updates in place
it('text updates when signal mutates', () => {
  const name = signal('Aisha')
  const { container, cleanup } = mountReactive(h('div', null, () => name()))
  expect(container.textContent).toBe('Aisha')
  name.set('Marcus')
  expect(container.textContent).toBe('Marcus')
  cleanup()
})

// 2. parent-runs-once contract
it('parent runs once across signal mutations', () => {
  const headline = signal('A')
  const { parentCalls, container, cleanup } = mountAndExpectOnce(
    () => h(DocText, null, () => headline()),
    () => {
      headline.set('B')
      headline.set('C')
      headline.set('D')
    },
  )
  expect(parentCalls()).toBe(1)
  expect(container.textContent).toBe('D')
  cleanup()
})
```

The "parent runs once" pattern catches the bug fixed in PR #191 — a parent component mounted inside a reactive thunk like `{() => <Template prop={signal()} />}` would re-create the entire subtree on every signal change.

### Component fixtures

| Export          | Purpose                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ThemeCapture`  | Synthetic component that captures `$rocketstyle` / `$rocketstate` (resolving function accessors) for inspection in mock-vnode tests.                          |
| `BaseComponent` | Synthetic component that exposes the resolved pseudo-state via data attributes — useful when asserting which dimension state the rocketstyle pipeline picked. |

## Browser subpath (`@pyreon/test-utils/browser`)

Real-Chromium helpers — import from `@pyreon/test-utils/browser` inside `*.browser.test.ts(x)` files that run under `@vitest/browser` with Playwright Chromium.

| Export                  | Purpose                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mountInBrowser(vnode)` | Mount into a fresh `<div>` appended to `document.body` (isolated per-test root — no shared listeners between runs). Returns `{ container, unmount }`. |
| `flush()`               | Await a microtask + a `requestAnimationFrame` tick. Use after a signal write before asserting on DOM state that a reactive effect will apply.         |
| `MountInBrowserResult`  | Type for `mountInBrowser`'s return value.                                                                                                             |

```ts
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

it('renders in real Chromium', async () => {
  const count = signal(0)
  const { container, unmount } = mountInBrowser(
    h('button', { onClick: () => count.update((n) => n + 1) }, () => count()),
  )

  expect(container.textContent).toBe('0')
  container.querySelector('button')!.click()
  await flush()
  expect(container.textContent).toBe('1')

  unmount()
})
```

## Gotchas

- **Mount helpers throw without `environment: 'happy-dom'`.** The error message points at the fix (add `environment: 'happy-dom'` to the package's `vitest.config.ts`). Browser-subpath helpers obviously need real Chromium via `@vitest/browser`.
- **Always pair mock-vnode tests with real-`h()` tests.** The mock path is fast but doesn't exercise rocketstyle's attrs HOC pipeline. The real-`h()` test is the regression-net for PR #197-class bugs. `pyreon doctor --audit-tests` scans for files that have HIGH ratios of mock-vnode literals to real-`h()` calls.
- **`mountAndExpectOnce` counts factory invocations, not effect re-runs.** The signal-driven re-run typically IS the effect (good — patches in place); the failure case is that the factory itself is re-invoked, which means a new VNode subtree is constructed and mounted.
- **`initTestConfig` mutates `@pyreon/ui-core` config globally** — always pair with the returned `cleanup()` in an `afterAll` / `afterEach`. Otherwise theme assertions in unrelated test files will fail.

## License

MIT (private to the Pyreon monorepo).
