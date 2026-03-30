/**
 * @pyreon/store — global state management built on @pyreon/reactivity signals.
 *
 * API (composition style):
 *
 *   const useCounter = defineStore("counter", () => {
 *     const count = signal(0)
 *     const double = computed(() => count() * 2)
 *     const increment = () => count.update(n => n + 1)
 *     return { count, double, increment }
 *   })
 *
 *   // Inside a component (or anywhere):
 *   const { store, patch, subscribe } = useCounter()
 *   store.count()       // read state
 *   store.increment()   // call action
 *   patch({ count: 5 }) // batch-update
 *
 * Stores are singletons — the setup function runs once per store id.
 * Call `resetStore(id)` or `resetAllStores()` to clear the registry
 * (useful for testing or HMR).
 *
 * For concurrent SSR, call setStoreRegistryProvider() with an
 * AsyncLocalStorage-backed provider so each request gets isolated store state.
 */

export type { Signal } from '@pyreon/reactivity'
export { batch, computed, effect, signal } from '@pyreon/reactivity'

import { batch } from '@pyreon/reactivity'

export { setRegistryProvider as setStoreRegistryProvider } from './registry'

import { _notifyChange } from './devtools'
import { getRegistry } from './registry'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MutationInfo {
  storeId: string
  type: 'direct' | 'patch'
  events: { key: string; newValue: unknown; oldValue: unknown }[]
}

export type SubscribeCallback = (mutation: MutationInfo, state: Record<string, unknown>) => void

export interface ActionContext {
  name: string
  storeId: string
  args: unknown[]
  after: (cb: (result: unknown) => void) => void
  onError: (cb: (error: unknown) => void) => void
}

export type OnActionCallback = (context: ActionContext) => void

export type StorePlugin = (api: StoreApi<Record<string, unknown>>) => void

/** The structured result returned by every store hook. */
export interface StoreApi<T> {
  /** The user-defined store state, computeds, and actions. */
  store: T
  /** Store identifier. */
  id: string
  /** Read-only snapshot of all signal values. */
  readonly state: Record<string, unknown>
  /** Batch-update multiple signals (object form) or direct access (function form). */
  patch(partialState: Record<string, unknown>): void
  patch(fn: (state: Record<string, any>) => void): void
  /** Subscribe to state mutations. Returns an unsubscribe function. */
  subscribe(callback: SubscribeCallback, options?: { immediate?: boolean }): () => void
  /** Intercept action calls. Returns an unsubscribe function. */
  onAction(callback: OnActionCallback): () => void
  /** Reset all signals to their initial values. */
  reset(): void
  /** Teardown: unsubscribe all listeners and remove from registry. */
  dispose(): void
}

// ─── Detection helpers ───────────────────────────────────────────────────────

/** Duck-typed signal interface for detection without importing concrete types. */
interface SignalLike {
  (): unknown
  set(v: unknown): void
  peek(): unknown
  subscribe(l: () => void): () => void
}

function isSignalLike(v: unknown): v is SignalLike {
  if (typeof v !== 'function') return false
  const fn = v as unknown as Record<string, unknown>
  return typeof fn.set === 'function' && typeof fn.peek === 'function'
}

function isComputedLike(v: unknown): boolean {
  if (typeof v !== 'function') return false
  const fn = v as unknown as Record<string, unknown>
  return typeof fn.dispose === 'function' && !isSignalLike(v)
}

// ─── Plugin system ───────────────────────────────────────────────────────────

const _plugins: StorePlugin[] = []

/** Register a global store plugin. Plugins run when a store is first created. */
export function addStorePlugin(plugin: StorePlugin): void {
  _plugins.push(plugin)
}

// ─── defineStore ─────────────────────────────────────────────────────────────

/**
 * Define a store with a unique id and a setup function.
 * Returns a hook that returns a `StoreApi<T>` with the user's state under `.store`
 * and framework methods (`patch`, `subscribe`, `onAction`, `reset`, `dispose`) at the top level.
 */
