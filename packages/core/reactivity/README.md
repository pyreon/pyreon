# @pyreon/reactivity

Standalone fine-grained reactivity primitives — signals, computeds, effects, stores, resources, scopes.

`@pyreon/reactivity` is the foundation layer every other Pyreon package builds on, but it has zero framework dependencies and works on its own in Node, Bun, edge workers, or any JavaScript environment without DOM or JSX. Subscribers are tracked via an inline `_d1` single-subscriber slot that promotes to a `Set<() => void>` on the second subscriber (the dominant per-`<For>`-row case pays no Set allocation); batches use a pointer swap for zero-allocation grouping. Two-tier batch flush (computed recompute → effect run) prevents stale reads in diamond-shaped dependency graphs.

## Install

```bash
bun add @pyreon/reactivity
```

## Quick start

```ts
import {
  signal, computed, effect, batch, onCleanup, watch, untrack,
  createStore, createResource, effectScope,
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

watch(() => count(), (next, prev) => console.log(`${prev} → ${next}`))

const store = createStore({ todos: [{ text: 'Learn Pyreon', done: false }] })
store.todos[0].done = true // fine-grained update, no immer

dispose()
```

## The signal contract

```ts
const x = signal(0)
x()           // read (subscribes if inside a tracked scope)
x.set(1)      // write
x.update(n => n + 1)
x.peek()      // read without subscribing
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

`effect()` re-runs on tracked-signal change; the returned function disposes. Returning a cleanup function from the effect body is supported; `onCleanup(fn)` is the explicit form. `renderEffect()` is a lighter DOM-targeted variant that does NOT support `onCleanup` (it does register its disposer with the surrounding `EffectScope`, like `effect()`) — used internally by `@pyreon/runtime-dom`.

Dependency tracking is exact per run and reuses subscriptions across re-runs: a steady-state re-run (same signals, same order) verifies the previous dependency list instead of tearing it down and rebuilding it — zero allocations, zero Set operations. A conditional-branch flip re-tracks that run and drops stale-branch subscriptions.

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
store.count++              // notifies
store.todos[0].done = true // deep — notifies

const shallow = shallowReactive({ user: { name: 'a' } })
shallow.user = { name: 'b' } // notifies
shallow.user.name = 'c'      // does NOT notify (shallow)

const raw = markRaw(thirdPartyClassInstance) // skip proxy
```

`createStore` returns a deeply-reactive proxy. `shallowReactive` proxies only the top level. `markRaw` opts an object out of proxying — useful for class instances, DOM nodes, third-party objects. `reconcile(target, source)` patches an existing store to match `source` without remounting.

**Caveat:** `Map`, `Set`, `WeakMap`, `WeakSet`, `Date`, `RegExp`, `Promise`, `Error` are returned RAW. Mutating them does not notify; assign a new instance to trigger updates.

## Resources

```ts
const user = createResource(() => userId(), async (id) => {
  const r = await fetch(`/api/users/${id}`)
  return r.json()
})

user.data()      // T | undefined
user.loading()   // boolean
user.error()     // Error | undefined
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
  {(item) => <li class={isSelected(item.id) ? 'active' : ''}>{item.name}</li>}
</For>
```

`createSelector(source)` returns a function that, when called with a key, only notifies subscribers when the key transitions in or out of the selected state. O(1) instead of N effect runs on selection change.

For the canonical `<For>` + `createSelector` className/text-content shape, `Selector<T>` also exposes a direct `.subscribe(key, updater)` API that skips the full `renderEffect` setup — the first-subscriber-per-key path allocates just 1 dispose closure + 1 Map entry (the updater is stored as a bare function, no Set; a Set is only allocated when a 2nd subscriber arrives for the same key):

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
c.get(); c.set(1); c.subscribe(listener)
```

`cell()` is a class-based primitive with a single-listener fast path and one allocation per cell. It is **not** callable and **does not** participate in effect tracking — use it only for cross-cutting state where the signal-tracking overhead would be wasteful.

## wrapSignal — writable side-effect facade

```ts
import { signal, wrapSignal } from '@pyreon/reactivity'

const base = signal(load())
// A callable that reads like a signal but persists on every write:
const stored = wrapSignal(base, {
  set: (next) => {
    localStorage.setItem('k', JSON.stringify(next)) // side effect
    base.set(next)                                   // then write through
  },
})
stored()            // read (tracks)
stored.set(value)   // runs your custom set: side effect, then base.set
```

`wrapSignal(base, { set, update? })` is the canonical primitive for "a signal whose writes carry a side effect" (persistence, cross-tab sync, patch emission, validation). It wraps a base `signal()` with a callable whose reads — `()`, `.peek`, `.subscribe`, `.direct` — AND the internal `_v` field delegate to `base`, while `.set` runs your custom handler (do the side effect, then call `base.set(value)` to commit). The `_v` forwarding is load-bearing: the compiler's `_bindText` fast path reads `source._v` directly, so a hand-rolled facade missing it binds `''` forever — the exact bug class this primitive retires. `update` is optional (defaults to `set(fn(peek()))`). `@pyreon/storage` (all 5 backends) and `@pyreon/state-tree` were migrated onto it; the `pyreon/storage-signal-v-forwarding` lint rule exists precisely because this primitive was missing before.

## Type helpers ("derive, don't annotate twice")

Type-only exports — zero runtime bytes:

```ts
import { signal, type SignalValue, type ComputedValue, type MaybeAccessor, type AccessorReturn } from '@pyreon/reactivity'

const user = signal({ id: 1, name: 'Ada' })
type User = SignalValue<typeof user> // { id: number; name: string }

// The standard "static value OR reactive accessor" parameter shape.
// NOT auto-called — resolve it yourself, inside a reactive scope:
function useTitle(title: MaybeAccessor<string>) {
  const read = () => (typeof title === 'function' ? title() : title)
}
type Resolved = AccessorReturn<MaybeAccessor<string>> // string
```

## Debugging

```ts
import { setErrorHandler, inspectSignal, onSignalUpdate, why, getReactiveTrace } from '@pyreon/reactivity'

setErrorHandler((err, source) => reportToSentry(err, { tag: source }))

const count = signal(0, { name: 'count' })
onSignalUpdate(count, (next, prev) => console.log('count', prev, '→', next))
inspectSignal(count) // { name, value, subscribers: number }
why(count)           // print dependency graph for this signal
```

`activate/deactivate/getReactiveGraph/getReactiveFires` form the **opt-in** bridge consumed by the Pyreon devtools — zero cost until activated, gated by `process.env.NODE_ENV !== 'production'`, tree-shaken in production.

## Documentation

Full docs: [pyreon.dev/docs/reactivity](https://pyreon.dev/docs/reactivity) (or `docs/src/content/docs/reactivity.md` in this repo).

## License

MIT
