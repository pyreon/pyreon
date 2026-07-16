# @pyreon/testing

Official testing utilities for [Pyreon](https://github.com/pyreon/pyreon) — a Testing-Library-style API for mounting and asserting on components, plus reactive-native matchers that read Pyreon's fine-grained reactive graph.

```bash
bun add -d @pyreon/testing
```

## Render + query

```tsx
import { render, screen, cleanup } from '@pyreon/testing'
import { afterEach } from 'vitest'

afterEach(cleanup) // or add '@pyreon/testing/vitest' to setupFiles

test('renders the greeting', () => {
  render(<Greeting name="Ada" />)
  expect(screen.getByText('Hello, Ada')).toBeTruthy()
})
```

`render(ui, options?)` mounts into an isolated container appended to `document.body` and returns bound queries (`getByText`, `getByTestId`, `queryBy*`, `getAllBy*`, `findBy*`) plus `container`, `unmount`, and `debug()`. `screen` exposes the same queries scoped to the whole document.

## Interaction

```tsx
import { render, screen, fireEvent, waitFor } from '@pyreon/testing'

render(<LoginForm />)
fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
await waitFor(() => expect(screen.getByText('Welcome')).toBeTruthy())
```

`fireEvent` dispatches **bubbling** events so they reach Pyreon's delegation root (delegated handlers only fire on events that bubble to the container). `waitFor(cb, { timeout, interval })` polls until `cb` stops throwing. Queries cover `getByText`, `getByTestId`, `getByRole` (implicit + explicit roles, narrow by accessible `name`), `getByLabelText`, `getByPlaceholderText` — each with the `queryBy`/`getAllBy`/`findBy` variants.

## Hooks + matchers + zero-setup

```ts
// vitest.config.ts — auto-cleanup between tests + DOM matchers
export default { test: { setupFiles: ['@pyreon/testing/vitest'] } }
```

```tsx
import { renderHook } from '@pyreon/testing'

const { result, rerender } = renderHook((size) => usePagination(size), { initialProps: 10 })
expect(result.current.pageCount()).toBe(5)
rerender(20) // updates the REACTIVE prop signal — the hook is not re-invoked (Pyreon semantics)
expect(result.current.pageCount()).toBe(3)
```

`renderHook` runs the hook once in a probe component (Pyreon hooks run once); props are a reactive accessor and `rerender` updates the backing signal so `computed`/`effect` derivations re-run. jest-dom-style matchers (`toBeInTheDocument`, `toHaveTextContent`, `toHaveAttribute`, `toHaveClass`, `toBeDisabled`, `toBeChecked`, `toHaveValue`, `toBeVisible`, `toContainElement`, `toHaveFocus`, …) register via `@pyreon/testing/matchers` or the `/vitest` setup file.

## Reactive-native matchers

The differentiator — assertions no DOM-only testing library can express, because they read Pyreon's reactive graph:

```ts
import { expectSignal, expectEffect } from '@pyreon/testing'

expectSignal(total).toHaveRecomputedTimes(1)          // recomputed once, no thrash
expectEffect(logEffect).toReRunWhen(() => qty.set(3))
expectEffect(logEffect).notToReRunWhen(() => theme.set('dark')) // fine-grained: NOT re-run by an unrelated write
```

`toReRunWhen`'s negative form (`notToReRunWhen`) verifies fine-grained precision — that an unrelated write does **not** re-run the effect — which a whole-component re-render model fundamentally can't assert. These require a dev/test build (the reactive graph is tree-shaken in production; the matchers throw a clear error rather than silently pass).

## GC / leak matchers

Collapse the hand-rolled `WeakRef` + two-pass-`gc()` ceremony (and catch subscription leaks) — require `--expose-gc`:

```ts
import { expectGarbageCollected, expectNoReactiveLeak } from '@pyreon/testing'

await expectGarbageCollected(() => makeRow(data))            // GC-eligible after the ref drops?
await expectNoReactiveLeak(() => {                            // mount+unmount leaves no net graph growth
  const { unmount } = render(<List rows={rows} />)
  unmount()
})
```

Run the suite with `--expose-gc` (`execArgv: ['--expose-gc']` in the vitest config's pool options); without it these throw an actionable error rather than silently pass — a leak test that no-ops is worse than none.

## Library helpers (subpaths)

Seven subpaths kill the provider/setup boilerplate for code built on Pyreon's libraries. Each is gated on its **optional peer** (`@pyreon/testing/form` needs `@pyreon/form` installed, etc.) — the main entry stays dependency-light. Every render harness takes a `wrapper` option so providers compose (theme + router + query together); there is deliberately no mega `renderApp`.

| Subpath | API | Peer |
| --- | --- | --- |
| `/form` | `renderForm` (headless `useForm` harness: `fill`/`submit`), `fillForm`/`submitForm` (rendered forms, by accessible label), `expectForm` (`toBeValid`/`toHaveFieldError`/`toBeDirty`/`toHaveValues`, …) | `@pyreon/form` |
| `/ui` | `renderWithTheme` (PyreonUI wrap + reactive `setMode`), `expectComputedStyle` (normalized computed-style assertion), `normalizeCssValue` | `@pyreon/ui-core` |
| `/router` | `renderWithRouter` (async — initial route SETTLED: lazy components + loaders pre-resolved; `navigate()` resolves after commit), `expectRouter` (`toBeAt('/posts/:id')` — pattern or concrete path) | `@pyreon/router` |
| `/store` | `installStoreReset` (afterEach `resetAllStores`), `withFreshStore` (scoped fresh singleton), re-exported `resetStore`/`resetAllStores` | `@pyreon/store` |
| `/i18n` | `renderWithI18n` (I18nProvider wrap + reactive `setLocale` + bound `t()`) | `@pyreon/i18n` |
| `/toast` | `expectToast`/`findToast`/`getToasts`/`clearToasts` (store-level — headless or with a mounted `<Toaster>`) | `@pyreon/toast` |
| `/query` | `renderWithQueryClient` + `createTestQueryClient` (fresh isolated client, retry off, `gcTime: Infinity`) + `setQueryData` passthrough | `@pyreon/query` |

```tsx
import { renderForm, expectForm } from '@pyreon/testing/form'
import { renderWithRouter, expectRouter } from '@pyreon/testing/router'

const { form, fill, submit } = renderForm(() => useForm({ initialValues: { email: '' }, onSubmit }))
fill({ email: 'ada@lovelace.dev' })
await submit()
expectForm(form).toBeValid()

const { router, navigate } = await renderWithRouter(null, { routes, route: '/posts/1' })
expectRouter(router).toBeAt('/posts/:id')
await navigate('/posts/2') // settles guards + loaders + DOM before resolving
```

Honest limit: `expectComputedStyle` normalizes through the engine's computed-style serialization — full color canonicalization needs a real browser; happy-dom's `getComputedStyle` is partial, so class-based computed-style assertions belong in `*.browser.test.tsx`.

## Environment

Works in happy-dom (node) for structural assertions and in a real browser (`@vitest/browser`) for interaction/layout. Because Pyreon uses event delegation, interaction tests belong in a real browser — see the package's own browser smoke tests for the pattern.

MIT
