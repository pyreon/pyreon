---
title: "Testing — API Reference"
description: "Testing-Library-compatible test kit for Pyreon — render/cleanup/renderHook + the full @testing-library/dom surface + reactive-graph matchers"
---

# @pyreon/testing — API Reference

> **Generated** from `testing`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [testing](/docs/testing).

The official test kit for Pyreon — a thin adapter over `@testing-library/dom` (the shared foundation under React/Vue/Solid/Svelte Testing Library), so the whole Testing-Library API you already know works verbatim, PLUS Pyreon-native additions. Pyreon-native: `render` (mounts a Pyreon VNode via `@pyreon/runtime-dom`), `cleanup`, `renderHook`, and REACTIVE-GRAPH matchers (`expectSignal` / `expectEffect` / `expectGarbageCollected` / `expectNoReactiveLeak`) that read Pyreon's fine-grained reactive graph to assert things no DOM-only testing library can express (fire counts, effect re-runs, retained-node leaks). Re-exported verbatim from `@testing-library/dom`: `screen`, `fireEvent`, `waitFor`, `within`, every `getBy*`/`queryBy*`/`findBy*` query, `prettyDOM`, `configure`, etc. — with the ecosystem's battle-tested ARIA + accessible-name edge-case handling. PLUS library-specific helper SUBPATHS (each gated on its optional peer, so the main entry stays dependency-light): `@pyreon/testing/form` (`renderForm`/`fillForm`/`submitForm`/`expectForm`), `/ui` (`renderWithTheme`/`expectComputedStyle`), `/router` (`renderWithRouter`/`expectRouter`), `/store` (`installStoreReset`/`withFreshStore`), `/i18n` (`renderWithI18n`), `/toast` (`expectToast`/`findToast`/`clearToasts`), `/query` (`renderWithQueryClient`/`createTestQueryClient`). Every render harness takes a `wrapper` option — compose providers (theme+router+query) instead of a mega renderApp. Distinct from the PRIVATE framework-internal `@pyreon/test-utils`.

> **Peer dependencies:** `@pyreon/runtime-dom`, `@pyreon/reactivity` — install alongside this package.

## Features

- render(ui, options?) — mount a Pyreon component, query-bound (Testing-Library API)
- cleanup() — unmount all rendered trees (auto-wired via @pyreon/testing/vitest)
- renderHook(hook, options?) — test a hook in isolation (runs once, Pyreon semantics)
- Full @testing-library/dom surface re-exported verbatim (screen/fireEvent/waitFor/within/queries)
- expectSignal / expectEffect — reactive-graph fire-count + re-run matchers
- expectGarbageCollected / expectNoReactiveLeak — GC + reactive-leak matchers (need --expose-gc)
- jest-dom matchers + auto afterEach(cleanup) via the @pyreon/testing/vitest setup entry
- /form — renderForm (headless useForm harness), fillForm/submitForm (rendered forms, by label), expectForm fluent assertions
- /ui — renderWithTheme (PyreonUI wrap + reactive setMode), expectComputedStyle (normalized computed-style assertion)
- /router — renderWithRouter (initial route SETTLED: lazy components + loaders pre-resolved), navigate() that settles, expectRouter
- /store — installStoreReset (afterEach resetAllStores) + withFreshStore (scoped fresh singleton)
- /i18n — renderWithI18n (I18nProvider wrap + reactive setLocale + bound t())
- /toast — expectToast/findToast/getToasts/clearToasts (store-level, works headless or with a mounted &lt;Toaster&gt;)
- /query — renderWithQueryClient + createTestQueryClient (fresh isolated client, retry off, gcTime Infinity)

## Complete example

A full, end-to-end usage of the package:

