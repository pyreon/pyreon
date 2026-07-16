---
title: "Testing Pyreon Apps"
description: "How to test Pyreon apps — @pyreon/testing (render, screen, fireEvent, waitFor, renderHook), reactive-native matchers, happy-dom vs real-browser, and bisect-verifying regression tests."
---

# Testing Pyreon Apps

Pyreon ships an official test kit, **`@pyreon/testing`** — a thin adapter over **[`@testing-library/dom`](https://testing-library.com/docs/dom-testing-library/intro)** (the same foundation under the React, Vue, Solid, and Svelte testing libraries), so the entire Testing-Library API works exactly as you already know it. On top of that it adds a Pyreon-aware `render`/`renderHook` and **reactive-native matchers** that read Pyreon's fine-grained reactive graph — assertions no DOM-only testing library can express. It runs on **vitest**.

```bash
bun add -d @pyreon/testing @testing-library/jest-dom
```

> `@pyreon/testing` is the public, app-facing kit. The `@pyreon/test-utils` package is framework-internal (used to test Pyreon's own packages) — you don't install it. `@testing-library/jest-dom` is an optional peer for the DOM matchers.

## Render + query

`screen`, `fireEvent`, `waitFor`, `within`, `prettyDOM`, and every query are re-exported verbatim from `@testing-library/dom` — so any Testing-Library guide or matcher applies directly. `render` is the one Pyreon-specific piece: it mounts a Pyreon component and binds the full query set to it.

```tsx
import { render, screen, cleanup } from '@pyreon/testing'
import { afterEach } from 'vitest'

afterEach(cleanup) // or add '@pyreon/testing/vitest' to setupFiles

test('renders the greeting', () => {
  render(<Greeting name="Ada" />)
  expect(screen.getByText('Hello, Ada')).toBeTruthy()
})
```

`render(ui, options?)` mounts into an isolated container and returns bound queries + `container` / `unmount` / `debug`. `screen` exposes the same queries scoped to the whole document. Query kinds: `getByText`, `getByTestId`, `getByRole` (implicit + explicit ARIA roles, narrow by accessible `name`), `getByLabelText`, `getByPlaceholderText` — each with `queryBy` / `getAllBy` / `findBy` variants.

## Interaction

```tsx
import { render, screen, fireEvent, waitFor } from '@pyreon/testing'

render(<LoginForm />)
fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
await waitFor(() => expect(screen.getByText('Welcome')).toBeTruthy())
```

`fireEvent` dispatches real DOM events across **both** halves of Pyreon's event model: delegated events (`click`, `input`, `change`, `keyDown`, `submit`, `pointerDown`, `focusIn`, …) bubble to the one listener on the mount container, and non-bubbling events (`focus`, `blur`, `mouseEnter`, `mouseLeave`) reach the direct `addEventListener` Pyreon attaches to the element — both are verified end-to-end in real Chromium. `fireEvent` returns `false` when a handler called `preventDefault()` on a cancelable event, `true` otherwise. `waitFor(cb, { timeout, interval })` polls until `cb` stops throwing (rejecting after `timeout`, ~1s by default); `waitForElementToBeRemoved(el)` resolves once `el` leaves the DOM.

## Hooks

```tsx
import { renderHook } from '@pyreon/testing'

const { result, rerender } = renderHook((size) => usePagination(size), { initialProps: 10 })
expect(result.current.pageCount()).toBe(5)
rerender(20) // updates the REACTIVE prop signal — the hook is NOT re-invoked (Pyreon runs hooks once)
expect(result.current.pageCount()).toBe(3)
```

Unlike React's `renderHook`, the hook runs **once** (Pyreon semantics); `rerender` updates a reactive props signal so `computed`/`effect` derivations re-run.

## DOM matchers

`@pyreon/testing/matchers` registers the full [`@testing-library/jest-dom`](https://github.com/testing-library/jest-dom) matcher set (or use the `/vitest` setup file, which also wires auto-cleanup):

```ts
import '@pyreon/testing/matchers'

expect(screen.getByRole('button')).toBeInTheDocument()
expect(screen.getByTestId('email')).toHaveValue('a@b.co')
expect(screen.getByRole('checkbox')).toBeChecked()
expect(screen.getByRole('dialog')).toBeVisible()
```

The complete jest-dom set applies (`toBeInTheDocument`, `toHaveTextContent`, `toBeVisible`, `toHaveAccessibleName`, `toBeChecked`, `toHaveValue`, `toHaveClass`, …) — the same matchers you'd use in any Testing-Library project.

## Reactive-native matchers

The part no DOM-only testing library can do — assert on **fire counts** and **fine-grained re-run behavior** by reading the reactive graph:

```ts
import { expectSignal, expectEffect } from '@pyreon/testing'

expectSignal(total).toHaveRecomputedTimes(1)                    // recomputed once — no thrash
expectEffect(logEffect).toReRunWhen(() => qty.set(3))
expectEffect(logEffect).notToReRunWhen(() => theme.set('dark')) // fine-grained: NOT re-run by an unrelated write
```

`notToReRunWhen` verifies fine-grained precision — that an unrelated write does **not** re-run an effect — which a whole-component re-render model can't assert. These read the reactive graph and require a dev/test build (they throw a clear error under a production build rather than silently pass).

## GC / leak matchers

Collapse the hand-rolled `WeakRef` + double-`gc()` ceremony, and catch subscription leaks — require `--expose-gc`:

```ts
import { expectGarbageCollected, expectNoReactiveLeak } from '@pyreon/testing'

await expectGarbageCollected(() => makeRow(data))
await expectNoReactiveLeak(() => {
  const { unmount } = render(<List rows={rows} />)
  unmount()
})
```

Run the suite with `--expose-gc` (`execArgv: ['--expose-gc']` in the vitest config); without it these throw an actionable error rather than silently passing.

## Library helpers

Seven subpaths eliminate the provider/setup boilerplate of testing code built on Pyreon's libraries. Each is gated on its **optional peer** — import `@pyreon/testing/form` only when `@pyreon/form` is installed; the main entry stays dependency-light. Every render harness takes a `wrapper` option, so providers **compose** (theme + router + query together) — there is deliberately no mega `renderApp`.

### `/form` — forms without a hand-written harness

Before: write a probe component, mount it, reach into `useForm`, hand-fire events per field. After:

```tsx
import { renderForm, expectForm, fillForm, submitForm } from '@pyreon/testing/form'

// Headless (model-level) — no component needed:
const { form, fill, submit } = renderForm(() =>
  useForm({ initialValues: { email: '' }, validators: { email: required }, onSubmit }),
)
fill({ email: 'ada@lovelace.dev' }) // setFieldValue + touched per field
await submit()                      // full handleSubmit pipeline
expectForm(form).toBeValid()
expectForm(form).toHaveValues({ email: 'ada@lovelace.dev' })

// Rendered (DOM-level) — drives register()-bound inputs BY LABEL through
// real input/blur/submit events (so blur-validation runs like in an app):
render(<SignupForm />)
fillForm(document.body, { Email: 'ada@lovelace.dev', 'Accept terms': true })
await submitForm(document.body)
```

`fillForm`'s keys are **label matchers** (`getByLabelText`), not field names — `register()`'s ids are opaque, and the label association is the a11y-correct markup anyway. Checkboxes take booleans, file inputs take `File | File[]`. `expectForm` also offers `toBeInvalid` / `toHaveFieldError(field, /re/)` / `toHaveNoFieldError` / `toBeDirty` / `toBePristine`.

### `/router` — routes settled before you assert

```tsx
import { renderWithRouter, expectRouter } from '@pyreon/testing/router'

const { router, navigate, getByText } = await renderWithRouter(null, {
  routes: [{ path: '/posts/:id', component: Post, loader: fetchPost }],
  route: '/posts/1',
})
getByText('Post 1')                     // loader data present on FIRST render
expectRouter(router).toBeAt('/posts/:id') // pattern OR concrete path
await navigate('/posts/2')              // resolves AFTER guards+loaders+DOM commit
```

`renderWithRouter` is **async**: it pre-resolves the initial route's lazy components *and* loaders (`router.preload` — the SSR-handler contract), so `useLoaderData()` is populated on first render with no loading fallbacks. Pass `null` for a bare `<RouterView/>`, or your app shell as `ui`.

### `/ui` — theme + mode without provider plumbing

```tsx
import { renderWithTheme, expectComputedStyle } from '@pyreon/testing/ui'

const { getByRole, setMode } = renderWithTheme(<Button state="primary">Go</Button>, { theme })
setMode('dark') // reactive — same elements re-style in place, no remount
expectComputedStyle(getByRole('button'), { color: 'red' }) // 'red' == '#ff0000' == 'rgb(255, 0, 0)'
```

**Honest limit:** `expectComputedStyle` normalizes values through the engine's own computed-style serialization — in real Chromium all color forms canonicalize; happy-dom's `getComputedStyle` is partial (cascade/inheritance incomplete), so class-based computed-style assertions belong in `*.browser.test.tsx`.

### `/store` — singleton isolation between tests

```ts
// @check
import { installStoreReset, withFreshStore } from '@pyreon/testing/store'
import { defineStore, signal } from '@pyreon/store'
import { expect, test } from 'vitest'

const useCart = defineStore('cart', () => {
  const items = signal<string[]>([])
  return { items, add: (item: string) => items.update((xs) => [...xs, item]) }
})

installStoreReset() // afterEach(resetAllStores) — each test gets fresh singletons

test('scoped isolation without touching other stores', () => {
  withFreshStore(useCart, (cart) => {
    cart.store.add('boots')
    expect(cart.store.items()).toHaveLength(1)
  }) // disposed — the next useCart() rebuilds from setup()
})
```

Both build on `@pyreon/store`'s `resetStore`/`resetAllStores`, which now **dispose** the store (effectScope stopped, plugin cleanups run) before dropping it — a reset can no longer leak setup-scope effects.

### `/i18n`, `/toast`, `/query`

```tsx
import { renderWithI18n } from '@pyreon/testing/i18n'
import { expectToast, findToast, clearToasts } from '@pyreon/testing/toast'
import { renderWithQueryClient } from '@pyreon/testing/query'

// i18n: provider + reactive locale switching + a bound t() for assertions.
const { setLocale, t, getByText } = renderWithI18n(<Nav />, { locale: 'en', messages })
setLocale('cs')
getByText(t('home'))

// toast: store-level matchers — work headless or with a mounted <Toaster>.
expectToast(/saved/i, { type: 'success' })
await findToast(/synced/) // waits for async producers
afterEach(clearToasts)    // module-level store — always reset between tests

// query: fresh isolated client per test (retry off, gcTime Infinity — the
// TanStack testing convention) + a setQueryData passthrough for seeding.
const { setQueryData, findByText } = renderWithQueryClient(<Todos />)
setQueryData(['todos'], [{ id: 1, title: 'write tests' }])
await findByText('write tests')
```

## The guiding rule: test-environment parity

**Tests must run in the same environment as production.** A test that passes only because vitest provided something production doesn't (a `process` global, a hand-built vnode, a mocked API) gives false confidence.

- **Logic, reactivity, universal code** → vitest in Node (Node *is* production for these).
- **DOM components** → vitest with `environment: 'happy-dom'` for fast unit coverage.
- **Anything that runs in a real browser in production** (renderers, the router, UI/styling, compat layers) → **also** a real-Chromium smoke test, because happy-dom is a polyfill, not a browser. Interaction tests (`fireEvent`-driven) belong in a real browser — Pyreon's event delegation only fires for bubbling events in a real event loop.

Every package uses the shared vitest helper — never a hand-rolled `mergeConfig`:

```ts
import { defineNodeConfig } from '@pyreon/vitest-config'
export default defineNodeConfig({ category: 'fundamentals', environment: 'happy-dom' })
```

Browser configs use `defineBrowserConfig`.

## Bisect-verify regression tests

A regression test is only load-bearing if it fails against the broken code:

1. Save the fix. 2. Revert it. 3. Run the test — assert it **fails** with the right message. 4. Restore the fix. 5. Run the test — assert it **passes**.

Document the result in the PR. A test that passes both ways covers nothing.

## Common pitfalls

- **happy-dom is not a browser.** It won't catch real `IntersectionObserver` timing, CSS rendering, or `import.meta.env` browser behavior. Use a real-browser smoke for those.
- **Dev-mode warnings use bare `process.env.NODE_ENV !== 'production'`** — not `typeof process` (dead in Vite browser bundles), not `import.meta.env.DEV` (Vite-only).
- **Cross-tab Playwright specs reloading via Vite HMR** — suppress `@vite/client` per-context for multi-tab listener specs.

## Related

- [Reactivity in Depth](/docs/guides/reactivity-in-depth)
- [Reactivity Rules](/docs/reactivity-rules)
