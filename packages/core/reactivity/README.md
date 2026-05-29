# @pyreon/reactivity

Standalone fine-grained reactivity primitives — signals, computeds, effects, stores, resources, scopes.

`@pyreon/reactivity` is the foundation layer every other Pyreon package builds on, but it has zero framework dependencies and works on its own in Node, Bun, edge workers, or any JavaScript environment without DOM or JSX. Subscribers are tracked via a `Set<() => void>`; batches use a pointer swap for zero-allocation grouping. Two-tier batch flush (computed recompute → effect run) prevents stale reads in diamond-shaped dependency graphs.

## Install

```bash
bun add @pyreon/reactivity
```

## Quick start

```ts
import {
  signal,
  computed,
  effect,
  batch,
  onCleanup,
  watch,
  untrack,
  createStore,
  createResource,
  effectScope,
} from '@pyreon/reactivity'

const count = signal(0)
const doubled = computed(() => count() * 2)

const dispose = effect(() => {
  console.log('doubled:', doubled())
  onCleanup(() => console.log('cleaning up'))
})

batch(() => {
  count.set(1)
  count.set(2) // subscribers fire once, with doubled = 4
})

watch(
  () => count(),
  (next, prev) => console.log(`${prev} → ${next}`),
)

const store = createStore({ todos: [{ text: 'Learn Pyreon', done: false }] })
store.todos[0].done = true // fine-grained update, no immer

dispose()
```

## The signal contract

```ts
const x = signal(0)
x() // read (subscribes if inside a tracked scope)
x.set(1) // write
x.update((n) => n + 1)
x.peek() // read without subscribing
```

Signals are **callable functions**, not `.value` getters (Vue) and not `[state, setState]` tuples (React). Calling the signal as a function is the read; `signal(5)` does NOT set the value — it reads and discards the argument. Dev mode warns; the `@pyreon/lint` rule `signal-write-as-call` flags it statically.

Optional `name` for debugging: `signal(0, { name: 'count' })` — the `@pyreon/vite-plugin` injects names automatically in dev.

## Computed

```ts
const doubled = computed(() => count() * 2)
const sameRef = computed(() => obj(), { equals: (a, b) => a.id === b.id })
```

Lazy, memoized, auto-tracking. Recomputes only when a dependency changes AND a subscriber actually reads it. Pass a custom `equals` to dedupe by structural identity instead of `Object.is`.

## Effects

```ts
const dispose = effect(() => {
  console.log(count())
  onCleanup(() => console.log('before next run / on dispose'))
})
dispose()
```

`effect()` re-runs on tracked-signal change; the returned function disposes. Returning a cleanup function from the effect body is supported; `onCleanup(fn)` is the explicit form. `renderEffect()` is a lighter DOM-targeted variant that does NOT support `onCleanup` and does NOT register with `EffectScope` — used internally by `@pyreon/runtime-dom`.

`watch(source, callback)` is the explicit-source variant: `source` is evaluated for tracking, `callback(next, prev)` runs on change, and returning a cleanup function is honored.

## Batching

```ts
batch(() => {
  count.set(1)
  count.set(2)
}) // subscribers notified ONCE with count=2
```

`batch()` defers subscriber notifications until the end of the callback. `nextTick(): Promise<void>` resolves after the current flush — useful for awaiting DOM updates in tests.

## Stores

```ts
const store = createStore({ count: 0, todos: [{ text: 'a', done: false }] })
store.count++ // notifies
store.todos[0].done = true // deep — notifies

const shallow = shallowReactive({ user: { name: 'a' } })
shallow.user = { name: 'b' } // notifies
shallow.user.name = 'c' // does NOT notify (shallow)

const raw = markRaw(thirdPartyClassInstance) // skip proxy
```

`createStore` returns a deeply-reactive proxy. `shallowReactive` proxies only the top level. `markRaw` opts an object out of proxying — useful for class instances, DOM nodes, third-party objects. `reconcile(target, source)` patches an existing store to match `source` without remounting.

**Caveat:** `Map`, `Set`, `WeakMap`, `WeakSet`, `Date`, `RegExp`, `Promise`, `Error` are returned RAW. Mutating them does not notify; assign a new instance to trigger updates.

## Resources

```ts
const user = createResource(
  () => userId(),
  async (id) => {
    const r = await fetch(`/api/users/${id}`)
    return r.json()
  },
)

user.data() // T | undefined
user.loading() // boolean
user.error() // Error | undefined
user.refetch()
```

`createResource(source, fetcher)` re-runs the fetcher whenever `source` changes; stale responses are dropped via an internal request-id guard. Resources created **outside** an `EffectScope` must be `dispose()`-d explicitly to avoid leaks.

## EffectScope

```ts
const scope = effectScope()
scope.runInScope(() => {
  effect(() => console.log(count()))
  onScopeDispose(() => console.log('scope ended'))
})
scope.stop() // disposes every effect inside
```

Groups effects for bulk disposal — used internally by `@pyreon/runtime-dom`'s mount pipeline. `getCurrentScope()` returns the active scope; `setCurrentScope(scope)` is the escape hatch for advanced cross-tree integrations.

Internal arrays (`_effects`, `_updateHooks`) are lazy-allocated — scopes with no effects cost only the object itself.

## Selectors

```ts
const selected = signal<string | null>(null)
const isSelected = createSelector(() => selected())

<For each={items} by={i => i.id}>
  {(item) => <li class={() => isSelected(item.id) ? 'active' : ''}>{item.name}</li>}
</For>
```

`createSelector(source)` returns a function that, when called with a key, only notifies subscribers when the key transitions in or out of the selected state. O(1) instead of N effect runs on selection change.

For the canonical `<For>` + `createSelector` className/text-content shape, `Selector<T>` also exposes a direct `.subscribe(key, updater)` API that skips the full `renderEffect` setup — per-row alloc drops from ~5 to ~2:

```ts
const dispose = isSelected.subscribe(row.id, (matches) => {
  rowEl.className = matches ? 'selected' : ''
})
```

The `@pyreon/compiler` auto-promotes the natural JSX shape `class={() => isSelected(row.id) ? 'on' : 'off'}` to this fast path — you don't need to call `.subscribe` directly. See the compiler docs for the bail catalog.

## Cell — minimal alternative to signal

```ts
import { cell } from '@pyreon/reactivity'
const c = cell(0)
c.get()
c.set(1)
c.subscribe(listener)
```

`cell()` is a class-based primitive with a single-listener fast path and one allocation per cell. It is **not** callable and **does not** participate in effect tracking — use it only for cross-cutting state where the signal-tracking overhead would be wasteful.

## Debugging

```ts
import {
  setErrorHandler,
  inspectSignal,
  onSignalUpdate,
  why,
  getReactiveTrace,
} from '@pyreon/reactivity'

setErrorHandler((err, source) => reportToSentry(err, { tag: source }))

const count = signal(0, { name: 'count' })
onSignalUpdate(count, (next, prev) => console.log('count', prev, '→', next))
inspectSignal(count) // { name, value, subscribers: number }
why(count) // print dependency graph for this signal
```

`activate/deactivate/getReactiveGraph/getReactiveFires` form the **opt-in** bridge consumed by the Pyreon devtools — zero cost until activated, gated by `process.env.NODE_ENV !== 'production'`, tree-shaken in production.

## Documentation

Full docs: [docs.pyreon.dev/docs/reactivity](https://docs.pyreon.dev/docs/reactivity) (or `docs/docs/reactivity.md` in this repo).

## License

MIT