export function defineStore<T extends Record<string, unknown>>(
  id: string,
  setup: () => T,
): () => StoreApi<T> {
  return function useStore(): StoreApi<T> {
    const registry = getRegistry()
    if (registry.has(id)) return registry.get(id) as StoreApi<T>

    const raw = setup()

    // Classify properties
    const signalKeys: string[] = []
    const actionKeys: string[] = []
    const initialValues = new Map<string, unknown>()

    for (const key of Object.keys(raw)) {
      const val = raw[key]
      if (isSignalLike(val)) {
        signalKeys.push(key)
        initialValues.set(key, val.peek())
      } else if (isComputedLike(val)) {
        // computed — skip, just pass through
      } else if (typeof val === 'function') {
        actionKeys.push(key)
      }
    }

    // ─── subscribe infrastructure ───────────────────────────────────────
    const subscribers = new Set<SubscribeCallback>()
    let patchInProgress = false
    let patchEvents: MutationInfo['events'] = []

    function getState(): Record<string, unknown> {
      const state: Record<string, unknown> = {}
      for (const key of signalKeys) {
        state[key] = (raw[key] as SignalLike).peek()
      }
      return state
    }

    function notifyDirect(key: string, oldValue: unknown, newValue: unknown) {
      if (patchInProgress) {
        patchEvents.push({ key, newValue, oldValue })
        return
      }
      if (subscribers.size === 0) return
      const mutation: MutationInfo = {
        storeId: id,
        type: 'direct',
        events: [{ key, newValue, oldValue }],
      }
      const state = getState()
      for (const cb of subscribers) cb(mutation, state)
    }

    // Subscribe to each signal for change detection
    const signalUnsubs: (() => void)[] = []
    for (const key of signalKeys) {
      const sig = raw[key] as SignalLike
      let prev = sig.peek()
      const unsub = sig.subscribe(() => {
        const next = sig.peek()
        const old = prev
        prev = next
        notifyDirect(key, old, next)
      })
      signalUnsubs.push(unsub)
    }

    // ─── onAction infrastructure ────────────────────────────────────────
    const actionListeners = new Set<OnActionCallback>()

    // Wrap actions
    function wrapAction(key: string, original: (...args: any[]) => unknown) {
      return (...args: unknown[]) => {
        const afterCbs: ((result: unknown) => void)[] = []
        const errorCbs: ((error: unknown) => void)[] = []

        const context: ActionContext = {
          name: key,
          storeId: id,
          args,
          after: (cb) => afterCbs.push(cb),
          onError: (cb) => errorCbs.push(cb),
        }

        for (const listener of actionListeners) {
          listener(context)
        }

        try {
          const result = original(...args)

          // Handle async actions: if the result is a thenable, wait for
          // resolution before calling after/onError callbacks.
          if (result != null && typeof (result as Record<string, unknown>).then === 'function') {
            return (result as Promise<unknown>).then(
              (resolved) => {
                for (const cb of afterCbs) cb(resolved)
                return resolved
              },
              (err) => {
                for (const cb of errorCbs) cb(err)
                throw err
              },
            )
          }

          for (const cb of afterCbs) cb(result)
          return result
        } catch (err) {
          for (const cb of errorCbs) cb(err)
          throw err
        }
      }
    }

    // ─── Build user store object ────────────────────────────────────────
    const userStore: Record<string, unknown> = {}

    for (const key of Object.keys(raw)) {
      if (actionKeys.includes(key)) {
        userStore[key] = wrapAction(key, raw[key] as (...args: any[]) => unknown)
      } else {
        userStore[key] = raw[key]
      }
    }

    // ─── Build StoreApi ─────────────────────────────────────────────────
    const api: StoreApi<T> = {
      store: userStore as T,

      id,

      get state() {
        return getState()
      },

      patch(partialOrFn: Record<string, unknown> | ((state: Record<string, any>) => void)) {
        patchInProgress = true
        patchEvents = []

        batch(() => {
          if (typeof partialOrFn === 'function') {
            // Functional form: pass an object with the actual signals so user calls .set()
            const signalMap: Record<string, any> = {}
            for (const key of signalKeys) {
              signalMap[key] = raw[key]
            }
            partialOrFn(signalMap)
          } else {
            // Object form: set values directly (skip reserved proto keys)
            for (const [key, value] of Object.entries(partialOrFn)) {
              if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
              if (signalKeys.includes(key)) {
                ;(raw[key] as SignalLike).set(value)
              }
            }
          }
        })

        patchInProgress = false

        // Emit a single notification for the patch
        if (subscribers.size > 0 && patchEvents.length > 0) {
          const mutation: MutationInfo = {
            storeId: id,
            type: 'patch',
            events: patchEvents,
          }
          const state = getState()
          for (const cb of subscribers) cb(mutation, state)
        }
        patchEvents = []
      },

      subscribe(callback: SubscribeCallback, options?: { immediate?: boolean }): () => void {
        subscribers.add(callback)
        if (options?.immediate) {
          const mutation: MutationInfo = {
            storeId: id,
            type: 'direct',
            events: [],
          }
          callback(mutation, getState())
        }
        return () => {
          subscribers.delete(callback)
        }
      },

      onAction(callback: OnActionCallback): () => void {
        actionListeners.add(callback)
        return () => {
          actionListeners.delete(callback)
        }
      },

      reset() {
        batch(() => {
          for (const [key, initial] of initialValues) {
            ;(raw[key] as SignalLike).set(initial)
          }
        })
      },

      dispose() {
        for (const unsub of signalUnsubs) unsub()
        signalUnsubs.length = 0
        subscribers.clear()
        actionListeners.clear()
        getRegistry().delete(id)
      },
    }

    // Run plugins — errors in one plugin should not break store creation
    for (const plugin of _plugins) {
      try {
        plugin(api as StoreApi<Record<string, unknown>>)
      } catch (_err) {
        // Plugin errors should not break store creation
      }
    }

    registry.set(id, api)
    _notifyChange()
    return api
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Destroy a store by id so next call to useStore() re-runs setup. */
export function resetStore(id: string): void {
  getRegistry().delete(id)
  _notifyChange()
}

/** Destroy all stores — useful for SSR isolation and tests. */
export function resetAllStores(): void {
  getRegistry().clear()
  _notifyChange()
}
