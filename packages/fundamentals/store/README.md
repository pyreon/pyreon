# @pyreon/store

Pinia-inspired composition stores backed by Pyreon signals.

Global reactive state management built on `@pyreon/reactivity`. Singleton stores defined by a setup function whose signals become tracked state and whose functions become interceptable actions. Returns a structured `StoreApi<T>` with `patch()` / `subscribe()` / `onAction()` / `reset()` / `dispose()`. Fits between component-local signals and a full state-tree — use it for cross-component state, plugin-extensible app stores, and SSR-isolated request state via `setStoreRegistryProvider`.

## Install

```bash
bun add @pyreon/store @pyreon/reactivity
```

## Quick start

```ts
import { defineStore, signal, computed } from '@pyreon/store'

const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  const increment = () => count.update((n) => n + 1)
  return { count, doubled, increment }
})

// Singleton — same instance for every call with this ID
const { store, patch, subscribe, reset, dispose } = useCounter()

store.count()       // 0 — reactive read
store.increment()   // wrapped action
store.doubled()     // 2

patch({ count: 10 })                                    // object form, batched
patch((s) => s.count.set(s.count.peek() + 1))           // functional form, raw signals

const unsub = subscribe((m) => console.log(m.type, m.events))
unsub()
```

## When NOT to use `defineStore` — per-instance state

`defineStore` returns a SINGLETON. Every call with the same ID resolves to the same instance. That's the right model for:

- App-global state: auth, settings, theme, current user
- Cross-component shared state with one canonical instance
- Plugin-extensible stores (one registry per app)

It's the WRONG model for **per-Provider-instance state** — where two mounts of the same provider must hold independent state. For that, use plain `signal()` inside the Provider component and `createContext` / `provide` from `@pyreon/core`:

```ts
import { createContext, provide, useContext } from '@pyreon/core'
import { signal, type Signal } from '@pyreon/reactivity'

interface FooState { count: Signal<number> }
const FooCtx = createContext<FooState | null>(null)

function FooProvider(props: { children: VNodeChild }) {
  const count = signal(0)                       // fresh on each mount
  provide(FooCtx, { count })
  return props.children
}

function FooConsumer() {
  const ctx = useContext(FooCtx)                // do NOT destructure — see createContext JSDoc
  return <div>{ctx?.count() ?? 0}</div>
}

// Two independent <FooProvider> mounts → two independent counts
```

This is the Pyreon-native pattern for per-instance state. `defineStore` is for global singletons; the signal+context pattern is for everything else.

## Setup function — what runs and how

The setup function runs ONCE per store ID; subsequent `useCounter()` calls return the cached instance. It runs inside a **store-owned effect scope**: every `computed()` / `effect()` created in setup belongs to the STORE, not to whatever component happened to trigger the first creation — so a component unmounting never disposes a singleton store's reactivity, and `dispose()` tears all of it down deterministically (Pinia's effectScope model). The return value is auto-classified:

| Return value shape          | Becomes                                  |
|-----------------------------|------------------------------------------|
| `Signal<T>` (callable + `.set`/`.peek`) | Tracked state (snapshotted in `.state`) |
| `Computed<T>` (with `.dispose`) | Pass-through (read like a signal)        |
| `function`                  | Wrapped action (intercepted by `onAction`) |
| Any other value             | Pass-through                             |

## StoreApi

| Property | Description |
|---|---|
| `store` | Your setup return value (signals, computeds, actions) |
| `id` | The string ID |
| `state` | Snapshot — `.peek()` of every signal, non-reactive |
| `patch(obj \| fn)` | Object form: `{ key: value }` per signal, batched. Function form: `(rawSignals) => { … }` |
| `subscribe(cb, opts?)` | Mutation listener; `{ immediate: true }` fires once on registration |
| `onAction(cb)` | Action interception with `ctx.after(fn)` / `ctx.onError(fn)` |
| `reset()` | Reset every signal to its initial value |
| `dispose()` | Full teardown: runs plugin cleanups, clears subscribers, stops the store's effect scope (disposing every `computed`/`effect` created in setup), removes from registry |

`patch()` discriminator on subscribe events:

```ts
subscribe((m) => {
  m.type           // 'direct' | 'patch'
  m.events         // array of { key, oldValue, newValue }
})
```

## Schema-driven stores

Pass a `{ schema, initial, setup? }` config instead of a setup function to derive per-field signals AND their types from a validation schema (zod / valibot / arktype / any Standard Schema-compliant lib, or a `@pyreon/validation` adapter). Every `set` / `patch` / `deepPatch` / `update` validates through the schema, and field types are inferred end-to-end — no manual annotations, no casts.

