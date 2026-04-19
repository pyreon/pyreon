import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — store snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/store — Global state management — Pinia-inspired composition stores returning StoreApi<T>. Stores are singletons by ID — the setup function runs once. Calling the returned hook multiple times returns the same StoreApi instance. Use \`resetStore(id)\` or \`resetAllStores()\` to force re-creation."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/store — State Management

      Composition-style global state management built on @pyreon/reactivity signals. Stores are singletons identified by string ID — the setup function runs once, returning signals (auto-tracked as state), computeds (pass-through), and functions (auto-wrapped as actions with onAction interception). The returned StoreApi provides batch patching, mutation subscription, action hooks, reset, and dispose. For concurrent SSR, setStoreRegistryProvider() swaps the store map to an AsyncLocalStorage-backed provider so each request gets isolated state.

      \`\`\`typescript
      import { signal, computed } from '@pyreon/reactivity'
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
      setStoreRegistryProvider(() => als.getStore() ?? new Map())
      \`\`\`

      > **Singleton semantics**: Stores are singletons by ID — the setup function runs once. Calling the returned hook multiple times returns the same StoreApi instance. Use \`resetStore(id)\` or \`resetAllStores()\` to force re-creation.
      >
      > **SSR state isolation**: Without \`setStoreRegistryProvider()\`, all concurrent SSR requests share one global store map. Call it once at server startup with an AsyncLocalStorage-backed provider.
      >
      > **Action classification**: Only plain functions in the setup return become actions. Signals and computeds are classified by duck-typing (\`.set\` + \`.peek\` for signals, \`.dispose\` for computeds). Arrow functions assigned to variables are classified as actions.
      >
      > **Devtools**: Import \`@pyreon/store/devtools\` for a WeakRef-based registry that exposes all live store instances. Tree-shakeable — zero cost unless imported.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(5)
    expect(record['store/defineStore']!.notes).toContain('singleton')
    expect(record['store/defineStore']!.mistakes?.split('\n').length).toBe(4)
  })
})
