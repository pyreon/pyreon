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

The setup function runs ONCE per store ID; subsequent `useCounter()` calls return the cached instance. The return value is auto-classified:

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
| `dispose()` | Detach, dispose computeds, clear subscribers |

`patch()` discriminator on subscribe events:

```ts
subscribe((m) => {
  m.type           // 'direct' | 'patch'
  m.events         // array of { key, prev, next }
})
```

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

Plugins are global — registered once at app startup, run for every defined store. Plugin throws are caught and silenced (with a dev-mode `console.warn`) so one bad plugin can't take the whole app down. Plugins added AFTER a store has been created do NOT retroactively run on it.

## Action interception

```ts
const { store, onAction } = useCounter()
onAction((name, args, ctx) => {
  console.log(`> ${name}(${args.join(', ')})`)
  ctx.after((result) => console.log(`< ${name} returned`, result))
  ctx.onError((err) => console.error(`× ${name}`, err))
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
import { storeRegistry } from '@pyreon/store/devtools'
storeRegistry.forEach((api) => console.log(api.id, api.state))
```

WeakRef-based registry of live store instances — tree-shakeable. Used by the Pyreon devtools panel to inspect store state.

## Re-exports

For single-import DX, `@pyreon/store` re-exports the most-used reactivity primitives:

```ts
import { signal, computed, effect, batch } from '@pyreon/store'
```

Plus `Signal` (type).

## Gotchas

- `patch({ unknownKey: 1 })` is a silent no-op — unknown keys are dropped without warning.
- `patch()` drops `__proto__` / `constructor` / `prototype` keys for prototype-pollution safety.
- `addStorePlugin` registrations persist across `resetAllStores()` (global registry).
- `resetStore(id)` does NOT notify subscribers — orphaned references silently diverge.
- `.state` is a `.peek()`-based snapshot (non-reactive). Reactive reads happen via the signals on `store.*`.

## Documentation

Full docs: [docs.pyreon.dev/docs/store](https://docs.pyreon.dev/docs/store) (or `docs/docs/store.md` in this repo).

## License

MIT