```ts
import { defineStore, computed } from '@pyreon/store'
import { z } from 'zod'

const useUser = defineStore('user', {
  schema: z.object({ name: z.string().min(1), age: z.number().int() }),
  initial: { name: 'Alice', age: 30 },
  setup: ({ state }) => ({
    greet: computed(() => `Hi, ${state.name()}`),   // state.name: Signal<string>
  }),
})

const u = useUser()
u.store.name()                    // Signal<string> — reactive read
u.store.greet()                   // computed
u.set({ name: 'Bob', age: 31 })   // full replace + validate
u.patch({ age: 32 })              // shallow merge + validate
u.update('age', n => n + 1)       // n: number — typed from the schema, no cast
u.store.age.set(-1)               // direct signal write — bypasses validation (escape hatch)
```

The hook returns a `SchemaStoreApi<TRaw, TStore>`: `state` / `set` / `patch` / `deepPatch` / `update` are all schema-typed, so a wrong-typed value, an unknown field, or an `update` on a non-field key fails typecheck. Standard Schema-compliant schemas (zod 3.24+, valibot 1.0+, arktype 2.0+) are auto-detected — pass them raw; other libraries wrap in a small `TypedSchemaAdapter`. Invalid `initial` throws at `defineStore`-time, and async validators are rejected. See the [guide](https://pyreon.dev/docs/store#schema-driven-stores) for `deepPatch`, `onValidationError`, and per-library adapter details.

## Plugins

```ts
import { addStorePlugin } from '@pyreon/store'

addStorePlugin((api) => {
  // Runs ONCE per store at first creation
  console.log('Store created:', api.id)

  api.subscribe((m) => syncToServer(api.id, m))

  return () => {
    // Optional teardown — runs on store.dispose()
  }
})
```

Plugins are global — registered once at app startup, run for every defined store. A plugin may return a **cleanup function** — it runs when that store's `dispose()` is called (for external resources: sync loops, timers, connections). `effect()`/`computed()` created inside a plugin body need NO cleanup — they run in the store's effect scope and are disposed automatically. Plugin throws are caught and silenced (with a dev-mode `console.warn`) so one bad plugin can't take the whole app down. Plugins added AFTER a store has been created do NOT retroactively run on it.

## Persistence — return `useStorage()` from setup

There is no "persist middleware" — none is needed. `@pyreon/storage`'s `useStorage()` returns a `StorageSignal` (a real `Signal` + persistence side-effect), so returning one from `setup` gives you a persisted store field with everything a store field has: it's classified as state, `patch`/`reset`/`subscribe`/`dehydrateStores` all flow through it, and you get cross-tab sync + optional debounced writes from `@pyreon/storage` for free. You persist exactly the fields you wrap — no `partialize` config, the composition IS the selection:

```ts
import { computed, signal } from '@pyreon/reactivity'
import { useStorage } from '@pyreon/storage'
import { defineStore } from '@pyreon/store'

const useCart = defineStore('cart', () => {
  const lines = useStorage<CartLine[]>('cart.lines', [])   // persisted (localStorage)
  const currency = useStorage('cart.currency', 'USD')      // persisted
  const drawerOpen = signal(false)                         // deliberately NOT persisted
  const total = computed(() => lines().reduce((s, l) => s + l.price * l.qty, 0))
  const add = (line: CartLine) => lines.set([...lines(), line])
  return { lines, currency, drawerOpen, total, add }
})
```

(Shipped shape — `examples/app-showcase`'s shop cart + todos stores use exactly this.) Two caveats: `reset()` restores the value read from storage at store-creation time (the setup-time snapshot), not your declared default — call `lines.remove()` to clear the persisted value itself. And if the persisted SHAPE evolves across releases, validate/migrate on read (wrap the raw value in setup, or use a schema-mode store and normalize in an action) — there is no built-in `version`/`migrate` option.

## Store families — parameterized stores

For keyed instances (a store per entity id), derive the ID — `defineStore` is cheap and the registry is the cache:

```ts
const useDoc = (docId: string) =>
  defineStore(`doc:${docId}`, () => {
    const title = signal('')
    const dirty = signal(false)
    return { title, dirty, rename: (t: string) => (title.set(t), dirty.set(true)) }
  })()

useDoc('a').store.title.set('Alpha')
useDoc('a').store.title()   // 'Alpha' — same instance per key
useDoc('b').store.title()   // ''      — independent instance
```

This is the official pattern (the Jotai-`atomFamily` analogue). Lifecycle is yours: call `useDoc(id).dispose()` (or `resetStore(\`doc:${id}\`)`) when an entity goes away — there is no automatic family GC, deliberately (a registry that guesses when your entity is dead guesses wrong).

## Action interception

```ts
const { store, onAction } = useCounter()
onAction((ctx) => {
  console.log(`> ${ctx.name}(${ctx.args.join(', ')})`)
  ctx.after((result) => console.log(`< ${ctx.name} returned`, result))
  ctx.onError((err) => console.error(`× ${ctx.name}`, err))
})
```

Works for sync and async actions; `ctx.after` runs after the action resolves, `ctx.onError` runs on either thrown errors or rejected promises.

## SSR isolation

```ts
// Once at server startup:
import { configureStoreIsolation } from '@pyreon/runtime-server'
import { setStoreRegistryProvider } from '@pyreon/store'

configureStoreIsolation(setStoreRegistryProvider)
```

Without this, the store registry is a process-global singleton — concurrent requests share defined stores. With it, each `renderToString` / `renderToStream` call gets its own registry via `AsyncLocalStorage`. Call once at startup, never per request.

## Testing pattern

```ts
import { afterEach } from 'vitest'
import { resetAllStores } from '@pyreon/store'

afterEach(resetAllStores)
```

`resetStore(id)` clears one; `resetAllStores()` clears every store in the registry. Note: **detach is NOT dispose** — if a component still holds a reference to a previously-defined store, the next `useStore()` returns a NEW instance and the orphaned reference will silently diverge. Use `dispose()` to cleanly tear down a store while subscribers exist.

## Devtools

```ts
import { getRegisteredStores, getStoreById, onStoreChange } from '@pyreon/store/devtools'

for (const id of getRegisteredStores()) {
  console.log(id, getStoreById(id)?.state)
}

// React to stores being added/removed:
const stop = onStoreChange(() => console.log('registry changed'))
```

`getRegisteredStores()` returns the live store IDs, `getStoreById(id)` returns its `StoreApi` (read `.state`), `onStoreChange(listener)` notifies on add/remove — tree-shakeable. Used by the Pyreon devtools panel to inspect store state.

## Re-exports

For single-import DX, `@pyreon/store` re-exports the most-used reactivity primitives:

```ts
import { signal, computed, effect, batch } from '@pyreon/store'
```

Plus `Signal` (type).

## Gotchas

- `patch({ unknownKey: 1 })` drops the key — **warns in dev** (`[Pyreon] patch(...): key "..." is not a signal field`), silent in production.
- `patch()` checks key membership against the store's signal fields FIRST, so unknown keys (including `__proto__`-shaped keys from parsed JSON) never touch anything — prototype pollution is structurally impossible, and a legitimate signal field named `constructor` IS patchable.
- Redefining a store id from a **different setup function** warns in dev (once per id) — the registered instance keeps the OLD setup. This is the two-`defineStore`-calls-one-id mistake, and also what an HMR re-eval looks like: state is preserved but edited actions/computeds do NOT apply until `resetStore(id)` or a full reload.
- `addStorePlugin` registrations persist across `resetAllStores()` (global registry).
- `resetStore(id)` does NOT notify subscribers — orphaned references silently diverge.
- `.state` is a `.peek()`-based snapshot (non-reactive). Reactive reads happen via the signals on `store.*`.

## Non-goals (deliberate — the paradigm covers them)

Coming from Zustand / Pinia / Jotai / Valtio, several familiar features are absent ON PURPOSE — fine-grained signals make them unnecessary:

- **`subscribeWithSelector` / selector middleware** — signals ARE the selectors. Subscribe to one field via `store.x.subscribe(...)` or derive with `computed(...)`; there is no coarse store subscription to narrow.
- **`immer` / produce middleware** — per-field signals make granular writes the idiom (`store.x.set`, `patch`). For deep trees with snapshots/patches, that's `@pyreon/state-tree`'s job.
- **`storeToRefs`** — store fields are stable signal callables; destructuring `const { count } = store` is safe by construction (the reactivity is in READING `count()`, not in property access).
- **Redux-style reducers/dispatch** — constrained transitions are `@pyreon/machine`'s job; actions here are plain functions.
- **Framework binding adapters** (`useStore(selector)` hooks) — there is no re-render layer to bind; components read signals directly.
- **Refcounted auto-dispose** (nanostores `onMount`) — stores are app-level singletons with explicit `dispose()`; component-scoped resources belong in component hooks.
- **Async derived-data primitives** (Jotai async atoms, `loadable`) — server/async data is `@pyreon/query`'s job; async ACTIONS are first-class here (`onAction` is thenable-aware).

## Documentation

Full docs: [pyreon.dev/docs/store](https://pyreon.dev/docs/store) (or `docs/src/content/docs/store.md` in this repo).

## License

MIT
