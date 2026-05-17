import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/store',
  title: 'State Management',
  tagline:
    'Global state management — Pinia-inspired composition stores returning StoreApi<T>',
  description:
    'Composition-style global state management built on @pyreon/reactivity signals. Stores are singletons identified by string ID — the setup function runs once, returning signals (auto-tracked as state), computeds (pass-through), and functions (auto-wrapped as actions with onAction interception). The returned StoreApi provides batch patching, mutation subscription, action hooks, reset, and dispose. For concurrent SSR, setStoreRegistryProvider() swaps the store map to an AsyncLocalStorage-backed provider so each request gets isolated state.',
  category: 'universal',
  longExample: `import { signal, computed } from '@pyreon/reactivity'
import { defineStore, addStorePlugin, resetAllStores } from '@pyreon/store'

// Define a store — setup function runs once per store ID.
// Signals → tracked state, functions → wrapped actions.
const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const double = computed(() => count() * 2)
  const increment = () => count.update(n => n + 1)
  return { count, double, increment }
})

// Use anywhere — singleton, no provider needed:
const { store, patch, subscribe, onAction, reset, dispose } = useCounter()
store.count()       // 0 — reactive signal read
store.increment()   // wrapped action — triggers onAction listeners

// Batch-update multiple signals:
patch({ count: 42 })
// Or functional form for complex updates:
patch((state) => state.count.set(99))

// Subscribe to mutations:
const unsub = subscribe((mutation, state) => {
  console.log(mutation.type, mutation.events) // 'direct' | 'patch'
})

// Action interception:
onAction((ctx) => {
  console.log(\`\${ctx.name} called with\`, ctx.args)
  ctx.after((result) => console.log('Action returned', result))
  ctx.onError((err) => console.error('Action failed', err))
})

// Reset to initial values:
reset()

// Global plugin system:
addStorePlugin((api) => {
  api.subscribe((mutation) => {
    console.log(\`[\${api.id}] \${mutation.type}\`)
  })
})

// SSR isolation — each request gets its own store registry:
import { setStoreRegistryProvider } from '@pyreon/store'
import { AsyncLocalStorage } from 'node:async_hooks'
const als = new AsyncLocalStorage<Map<string, any>>()
setStoreRegistryProvider(() => als.getStore() ?? new Map())`,
  features: [
    'defineStore(id, setup) — composition stores, singleton by ID',
    'Auto-classifies setup returns: signals as state, functions as wrapped actions',
    'StoreApi with patch(), subscribe(), onAction(), reset(), dispose()',
    'Global plugin system via addStorePlugin()',
    'SSR isolation via setStoreRegistryProvider() with AsyncLocalStorage',
    'Devtools subpath export with WeakRef-based registry',
  ],
  api: [
    {
      name: 'defineStore',
      kind: 'function',
      signature: '<T extends Record<string, unknown>>(id: string, setup: () => T) => () => StoreApi<T>',
      summary:
        'Define a composition-style store. The setup function runs once per store ID, returning an object whose signals become tracked state and whose functions become interceptable actions. Returns a hook function that produces a StoreApi with `.store` (user state/actions), `.patch()`, `.subscribe()`, `.onAction()`, `.reset()`, and `.dispose()`. Stores are singletons — calling the hook twice with the same ID returns the same instance.',
      example: `const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const double = computed(() => count() * 2)
  const increment = () => count.update(n => n + 1)
  return { count, double, increment }
})

const { store, patch, subscribe, reset } = useCounter()
store.count()       // 0
store.increment()   // reactive update
patch({ count: 42 })`,
      mistakes: [
        'Calling `useCounter()` expecting a new instance — stores are singletons by ID. The setup runs once; the registry returns the same `StoreApi` for every later call with that ID until `resetStore(id)` / `resetAllStores()`',
        'Reading `store.count` without calling it — signals are functions; use `store.count()` to read',
        'Calling `store.count.set()` for multi-field updates instead of `patch()` — separate `.set()` calls each notify subscribers; `patch()` batches them into ONE `type: "patch"` mutation',
        'Forgetting `dispose()` / `resetAllStores()` in tests — the store persists in the global registry across test cases, leaking state into the next test. Put `afterEach(() => resetAllStores())` in setup',
        'Returning a non-signal, non-function value from `setup` (a plain object/array) and expecting it to be reactive — only signals become tracked state. Classification is duck-typed: signals = `.set` + `.peek`, computeds = `.dispose` (and not a signal), everything-else-callable = action. A plain object is none of these and is passed through inert',
        'Mutating state by reassigning `store.count` — it is a frozen accessor; write via `store.increment()` (an action) or `patch({ count })`. Direct property assignment is silently ineffective',
        'Registering an `addStorePlugin` AFTER the store was first created and expecting it to apply — plugins run only at creation time. The already-created store never sees it (see `addStorePlugin` mistakes)',
      ],
      seeAlso: ['StoreApi', 'addStorePlugin', 'resetStore'],
    },
    {
      name: 'StoreApi',
      kind: 'type',
      signature:
        'interface StoreApi<T> { store: T; id: string; state: Snapshot<T>; patch(p: Partial|fn): void; subscribe(cb): () => void; onAction(cb): () => void; reset(): void; dispose(): void }',
      summary:
        'The object the `defineStore` hook returns. `store` is the user state + actions; `id` the registry key; `state` a plain-value snapshot getter (signals read via `.peek()`, no tracking — safe to log / serialize). `patch` batch-updates signals; `subscribe` fires per mutation with `{ storeId, type: "direct" | "patch", events }`; `onAction` intercepts wrapped actions (`ctx.name`, `ctx.args`, `ctx.after(fn)`, `ctx.onError(fn)`); `reset` restores each signal to its setup-time `.peek()` value; `dispose` unsubscribes all listeners and removes the store from the registry.',
      example: `const { store, patch, subscribe, onAction, reset, dispose } = useCounter()
patch({ count: 42 })                       // object form — batched
patch((s) => { s.count.set(s.count.peek() + 1) }) // functional form: real signals
const off = subscribe((m) => console.log(m.type, m.events))
onAction((ctx) => { ctx.after((r) => log(r)); ctx.onError((e) => report(e)) })
reset()      // signals → setup-time values
dispose()    // teardown + registry removal`,
      mistakes: [
        '`patch({ typoKey: 1 })` is a SILENT no-op — object-form patch only writes keys that are signal names; an unknown / mistyped key is skipped with no error or warning. Verify key names',
        '`patch` silently drops `__proto__` / `constructor` / `prototype` keys (prototype-pollution guard) — a state field literally named one of those cannot be patched via the object form; use the functional form',
        'Expecting `reset()` to restore the "last good" or current-default value — it restores the value captured by `.peek()` when `setup` first ran. A signal whose initial value was itself derived at setup resets to THAT, not to a fresh recomputation',
        'Reading `.state` and expecting it to be reactive — it is a one-shot plain snapshot via `.peek()` (no tracking). Reading it inside an `effect`/`computed` will NOT re-run on change; read `store.x()` for reactive access',
        'Keeping a destructured `store`/`patch` reference after `resetStore(id)` — the old `StoreApi` keeps working but is detached from the registry; the next hook call creates a NEW instance and your stale reference points at the orphan',
        'Returning the `subscribe` / `onAction` disposer and never calling it — listeners live until disposed (or the store is disposed); in long-lived stores this leaks',
      ],
      seeAlso: ['defineStore', 'addStorePlugin'],
    },
    {
      name: 'addStorePlugin',
      kind: 'function',
      signature: '(plugin: StorePlugin) => void',
      summary:
        'Register a global store plugin. The plugin runs ONCE per store, at first creation of that store, receiving its full `StoreApi` — for logging, persistence, devtools, etc. Runs for every store created AFTER registration. Plugin throws are caught and (dev-only) `console.warn`ed so one bad plugin cannot break store creation — but in production a throwing plugin fails completely silently. The plugin chain is uncached: cost is O(stores × plugins) across all fresh store creations.',
      example: `// Register BEFORE any store hook is first called.
addStorePlugin((api) => {
  api.subscribe((mutation) => {
    console.log(\`[\${api.id}] \${mutation.type}:\`, mutation.events)
  })
})`,
      mistakes: [
        'Registering AFTER a store was already created — plugins run only at creation. Stores already in the registry never receive the plugin. Register at module init before the first hook call, or `resetStore(id)` to force re-creation through the plugin chain',
        'Relying on a plugin throw surfacing in production — errors are swallowed with only a dev-mode `console.warn`. A plugin that throws in prod silently does nothing; make the plugin itself defensive',
        'Calling `api.subscribe` / `api.onAction` in a plugin without ever disposing — those listeners live for the whole store lifetime; in tests they accumulate across cases unless `resetAllStores()` runs in cleanup',
        'Registering many plugins and not noticing the cost — the chain is uncached and runs per fresh store creation (O(stores × plugins)); the `store.pluginRun` perf counter scales exactly with this',
        'Assuming plugin registration is idempotent — `addStorePlugin` pushes onto a list every call; registering the same plugin twice runs it twice per store',
      ],
      seeAlso: ['defineStore', 'StoreApi'],
    },
    {
      name: 'setStoreRegistryProvider',
      kind: 'function',
      signature: '(provider: () => Map<string, StoreApi<any>>) => void',
      summary:
        'Replace the default global store registry with a provider function. Essential for concurrent SSR — pass an AsyncLocalStorage-backed provider so each request gets isolated store state instead of sharing a single global map across concurrent requests.',
      example: `import { setStoreRegistryProvider } from '@pyreon/store'
import { AsyncLocalStorage } from 'node:async_hooks'

const als = new AsyncLocalStorage<Map<string, any>>()
setStoreRegistryProvider(() => als.getStore() ?? new Map())`,
      mistakes: [
        'Forgetting to call this on the SSR server — all concurrent requests share the same store instances, causing cross-request state leaks',
      ],
      seeAlso: ['defineStore'],
    },
    {
      name: 'resetStore',
      kind: 'function',
      signature: '(id: string) => void',
      summary:
        'Remove ONE store from the registry by ID. The next call to that store hook re-runs `setup` from scratch, producing a brand-new `StoreApi`. For per-test isolation and HMR. Does NOT dispose the old instance or notify its subscribers — it just detaches it from the registry.',
      example: `resetStore('counter') // next useCounter() call builds a fresh store`,
      mistakes: [
        'Expecting components/closures holding the OLD `StoreApi` to pick up the new one — they keep operating on the now-orphaned old instance. `resetStore` only affects what the NEXT hook call resolves',
        'Using it as a "clear state" within a live app — it swaps the instance, so any active subscribers/effects bound to the old store go stale. For in-app state clearing use `reset()` on the StoreApi (restores setup-time values, keeps the instance + subscribers)',
        'Calling it without re-invoking the hook and expecting fresh state — the new store is created lazily on the next hook call, not by `resetStore` itself',
        'Passing a wrong / mistyped ID — silently no-ops (the ID simply is not in the registry); state is not reset and you get no error',
      ],
      seeAlso: ['resetAllStores', 'defineStore', 'StoreApi'],
    },
    {
      name: 'resetAllStores',
      kind: 'function',
      signature: '() => void',
      summary:
        'Clear the ENTIRE store registry. Every subsequent store hook call creates a fresh instance. Primary use: test cleanup (the canonical `afterEach`) and forcing a clean slate. Like `resetStore`, it detaches — it does not dispose old instances or notify their subscribers.',
      example: `afterEach(() => resetAllStores()) // canonical test isolation`,
      mistakes: [
        'Forgetting it in test cleanup — THE store-test footgun: a store mutated in one test persists into the next, causing order-dependent failures that pass in isolation. `afterEach(() => resetAllStores())` is mandatory boilerplate',
        'Expecting it to also clear registered plugins — `addStorePlugin` registrations are global and survive `resetAllStores()`. Stores re-created afterward still run the previously-registered plugins',
        'Calling it mid-render in a live app — every component holding a destructured store keeps its orphaned instance while new hook calls build fresh ones; you get a split-brain UI. This is a test/SSR-isolation tool, not runtime state management',
        'Relying on it for SSR request isolation instead of `setStoreRegistryProvider` — calling `resetAllStores()` per request is racy under concurrency (one request wipes stores belonging to a concurrent request mid-flight); use an AsyncLocalStorage-backed registry provider',
      ],
      seeAlso: ['resetStore', 'setStoreRegistryProvider'],
    },
  ],
  gotchas: [
    {
      label: 'Singleton semantics',
      note: 'Stores are singletons by ID — the setup function runs once. Calling the returned hook multiple times returns the same StoreApi instance. Use `resetStore(id)` or `resetAllStores()` to force re-creation.',
    },
    {
      label: 'SSR state isolation',
      note: 'Without `setStoreRegistryProvider()`, all concurrent SSR requests share one global store map. Call it once at server startup with an AsyncLocalStorage-backed provider.',
    },
    {
      label: 'Action classification',
      note: 'Only plain functions in the setup return become actions. Signals and computeds are classified by duck-typing (`.set` + `.peek` for signals, `.dispose` for computeds). Arrow functions assigned to variables are classified as actions.',
    },
    {
      label: 'Devtools',
      note: 'Import `@pyreon/store/devtools` for a WeakRef-based registry that exposes all live store instances. Tree-shakeable — zero cost unless imported.',
    },
  ],
})