```tsx
import { render, screen, fireEvent, cleanup } from '@pyreon/testing'
import { signal } from '@pyreon/reactivity'

// Testing-Library API works exactly as you know it:
test('counter increments', () => {
  render(<Counter />)
  fireEvent.click(screen.getByRole('button', { name: 'Increment' }))
  expect(screen.getByText('Count: 1')).toBeInTheDocument()
})

// Auto-cleanup: add '@pyreon/testing/vitest' to vitest setupFiles,
// or call cleanup() yourself in afterEach.
afterEach(cleanup)

// Reactive-graph matchers — assertions a DOM-only library cannot make:
import { expectSignal, expectEffect, expectNoReactiveLeak } from '@pyreon/testing'
import { computed, effect } from '@pyreon/reactivity'

test('computed recomputes exactly once per change', () => {
  const qty = signal(1)
  const total = computed(() => qty() * 10)
  total() // materialize
  qty.set(2)
  expectSignal(total).toHaveRecomputedTimes(1)  // no thrash
})

test('effect re-runs only when its dep changes', () => {
  const a = signal(0), b = signal(0)
  const e = effect(() => { a() })
  expectEffect(e).toReRunWhen(() => a.set(1))
  expectEffect(e).notToReRunWhen(() => b.set(1))
})
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`render`](#render) | function | Mount a Pyreon VNode into an isolated container (a fresh `<div>` appended to `baseElement`, default `document.body`) via |
| [`cleanup`](#cleanup) | function | Unmount every live `render()` result (each `unmount()` disposes the tree + removes its container). |
| [`renderHook`](#renderhook) | function | Test a hook in isolation. |
| [`expectSignal`](#expectsignal) | function | Assert how many times a signal/computed fired, by reading its node's `fires` count from Pyreon's reactive graph (`getRea |
| [`expectEffect`](#expecteffect) | function | Assert whether an effect re-runs in response to an action. |
| [`expectGarbageCollected`](#expectgarbagecollected) | function | ASYNC. |
| [`expectNoReactiveLeak`](#expectnoreactiveleak) | function | ASYNC. |
| [`Testing Library re-exports`](#testing-library-re-exports) | function | The full `@testing-library/dom` surface is re-exported VERBATIM — same functions, same signatures, same ARIA + accessibl |
| [`renderForm`](#renderform) | function | renderHook-style harness for `useForm` — runs your setup inside a probe component (no hand-written form component) and r |
| [`fillForm`](#fillform) | function | Fill a REAL rendered form by ACCESSIBLE LABEL: keys are `getByLabelText` matchers (register()'s `labelProps()` wires the |
| [`submitForm`](#submitform) | function | Submit a REAL rendered form: locates the `<form>` element (scope itself, a descendant, or an ancestor via `closest`) and |
| [`expectForm`](#expectform) | function | Fluent assertions over a `FormState` (the package's `expectSignal` convention — no `expect.extend`). |
| [`renderWithTheme`](#renderwiththeme) | function | Render `ui` wrapped in `<PyreonUI theme mode>` so rocketstyle / styler / ui-components resolve a real theme. |
| [`expectComputedStyle`](#expectcomputedstyle) | function | Computed-style assertion with VALUE NORMALIZATION on both sides: each value round-trips through `getComputedStyle` on a  |
| [`renderWithRouter`](#renderwithrouter) | function | ASYNC render harness for `@pyreon/router`. |
| [`expectRouter`](#expectrouter) | function | Fluent current-route assertion. |
| [`installStoreReset`](#installstorereset) | function | Registers `afterEach(resetAllStores)` for the current test file (or suite-wide from a vitest `setupFiles` module): every |
| [`withFreshStore`](#withfreshstore) | function | Scoped isolation for ONE store: disposes any pre-existing instance with the same id, hands `fn` a GUARANTEED-FRESH insta |
| [`renderWithI18n`](#renderwithi18n) | function | Render `ui` under `<I18nProvider>` — pass `locale` + `messages` (any `createI18n` option flows through) or a pre-built ` |
| [`expectToast`](#expecttoast) | function | Toast assertions against the STORE (`toast()` works headless, so these work with OR without a mounted `<Toaster>` — no p |
| [`renderWithQueryClient`](#renderwithqueryclient) | function | Render `ui` under `<QueryClientProvider>` with a FRESH ISOLATED test client per call (the TanStack testing convention):  |

## API

### render `function`

```ts
render(ui: VNodeChild, options?: { container?: HTMLElement; baseElement?: HTMLElement }) => RenderResult
```

Mount a Pyreon VNode into an isolated container (a fresh `<div>` appended to `baseElement`, default `document.body`) via `mount()` from `@pyreon/runtime-dom`, and return a Testing-Library-bound result: the full query set spread in, plus `container`, `baseElement`, `unmount()`, and `debug()` (returns `container.innerHTML`). Synchronous. Registers the result so `cleanup()` can tear it down.

**Example**

```tsx
const { getByText, unmount, container } = render(<Greeting name="Ada" />)
expect(getByText('Hello, Ada')).toBeInTheDocument()
unmount()
```

**Common mistakes**

- Forgetting to unmount — `render` does NOT self-clean; call `cleanup()` (or add `@pyreon/testing/vitest` to setupFiles for auto `afterEach(cleanup)`), or you leak DOM + reactive subscriptions across tests.
- Expecting queries to be scoped to the container — the bound queries resolve from `baseElement` (`document.body`), NOT `container`. This is intentional (matches @testing-library/react) so Portal / Overlay / Modal content rendered OUTSIDE the container is still findable; for container-only assertions use `within(result.container)`.
- Awaiting it — `render` is synchronous; there is no promise to await (use `waitFor` for async DOM updates).

**See also:** `cleanup` · `renderHook`

---

### cleanup `function`

```ts
cleanup() => void
```

Unmount every live `render()` result (each `unmount()` disposes the tree + removes its container). Snapshots the set first so it is order-independent and idempotent. Synchronous.

**Example**

```tsx
import { cleanup } from '@pyreon/testing'
afterEach(cleanup)
```

**Common mistakes**

- Assuming it runs automatically — it is NOT auto-registered by the main entry. Auto `afterEach(cleanup)` fires ONLY when you add `@pyreon/testing/vitest` to your vitest `setupFiles` (that entry also extends `expect` with jest-dom matchers); otherwise call `cleanup()` yourself.
- Awaiting it — `cleanup` is synchronous.

**See also:** `render`

---

### renderHook `function`

```ts
renderHook<Result, Props = undefined>(hook: (props: () => Props) => Result, options?: { initialProps?: Props }) => { result: { readonly current: Result }; rerender: (props: Props) => void; unmount: () => void }
```

Test a hook in isolation. Mounts a probe component that invokes `hook(() => props())` ONCE, capturing the return into `result.current` (a live getter). `rerender(next)` updates the backing props signal; `unmount()` tears down. Synchronous.

**Example**

```tsx
const { result, rerender } = renderHook((props) => useDouble(props), { initialProps: 2 })
expect(result.current()).toBe(4)
rerender(3) // updates the props signal; the hook re-reads it only if it reads props() reactively
```

**Common mistakes**

- Expecting `rerender(next)` to RE-INVOKE the hook — the hook runs ONCE (Pyreon components/hooks run once, unlike @testing-library/react). `rerender` only sets the props signal, so a hook sees new props ONLY if it reads `props()` inside a `computed` / `effect`.
- Reading `result.current` as a plain value — it is a live getter; a hook that returns a signal/accessor updates through it, but a hook that returns a captured-once value will not.

**See also:** `render`

---

### expectSignal `function`

```ts
expectSignal(target: unknown) => { toHaveChangedTimes(n: number): void; toHaveRecomputedTimes(n: number): void }
```

Assert how many times a signal/computed fired, by reading its node's `fires` count from Pyreon's reactive graph (`getReactiveGraph()`). Catches over-computation / thrash a DOM assertion cannot see. Synchronous; dev/test build only.

**Example**

```tsx
const total = computed(() => qty() * price())
total()          // materialize
qty.set(2)
expectSignal(total).toHaveRecomputedTimes(1)
```

**Common mistakes**

- `toHaveChangedTimes` and `toHaveRecomputedTimes` are the SAME check (both assert `fires === n`) — they differ only in the error wording. There is no semantic distinction at runtime; pick whichever reads clearer.
- Passing a non-reactive value — the target must be a signal/computed (a reactive-graph node); anything else throws `[Pyreon] expectSignal: target is not a reactive node`.
- Running against a production build — the reactive graph is tree-shaken out in production (`NODE_ENV === "production"`), so these matchers only work in dev/test.
- Counting a computed that was never READ — a lazy computed has zero fires until something materializes it; call `total()` (or mount a reader) before asserting.

**See also:** `expectEffect` · `expectNoReactiveLeak`

---

### expectEffect `function`

```ts
expectEffect(handle: unknown) => { toReRunWhen(action: () => void): void; notToReRunWhen(action: () => void): void }
```

Assert whether an effect re-runs in response to an action. Samples the effect node's `fires` before and after invoking `action()`: `toReRunWhen` requires it grew (ran at least once), `notToReRunWhen` requires it stayed equal. `handle` is the `Effect` object returned by `effect(...)`. Synchronous; dev/test build only.

**Example**

```tsx
const e = effect(() => { theme() })
expectEffect(e).toReRunWhen(() => theme.set('dark'))
expectEffect(e).notToReRunWhen(() => unrelated.set(1))
```

**Common mistakes**

- Passing something other than the `effect(...)` return value — `handle` must be the `Effect` node; a non-node throws.
- Using an ASYNC `action` — it must be synchronous (`() => void`); fires triggered after the synchronous `action()` returns are not captured.
- Reading `toReRunWhen` as "exactly once" — it asserts "at least once" (`after > before`); use `expectSignal(...).toHaveChangedTimes` for an exact count.

**See also:** `expectSignal` · `expectNoReactiveLeak`

---

### expectGarbageCollected `function`

```ts
expectGarbageCollected(factory: () => object) => Promise<void>
```

ASYNC. Assert an object is reclaimable: `factory()` builds it, the strong ref is dropped, a two-pass GC runs (with a macrotask between passes to finalize DOM-shaped graphs), and it throws if a `WeakRef` to it still resolves (retained = leak). Requires `--expose-gc`.

**Example**

```tsx
await expectGarbageCollected(() => {
  const view = mountSomething()
  view.unmount()
  return view
})
```

**Common mistakes**

- Not running under `--expose-gc` — without `globalThis.gc` it THROWS an actionable error naming `execArgv: ["--expose-gc"]` (it never silently passes). Configure your vitest pool `execArgv`.
- Forgetting to `await` it — it is async; an un-awaited call passes vacuously.
- Leaking the object into an outer scope in the `factory` — if a closure/variable outside the factory still references it, the assertion (correctly) fails.

**See also:** `expectNoReactiveLeak`

---

### expectNoReactiveLeak `function`

```ts
expectNoReactiveLeak(action: () => void | Promise<void>) => Promise<void>
```

ASYNC. Assert an action (typically a mount + unmount) leaves no retained reactive-graph nodes: GCs to a baseline `getReactiveGraph().nodes.length`, `await`s `action()`, GCs again, and throws if the node count grew and stayed grown. Catches subscription / effect-scope retention leaks. Requires `--expose-gc`.

**Example**

```tsx
await expectNoReactiveLeak(async () => {
  const { unmount } = render(<Widget />)
  unmount()
})
```

**Common mistakes**

- Not running under `--expose-gc` — throws the same actionable error as `expectGarbageCollected` (never silently passes).
- Forgetting to `await` it — it is async.
- Expecting it to pinpoint the leak — it only reports that net node growth occurred; use heap-snapshot tooling to attribute it.

**See also:** `expectGarbageCollected` · `expectEffect`

---

### Testing Library re-exports `function`

```ts
screen, fireEvent, waitFor, waitForElementToBeRemoved, within, getByRole, getByText, getByTestId, getBy*/queryBy*/findBy*, prettyDOM, configure, getConfig, getRoles, logRoles, isInaccessible, createEvent, … (verbatim from @testing-library/dom)
```

The full `@testing-library/dom` surface is re-exported VERBATIM — same functions, same signatures, same ARIA + accessible-name edge-case handling as React/Vue/Solid Testing Library. Import `screen`, `fireEvent`, `waitFor`, `within`, and the `getBy*`/`queryBy*`/`findBy*` query families straight from `@pyreon/testing`. Their behavior is documented upstream at testing-library.com.

**Example**

```tsx
import { screen, fireEvent, waitFor } from '@pyreon/testing'

fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Saved'))
```

**Common mistakes**

- Expecting `findBy*` / `waitFor` to be synchronous — the async query + wait helpers return Promises and must be `await`ed (this is upstream Testing-Library behavior, not Pyreon-specific).
- Reaching for `screen` without a prior `render` — `screen` queries `document.body`; nothing is there until a `render()` mounts into it.

**See also:** `render` · `cleanup`

---

### renderForm `function`

```ts
renderForm<TValues>(setup: () => FormState<TValues>) => { form: FormState<TValues>; fill: (values: Partial<TValues>) => void; submit: () => Promise<void>; unmount: () => void } (from '@pyreon/testing/form')
```

renderHook-style harness for `useForm` — runs your setup inside a probe component (no hand-written form component) and returns the `form` plus two drivers. `fill(values)` drives the form MODEL: per entry it runs `setFieldValue` + `setTouched` (mimicking type-then-blur) — no DOM events. `submit()` awaits the FULL `handleSubmit` pipeline (validators, focus-first-error, `onSubmit`). Synchronous setup; `submit` is async. Import from the `@pyreon/testing/form` subpath (optional peer `@pyreon/form`).

**Example**

```tsx
import { renderForm, expectForm } from '@pyreon/testing/form'

const { form, fill, submit } = renderForm(() =>
  useForm({ initialValues: { email: '' }, validators: { email: required }, onSubmit }),
)
fill({ email: 'ada@lovelace.dev' })
await submit()
expectForm(form).toBeValid()
```

**Common mistakes**

- `fill()` on an unregistered field — throws an actionable error naming the known fields. Declare the field in `useForm({ initialValues })` or register it via `form.registerField()` first.
- Expecting `fill()` to fire DOM events — it drives the MODEL (`setFieldValue` + `setTouched`). For a RENDERED form (register()-bound inputs) use `fillForm(container, values)` instead.
- Not awaiting `submit()` — the submit pipeline (async validators + `onSubmit`) settles asynchronously; assertions before the await race it.
- Asserting field errors before any validator ran — `validateOn` defaults to 'blur'; a freshly-created form has no errors yet. `fill()` marks fields touched but blur-validation is driven by events — `await submit()` (or `await form.validate()`) to force full validation.
- Reading `form` after `unmount()` — the probe is disposed; signals still read but the form no longer participates in a component tree.

**See also:** `expectForm` · `fillForm` · `renderHook`

---

### fillForm `function`

```ts
fillForm(scope: HTMLElement, values: Record<string, string | number | boolean | File | File[]>) => void (from '@pyreon/testing/form')
```

Fill a REAL rendered form by ACCESSIBLE LABEL: keys are `getByLabelText` matchers (register()'s `labelProps()` wires the label↔input association; plain `<label for>` works too). Fires real `input` + `blur` events so `register()`'s handlers run — validation (default `validateOn: 'blur'`), dirty + touched tracking. Checkboxes/radios take a boolean (clicked only on state mismatch); file inputs take `File | File[]`; numbers are stringified. Synchronous.

**Example**

```tsx
render(<SignupForm />)
fillForm(document.body, { Email: 'ada@lovelace.dev', 'Accept terms': true })
await submitForm(document.body)
```

**Common mistakes**

- Keying by FIELD NAME instead of LABEL TEXT — keys resolve via `getByLabelText`, not `register()` field keys (register ids are opaque `createUniqueId()`s). An unlabelled input is unreachable — add a `<label {...form.labelProps(field)}>` (which is the a11y-correct markup anyway).
- Passing a string to a checkbox (throws — pass a boolean) or a non-File to a file input (throws — pass File | File[]).
- Asserting async-validator errors immediately — `fillForm` is synchronous; blur-triggered ASYNC validators settle later (`await waitFor(...)` / `expect.poll`).
- Using it for an unrendered form — that is `renderForm().fill()` territory; `fillForm` needs real inputs in the DOM.

**See also:** `submitForm` · `renderForm`

---

### submitForm `function`

```ts
submitForm(scope: HTMLElement) => Promise<void> (from '@pyreon/testing/form')
```

Submit a REAL rendered form: locates the `<form>` element (scope itself, a descendant, or an ancestor via `closest`) and fires a real `submit` event — exactly what `<Form of={form}>` wires to `handleSubmit`. Resolves after one macrotask so sync validators + a sync `onSubmit` settle; throws an actionable error when no `<form>` exists in scope.

**Example**

```tsx
fillForm(container, { Email: 'ada@lovelace.dev' })
await submitForm(container)
```

**Common mistakes**

- No `<form>` element — fields rendered without `<Form of={form}>` (or a plain `<form>`) throw; the submit event needs a form to dispatch on.
- Asserting an ASYNC `onSubmit`/validator result right after the await — only one macrotask is flushed; wrap the assertion in `waitFor(...)`.
- Calling `form.handleSubmit()` directly when you meant to test the DOM wiring — `submitForm` proves the event→handler path a direct call skips.

**See also:** `fillForm` · `renderForm`

---

### expectForm `function`

```ts
expectForm(form: FormState) => { toBeValid(); toBeInvalid(); toHaveFieldError(field, match?); toHaveNoFieldError(field); toBeDirty(); toBePristine(); toHaveValues(partial) } (from '@pyreon/testing/form')
```

Fluent assertions over a `FormState` (the package's `expectSignal` convention — no `expect.extend`). `toBeValid`/`toBeInvalid` read `form.isValid()` (reflects validators that have RUN); `toHaveFieldError(field, match?)` asserts a current error, optionally matching a string (exact) or RegExp; `toBeDirty`/`toBePristine` read `isDirty()`; `toHaveValues(partial)` subset-compares current values (===, JSON deep-equal for objects). All throw `[Pyreon]`-prefixed errors naming the actual state.

**Example**

```tsx
await submit()
expectForm(form).toHaveFieldError('email', /invalid/)
expectForm(form).toBeDirty()
expectForm(form).toHaveValues({ email: 'ada@lovelace.dev' })
```

**Common mistakes**

- `toBeValid()` on a form whose validators never ran — a fresh form has no errors so it IS "valid"; force validation first (`await form.validate()` or a submit) when you mean "the data passes the validators".
- String `match` is an EXACT comparison, not substring — use a RegExp (`/invalid/`) for partial matching.
- `toHaveValues` is a SUBSET compare — extra fields never fail it; assert the full object via `expect(form.values()).toEqual(...)` when you need exhaustiveness.

**See also:** `renderForm` · `fillForm`

---

### renderWithTheme `function`

```ts
renderWithTheme(ui: VNodeChild, options?: { theme?; mode?: 'light' | 'dark' | 'system'; wrapper?; container?; baseElement? }) => RenderResult & { setMode(mode): void; mode(): ThemeModeInput } (from '@pyreon/testing/ui')
```

Render `ui` wrapped in `<PyreonUI theme mode>` so rocketstyle / styler / ui-components resolve a real theme. `mode` is backed by an internal signal passed as a getter — `setMode('dark')` flips REACTIVELY (components re-style in place, no remount). `wrapper` composes an OUTER provider (router, query) around the tree. Import from `@pyreon/testing/ui` (optional peer `@pyreon/ui-core`).

**Example**

```tsx
const { getByRole, setMode } = renderWithTheme(<Button state="primary">Go</Button>, { theme })
setMode('dark') // reactive re-style — same element, new classes
```

**Common mistakes**

- Omitting `theme` at the root — PyreonUI falls back to `{}`, so styled components see theme fields as `undefined` (no crash, wrong styles). Pass a real theme for style assertions.
- Expecting `setMode` to remount — it flips a signal; element identity is preserved (assert on the SAME node).
- Nesting a second PyreonUI in `ui` with its own mode — the inner provider wins for its subtree; `setMode` only drives the harness-level provider.

**See also:** `expectComputedStyle` · `render`

---

### expectComputedStyle `function`

```ts
expectComputedStyle(element: Element, expected: Record<string, string | number>) => void — plus normalizeCssValue(property, value) (from '@pyreon/testing/ui')
```

Computed-style assertion with VALUE NORMALIZATION on both sides: each value round-trips through `getComputedStyle` on a body-attached probe, so in a real browser `'red'`, `'#ff0000'` and `'rgb(255, 0, 0)'` compare equal regardless of how the engine serializes. Accepts camelCase or kebab-case property names. Values the engine REJECTS fall back to trimmed-lowercase raw comparison (graceful degradation under happy-dom's partial parser). Throws a `[Pyreon]`-prefixed diff (raw + normalized, both sides).

**Example**

```tsx
expectComputedStyle(button, { color: 'red', fontWeight: 700 })
```

**Common mistakes**

- Relying on it in happy-dom for CLASS-based styles — happy-dom's `getComputedStyle` is partial (cascade/inheritance/media queries incomplete), so class-rule assertions can false-negative there. Computed-style assertions belong in `*.browser.test.tsx` (real Chromium); in happy-dom assert structure (class presence) instead.
- Expecting RELATIVE units to match — computed serialization resolves `em`/`rem` against the PROBE's body-level context, not your element's. Use absolute expectations (`px`, numeric weights, color functions).
- jest-dom overlap: `toHaveStyle` exists for inline-style-ish checks; this helper is specifically for COMPUTED values with cross-format color normalization.

**See also:** `renderWithTheme`

---

### renderWithRouter `function`

```ts
renderWithRouter(ui: VNodeChild | null, options: { routes?: RouteRecord[]; route?: string; mode?: 'hash' | 'history'; router?: Router; wrapper?; container?; baseElement? }) => Promise<RenderResult & { router: Router; navigate(path): Promise<NavigationResult> }> (from '@pyreon/testing/router')
```

ASYNC render harness for `@pyreon/router`. Creates a router pinned to `route` (default `'/'`), then `await router.preload(route)` — the SSR-handler contract: lazy route components resolved into the cache AND the matched chain's loaders run — so the FIRST render shows final content (`useLoaderData()` populated, no loading fallbacks). Mounts `ui` inside `<RouterProvider>` (pass `null` for a bare `<RouterView/>`); `unmount()` destroys the router. `navigate(path)` = `router.push` — resolves with `NavigationResult` AFTER guards + loaders + DOM commit.

**Example**

```tsx
const { router, navigate, getByText } = await renderWithRouter(null, {
  routes: [{ path: '/posts/:id', component: Post, loader: fetchPost }],
  route: '/posts/1',
})
expectRouter(router).toBeAt('/posts/:id')
await navigate('/posts/2')
```

**Common mistakes**

- Not awaiting `renderWithRouter` itself — it is ASYNC (initial lazy components + loaders resolve before mount); an un-awaited call hands you a Promise, not a render result.
- Not awaiting `navigate()` — assertions race the guards/loaders pipeline; the promise resolves only after the DOM committed.
- Ignoring the `NavigationResult` — `'cancelled'` (guard/blocker refused) and `'superseded'` (a newer navigation won) resolve WITHOUT an error; assert the result when the test depends on the navigation landing.
- Passing both `routes` and `router` — `router` wins and `routes` is ignored; a pre-built router must already carry its route table.
- Reusing one router across tests — RouterProvider `destroy()`s it on unmount; create per test (the default path does).

**See also:** `expectRouter` · `render`

---

### expectRouter `function`

```ts
expectRouter(router: Router) => { toBeAt(expected: string): void; notToBeAt(expected: string): void } (from '@pyreon/testing/router')
```

Fluent current-route assertion. `expected` matches either the CONCRETE path (`'/posts/1'`) or any matched record's PATTERN (`'/posts/:id'`) — so tests can assert the route SHAPE without hardcoding params. Failure messages name the current path + the matched pattern chain.

**Example**

```tsx
expectRouter(router).toBeAt('/posts/:id')
expectRouter(router).notToBeAt('/login')
```

**Common mistakes**

- Asserting mid-navigation — `currentRoute` only flips after the navigation COMMITS; `await navigate(...)` first.
- Query strings — `toBeAt` compares the resolved `path` (no search params); assert query state via `router.currentRoute().query`.

**See also:** `renderWithRouter`

---

### installStoreReset `function`

```ts
installStoreReset() => void (from '@pyreon/testing/store')
```

Registers `afterEach(resetAllStores)` for the current test file (or suite-wide from a vitest `setupFiles` module): every `defineStore` singleton is DISPOSED (effectScope stopped, plugin cleanups run) + dropped between tests, so neither state NOR setup-scope effects leak across tests. Composes `@pyreon/store`'s own `resetAllStores` (which disposes since the same PR that shipped this helper). Import from `@pyreon/testing/store` (optional peers `@pyreon/store` + `vitest`).

**Example**

```tsx
import { installStoreReset } from '@pyreon/testing/store'
installStoreReset() // top of the test file
test('a', () => { useCart().store.add(item) })
test('b', () => { /* fresh cart here */ })
```

**Common mistakes**

- Calling it INSIDE a `test()` — `afterEach` must be registered at file/describe scope (vitest collection phase), not during a test run.
- Expecting references captured in test A to work in test B — the reset DISPOSES the old instance; re-call `useStore()` per test (it rebuilds from setup).
- Using it for per-component state — `defineStore` is app-global by design; per-tree state should be `signal()` + context, which needs no reset.

**See also:** `withFreshStore`

---

### withFreshStore `function`

```ts
withFreshStore<TStore extends { id: string }, TReturn>(useStore: () => TStore, fn: (store: TStore) => TReturn) => TReturn (from '@pyreon/testing/store')
```

Scoped isolation for ONE store: disposes any pre-existing instance with the same id, hands `fn` a GUARANTEED-FRESH instance, and disposes it afterwards — even when `fn` throws, and (async-aware) after a returned promise settles. Other stores are untouched (unlike `resetAllStores`). Returns `fn`'s result.

**Example**

```tsx
await withFreshStore(useCart, async (cart) => {
  cart.store.items.set([item])
  expect(cart.state.items).toHaveLength(1)
}) // cart disposed — next useCart() rebuilds
```

**Common mistakes**

- Holding the `store` reference after the callback — it is DISPOSED on exit; a later `useStore()` returns a NEW instance.
- Forgetting to await the async form — disposal is chained onto the promise; an un-awaited call can leak the fresh instance into the next assertion.
- Assuming other stores are reset too — only the one id is touched; use `installStoreReset()` / `resetAllStores()` for registry-wide isolation.

**See also:** `installStoreReset`

---

### renderWithI18n `function`

```ts
renderWithI18n(ui: VNodeChild, options: { locale?; messages?; fallbackLocale?; i18n?: I18nInstance; wrapper?; container?; baseElement? }) => RenderResult & { i18n: I18nInstance; t: I18nInstance['t']; setLocale(locale): void } (from '@pyreon/testing/i18n')
```

Render `ui` under `<I18nProvider>` — pass `locale` + `messages` (any `createI18n` option flows through) or a pre-built `i18n` instance. Returns the instance, a bound `t()` for assertions, and `setLocale()` — locale flips are reactive (translated text patches in place, no remount). Import from `@pyreon/testing/i18n` (optional peer `@pyreon/i18n`).

**Example**

```tsx
const { getByText, setLocale, t } = renderWithI18n(<Nav />, {
  locale: 'en',
  messages: { en: { home: 'Home' }, cs: { home: 'Domů' } },
})
setLocale('cs')
getByText(t('home')) // 'Domů'
```

**Common mistakes**

- Passing neither `locale` nor `i18n` — throws an actionable error; the provider needs an instance.
- Async `loader`-based namespaces — `renderWithI18n` does not await `loadNamespace`; `await i18n.loadNamespace(...)` yourself (or use static `messages`, the test-friendly path).
- Asserting via a stale string after `setLocale` — assert through the bound `t()` (it reads the CURRENT locale) or re-query the DOM.

**See also:** `render`

---

### expectToast `function`

```ts
expectToast(match?: string | RegExp, options?: { type?: ToastType; includeExiting?: boolean }) => Toast — plus findToast(match?, options?) => Promise<Toast>, getToasts(options?) => Toast[], clearToasts() => void (from '@pyreon/testing/toast')
```

Toast assertions against the STORE (`toast()` works headless, so these work with OR without a mounted `<Toaster>` — no portal traversal). `expectToast` asserts a matching toast exists NOW (substring or RegExp against string `message`/`description`, optional `type` filter; soft-dismissed `exiting` toasts excluded unless `includeExiting`) and returns it; failure lists the current toasts. `findToast` is the `waitFor`-wrapped async form for toasts raised by async flows. `clearToasts()` hard-resets the store incl. auto-dismiss timers — call it in `afterEach`.

**Example**

```tsx
saveProfile() // raises toast.success('Profile saved')
expectToast(/saved/i, { type: 'success' })
await findToast(/synced/)   // async producer
afterEach(clearToasts)
```

**Common mistakes**

- Forgetting `clearToasts()` between tests — the store is module-level; leftover toasts + auto-dismiss timers bleed across tests.
- String/RegExp matching a VNODE message — only STRING `message`/`description` are matched (VNodes are labelled `<VNode message>` in the failure listing); assert VNode toasts via DOM queries (`screen.getByText` — the Toaster host is in `document.body`, which `render()`-bound queries cover).
- Using `expectToast` for a toast raised asynchronously — it asserts NOW; use `await findToast(...)`.
- A soft-dismissed toast 'still existing' — `toast.dismiss()` flips it to `exiting` (still in the store for the leave animation); matchers exclude it by default, `{ includeExiting: true }` opts in.

**See also:** `render`

---

### renderWithQueryClient `function`

```ts
renderWithQueryClient(ui: VNodeChild, options?: { client?: QueryClient; wrapper?; container?; baseElement? }) => RenderResult & { client: QueryClient; setQueryData: QueryClient['setQueryData'] } — plus createTestQueryClient(config?) => QueryClient (from '@pyreon/testing/query')
```

Render `ui` under `<QueryClientProvider>` with a FRESH ISOLATED test client per call (the TanStack testing convention): `retry: false` for queries AND mutations (failures fail NOW instead of retry-looping past the test timeout) + `gcTime: Infinity` (no GC timers keeping the process alive). `setQueryData` is a bound passthrough for seeding/patching cache state. `createTestQueryClient(config)` builds the same client standalone — your `defaultOptions` merge OVER the test defaults. Import from `@pyreon/testing/query` (optional peer `@pyreon/query`).

**Example**

```tsx
const { setQueryData, findByText } = renderWithQueryClient(<Todos />)
setQueryData(['todos'], [{ id: 1, title: 'write tests' }])
await findByText('write tests')
```

**Common mistakes**

- Sharing one client across tests — cache state (and error state) bleeds; take the default fresh-client path, or create per test.
- Expecting retries — the test client sets `retry: false`; a test that EXERCISES retry behavior must override `defaultOptions.queries.retry` explicitly.
- Seeding AFTER the component mounted with `staleTime: 0` and asserting no refetch — `setQueryData` marks data fresh at write time, but an already-mounted observer may have a fetch in flight; seed BEFORE render (create the client via `createTestQueryClient`, seed, pass as `client`) for deterministic first paint.

**See also:** `render`

---

## Package-level notes

> **Auto-cleanup needs the /vitest setup entry:** The main `@pyreon/testing` entry does NOT auto-register `afterEach(cleanup)`. Add `@pyreon/testing/vitest` to your vitest `setupFiles` to wire auto-cleanup AND extend `expect` with jest-dom matchers; otherwise call `cleanup()` manually in `afterEach`.

> **Queries resolve from baseElement, not container:** `render()` binds the query set to `baseElement` (`document.body`), so Portal/Overlay/Modal content mounted outside the returned `container` is still findable (matches @testing-library/react). For container-scoped assertions, use `within(result.container)`.

> **Reactive matchers are dev/test-only:** `expectSignal` / `expectEffect` read Pyreon's reactive graph, which is tree-shaken out under `NODE_ENV === "production"`. They throw on a non-reactive target rather than silently passing. Materialize a lazy computed (call it, or mount a reader) before asserting its fire count.

> **GC matchers require --expose-gc:** `expectGarbageCollected` / `expectNoReactiveLeak` need `globalThis.gc`. Pass `execArgv: ["--expose-gc"]` to your vitest pool; without it both throw an actionable error (never a false pass). Both are async — always `await` them.

> **Library helpers live on subpaths, gated on optional peers:** The `/form` `/ui` `/router` `/store` `/i18n` `/toast` `/query` helpers are NOT re-exported from the main entry — each subpath statically imports its library, which is an OPTIONAL peer. Import `@pyreon/testing/form` only when `@pyreon/form` is installed; the main entry stays dependency-light. Compose providers via each harness's `wrapper` option (theme+router+query together) — there is deliberately no mega `renderApp`.

> **Distinct from @pyreon/test-utils:** `@pyreon/testing` is the PUBLIC test kit. `@pyreon/test-utils` is a PRIVATE framework-internal package (initTestConfig, accessInternal, mountReactive, …) — not for app tests.
