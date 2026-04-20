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
        'Calling `useCounter()` expecting a new instance — stores are singletons by ID, the setup function only runs once',
        'Reading `store.count` without calling it — signals are functions, use `store.count()` to read the value',
        'Calling `store.count.set()` instead of using `patch()` when updating multiple signals — `patch()` batches updates into a single notification',
        'Forgetting `dispose()` in tests — store persists in the registry across test cases, leaking state. Use `resetStore(id)` or `resetAllStores()` in test cleanup',
      ],
      seeAlso: ['StoreApi', 'addStorePlugin', 'resetStore'],
    },
    {
      name: 'addStorePlugin',
      kind: 'function',
      signature: '(plugin: StorePlugin) => void',
      summary:
        'Register a global store plugin that runs when any store is first created. Plugin receives the full StoreApi, enabling cross-cutting concerns like logging, persistence, or devtools integration. Plugin errors are caught and logged in dev mode without breaking store creation.',
      example: `addStorePlugin((api) => {
  api.subscribe((mutation, state) => {
    console.log(\`[\${api.id}] \${mutation.type}:\`, mutation.events)
  })
})`,
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
        'Remove a store from the registry by ID. The next call to the store hook re-runs the setup function from scratch. Useful for testing isolation and HMR.',
      example: `resetStore('counter') // next useCounter() call creates a fresh store`,
      seeAlso: ['resetAllStores', 'defineStore'],
    },
    {
      name: 'resetAllStores',
      kind: 'function',
      signature: '() => void',
      summary:
        'Clear the entire store registry. All subsequent store hook calls create fresh instances. Primary use case is test cleanup and SSR request isolation.',
      example: `afterEach(() => resetAllStores())`,
      seeAlso: ['resetStore'],
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
