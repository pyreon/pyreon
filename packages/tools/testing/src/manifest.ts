import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/testing',
  title: 'Testing',
  tagline:
    'Testing-Library-compatible test kit for Pyreon — render/cleanup/renderHook + the full @testing-library/dom surface + reactive-graph matchers',
  description:
    'The official test kit for Pyreon — a thin adapter over `@testing-library/dom` (the shared foundation under React/Vue/Solid/Svelte Testing Library), so the whole Testing-Library API you already know works verbatim, PLUS Pyreon-native additions. Pyreon-native: `render` (mounts a Pyreon VNode via `@pyreon/runtime-dom`), `cleanup`, `renderHook`, and REACTIVE-GRAPH matchers (`expectSignal` / `expectEffect` / `expectGarbageCollected` / `expectNoReactiveLeak`) that read Pyreon\'s fine-grained reactive graph to assert things no DOM-only testing library can express (fire counts, effect re-runs, retained-node leaks). Re-exported verbatim from `@testing-library/dom`: `screen`, `fireEvent`, `waitFor`, `within`, every `getBy*`/`queryBy*`/`findBy*` query, `prettyDOM`, `configure`, etc. — with the ecosystem\'s battle-tested ARIA + accessible-name edge-case handling. Distinct from the PRIVATE framework-internal `@pyreon/test-utils`.',
  category: 'browser',
  peerDeps: ['@pyreon/runtime-dom', '@pyreon/reactivity'],
  features: [
    'render(ui, options?) — mount a Pyreon component, query-bound (Testing-Library API)',
    'cleanup() — unmount all rendered trees (auto-wired via @pyreon/testing/vitest)',
    'renderHook(hook, options?) — test a hook in isolation (runs once, Pyreon semantics)',
    'Full @testing-library/dom surface re-exported verbatim (screen/fireEvent/waitFor/within/queries)',
    'expectSignal / expectEffect — reactive-graph fire-count + re-run matchers',
    'expectGarbageCollected / expectNoReactiveLeak — GC + reactive-leak matchers (need --expose-gc)',
    'jest-dom matchers + auto afterEach(cleanup) via the @pyreon/testing/vitest setup entry',
  ],
  longExample: `import { render, screen, fireEvent, cleanup } from '@pyreon/testing'
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
})`,
  api: [
    {
      name: 'render',
      kind: 'function',
      signature:
        'render(ui: VNodeChild, options?: { container?: HTMLElement; baseElement?: HTMLElement }) => RenderResult',
      summary:
        'Mount a Pyreon VNode into an isolated container (a fresh `<div>` appended to `baseElement`, default `document.body`) via `mount()` from `@pyreon/runtime-dom`, and return a Testing-Library-bound result: the full query set spread in, plus `container`, `baseElement`, `unmount()`, and `debug()` (returns `container.innerHTML`). Synchronous. Registers the result so `cleanup()` can tear it down.',
      example: `const { getByText, unmount, container } = render(<Greeting name="Ada" />)
expect(getByText('Hello, Ada')).toBeInTheDocument()
unmount()`,
      mistakes: [
        'Forgetting to unmount — `render` does NOT self-clean; call `cleanup()` (or add `@pyreon/testing/vitest` to setupFiles for auto `afterEach(cleanup)`), or you leak DOM + reactive subscriptions across tests.',
        'Expecting queries to be scoped to the container — the bound queries resolve from `baseElement` (`document.body`), NOT `container`. This is intentional (matches @testing-library/react) so Portal / Overlay / Modal content rendered OUTSIDE the container is still findable; for container-only assertions use `within(result.container)`.',
        'Awaiting it — `render` is synchronous; there is no promise to await (use `waitFor` for async DOM updates).',
      ],
      seeAlso: ['cleanup', 'renderHook'],
    },
    {
      name: 'cleanup',
      kind: 'function',
      signature: 'cleanup() => void',
      summary:
        'Unmount every live `render()` result (each `unmount()` disposes the tree + removes its container). Snapshots the set first so it is order-independent and idempotent. Synchronous.',
      example: `import { cleanup } from '@pyreon/testing'
afterEach(cleanup)`,
      mistakes: [
        'Assuming it runs automatically — it is NOT auto-registered by the main entry. Auto `afterEach(cleanup)` fires ONLY when you add `@pyreon/testing/vitest` to your vitest `setupFiles` (that entry also extends `expect` with jest-dom matchers); otherwise call `cleanup()` yourself.',
        'Awaiting it — `cleanup` is synchronous.',
      ],
      seeAlso: ['render'],
    },
    {
      name: 'renderHook',
      kind: 'function',
      signature:
        'renderHook<Result, Props = undefined>(hook: (props: () => Props) => Result, options?: { initialProps?: Props }) => { result: { readonly current: Result }; rerender: (props: Props) => void; unmount: () => void }',
      summary:
        'Test a hook in isolation. Mounts a probe component that invokes `hook(() => props())` ONCE, capturing the return into `result.current` (a live getter). `rerender(next)` updates the backing props signal; `unmount()` tears down. Synchronous.',
      example: `const { result, rerender } = renderHook((props) => useDouble(props), { initialProps: 2 })
expect(result.current()).toBe(4)
rerender(3) // updates the props signal; the hook re-reads it only if it reads props() reactively`,
      mistakes: [
        'Expecting `rerender(next)` to RE-INVOKE the hook — the hook runs ONCE (Pyreon components/hooks run once, unlike @testing-library/react). `rerender` only sets the props signal, so a hook sees new props ONLY if it reads `props()` inside a `computed` / `effect`.',
        'Reading `result.current` as a plain value — it is a live getter; a hook that returns a signal/accessor updates through it, but a hook that returns a captured-once value will not.',
      ],
      seeAlso: ['render'],
    },
    {
      name: 'expectSignal',
      kind: 'function',
      signature:
        'expectSignal(target: unknown) => { toHaveChangedTimes(n: number): void; toHaveRecomputedTimes(n: number): void }',
      summary:
        "Assert how many times a signal/computed fired, by reading its node's `fires` count from Pyreon's reactive graph (`getReactiveGraph()`). Catches over-computation / thrash a DOM assertion cannot see. Synchronous; dev/test build only.",
      example: `const total = computed(() => qty() * price())
total()          // materialize
qty.set(2)
expectSignal(total).toHaveRecomputedTimes(1)`,
      mistakes: [
        '`toHaveChangedTimes` and `toHaveRecomputedTimes` are the SAME check (both assert `fires === n`) — they differ only in the error wording. There is no semantic distinction at runtime; pick whichever reads clearer.',
        'Passing a non-reactive value — the target must be a signal/computed (a reactive-graph node); anything else throws `[Pyreon] expectSignal: target is not a reactive node`.',
        'Running against a production build — the reactive graph is tree-shaken out in production (`NODE_ENV === "production"`), so these matchers only work in dev/test.',
        'Counting a computed that was never READ — a lazy computed has zero fires until something materializes it; call `total()` (or mount a reader) before asserting.',
      ],
      seeAlso: ['expectEffect', 'expectNoReactiveLeak'],
    },
    {
      name: 'expectEffect',
      kind: 'function',
      signature:
        'expectEffect(handle: unknown) => { toReRunWhen(action: () => void): void; notToReRunWhen(action: () => void): void }',
      summary:
        "Assert whether an effect re-runs in response to an action. Samples the effect node's `fires` before and after invoking `action()`: `toReRunWhen` requires it grew (ran at least once), `notToReRunWhen` requires it stayed equal. `handle` is the `Effect` object returned by `effect(...)`. Synchronous; dev/test build only.",
      example: `const e = effect(() => { theme() })
expectEffect(e).toReRunWhen(() => theme.set('dark'))
expectEffect(e).notToReRunWhen(() => unrelated.set(1))`,
      mistakes: [
        'Passing something other than the `effect(...)` return value — `handle` must be the `Effect` node; a non-node throws.',
        'Using an ASYNC `action` — it must be synchronous (`() => void`); fires triggered after the synchronous `action()` returns are not captured.',
        'Reading `toReRunWhen` as "exactly once" — it asserts "at least once" (`after > before`); use `expectSignal(...).toHaveChangedTimes` for an exact count.',
      ],
      seeAlso: ['expectSignal', 'expectNoReactiveLeak'],
    },
    {
      name: 'expectGarbageCollected',
      kind: 'function',
      signature: 'expectGarbageCollected(factory: () => object) => Promise<void>',
      summary:
        'ASYNC. Assert an object is reclaimable: `factory()` builds it, the strong ref is dropped, a two-pass GC runs (with a macrotask between passes to finalize DOM-shaped graphs), and it throws if a `WeakRef` to it still resolves (retained = leak). Requires `--expose-gc`.',
      example: `await expectGarbageCollected(() => {
  const view = mountSomething()
  view.unmount()
  return view
})`,
      mistakes: [
        'Not running under `--expose-gc` — without `globalThis.gc` it THROWS an actionable error naming `execArgv: ["--expose-gc"]` (it never silently passes). Configure your vitest pool `execArgv`.',
        'Forgetting to `await` it — it is async; an un-awaited call passes vacuously.',
        'Leaking the object into an outer scope in the `factory` — if a closure/variable outside the factory still references it, the assertion (correctly) fails.',
      ],
      seeAlso: ['expectNoReactiveLeak'],
    },
    {
      name: 'expectNoReactiveLeak',
      kind: 'function',
      signature: 'expectNoReactiveLeak(action: () => void | Promise<void>) => Promise<void>',
      summary:
        "ASYNC. Assert an action (typically a mount + unmount) leaves no retained reactive-graph nodes: GCs to a baseline `getReactiveGraph().nodes.length`, `await`s `action()`, GCs again, and throws if the node count grew and stayed grown. Catches subscription / effect-scope retention leaks. Requires `--expose-gc`.",
      example: `await expectNoReactiveLeak(async () => {
  const { unmount } = render(<Widget />)
  unmount()
})`,
      mistakes: [
        'Not running under `--expose-gc` — throws the same actionable error as `expectGarbageCollected` (never silently passes).',
        'Forgetting to `await` it — it is async.',
        'Expecting it to pinpoint the leak — it only reports that net node growth occurred; use heap-snapshot tooling to attribute it.',
      ],
      seeAlso: ['expectGarbageCollected', 'expectEffect'],
    },
    {
      name: 'Testing Library re-exports',
      kind: 'function',
      signature:
        'screen, fireEvent, waitFor, waitForElementToBeRemoved, within, getByRole, getByText, getByTestId, getBy*/queryBy*/findBy*, prettyDOM, configure, getConfig, getRoles, logRoles, isInaccessible, createEvent, … (verbatim from @testing-library/dom)',
      summary:
        'The full `@testing-library/dom` surface is re-exported VERBATIM — same functions, same signatures, same ARIA + accessible-name edge-case handling as React/Vue/Solid Testing Library. Import `screen`, `fireEvent`, `waitFor`, `within`, and the `getBy*`/`queryBy*`/`findBy*` query families straight from `@pyreon/testing`. Their behavior is documented upstream at testing-library.com.',
      example: `import { screen, fireEvent, waitFor } from '@pyreon/testing'

fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Saved'))`,
      mistakes: [
        'Expecting `findBy*` / `waitFor` to be synchronous — the async query + wait helpers return Promises and must be `await`ed (this is upstream Testing-Library behavior, not Pyreon-specific).',
        'Reaching for `screen` without a prior `render` — `screen` queries `document.body`; nothing is there until a `render()` mounts into it.',
      ],
      seeAlso: ['render', 'cleanup'],
    },
  ],
  gotchas: [
    {
      label: 'Auto-cleanup needs the /vitest setup entry',
      note: 'The main `@pyreon/testing` entry does NOT auto-register `afterEach(cleanup)`. Add `@pyreon/testing/vitest` to your vitest `setupFiles` to wire auto-cleanup AND extend `expect` with jest-dom matchers; otherwise call `cleanup()` manually in `afterEach`.',
    },
    {
      label: 'Queries resolve from baseElement, not container',
      note: '`render()` binds the query set to `baseElement` (`document.body`), so Portal/Overlay/Modal content mounted outside the returned `container` is still findable (matches @testing-library/react). For container-scoped assertions, use `within(result.container)`.',
    },
    {
      label: 'Reactive matchers are dev/test-only',
      note: '`expectSignal` / `expectEffect` read Pyreon\'s reactive graph, which is tree-shaken out under `NODE_ENV === "production"`. They throw on a non-reactive target rather than silently passing. Materialize a lazy computed (call it, or mount a reader) before asserting its fire count.',
    },
    {
      label: 'GC matchers require --expose-gc',
      note: '`expectGarbageCollected` / `expectNoReactiveLeak` need `globalThis.gc`. Pass `execArgv: ["--expose-gc"]` to your vitest pool; without it both throw an actionable error (never a false pass). Both are async — always `await` them.',
    },
    {
      label: 'Distinct from @pyreon/test-utils',
      note: '`@pyreon/testing` is the PUBLIC test kit. `@pyreon/test-utils` is a PRIVATE framework-internal package (initTestConfig, accessInternal, mountReactive, …) — not for app tests.',
    },
  ],
})
