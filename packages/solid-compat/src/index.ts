// @pyreon/solid-compat — SolidJS-compatible API shims running on Pyreon's reactive engine

import type { ComponentFn, Props, VNodeChild } from "@pyreon/core"
import {
  ErrorBoundary,
  For,
  Match,
  createContext as pyreonCreateContext,
  onMount as pyreonOnMount,
  onUnmount as pyreonOnUnmount,
  useContext as pyreonUseContext,
  Show,
  Suspense,
  Switch,
} from "@pyreon/core"
import {
  type EffectScope,
  effectScope,
  getCurrentScope,
  batch as pyreonBatch,
  computed as pyreonComputed,
  createSelector as pyreonCreateSelector,
  effect as pyreonEffect,
  signal as pyreonSignal,
  runUntracked,
  setCurrentScope,
} from "@pyreon/reactivity"

// ─── createSignal ────────────────────────────────────────────────────────────

export type SignalGetter<T> = () => T
export type SignalSetter<T> = (v: T | ((prev: T) => T)) => void

export function createSignal<T>(initialValue: T): [SignalGetter<T>, SignalSetter<T>] {
  const s = pyreonSignal<T>(initialValue)

  const getter: SignalGetter<T> = () => s()

  const setter: SignalSetter<T> = (v) => {
    if (typeof v === "function") {
      s.update(v as (prev: T) => T)
    } else {
      s.set(v)
    }
  }

  return [getter, setter]
}

// ─── createEffect ────────────────────────────────────────────────────────────

export function createEffect(fn: () => void): void {
  pyreonEffect(fn)
}

// ─── createRenderEffect ──────────────────────────────────────────────────────

export function createRenderEffect(fn: () => void): void {
  pyreonEffect(fn)
}

// ─── createComputed (legacy Solid API) ───────────────────────────────────────

export { createEffect as createComputed }

// ─── createMemo ──────────────────────────────────────────────────────────────

export function createMemo<T>(fn: () => T): () => T {
  const c = pyreonComputed(fn)
  return () => c()
}

// ─── createRoot ──────────────────────────────────────────────────────────────

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const scope = effectScope()
  const prev = getCurrentScope()
  setCurrentScope(scope)
  try {
    return fn(() => scope.stop())
  } finally {
    setCurrentScope(prev)
  }
}

// ─── on ──────────────────────────────────────────────────────────────────────

type AccessorArray = readonly (() => unknown)[]
type OnEffectFunction<D, V> = (input: D, prevInput: D | undefined, prev: V | undefined) => V

export function on<S extends (() => unknown) | AccessorArray, V>(
  deps: S,
  fn: OnEffectFunction<
    S extends () => infer R ? R : S extends readonly (() => infer R)[] ? R[] : never,
    V
  >,
): () => V | undefined {
  type D = S extends () => infer R ? R : S extends readonly (() => infer R)[] ? R[] : never

  let prevInput: D | undefined
  let prevValue: V | undefined
  let initialized = false

  return () => {
    // Read dependencies to register tracking
    const input: D = (
      Array.isArray(deps) ? (deps as (() => unknown)[]).map((d) => d()) : (deps as () => unknown)()
    ) as D

    if (!initialized) {
      initialized = true
      prevValue = fn(input, undefined, undefined)
      prevInput = input
      return prevValue
    }

    const result = runUntracked(() => fn(input, prevInput, prevValue))
    prevInput = input
    prevValue = result
    return result
  }
}

// ─── batch ───────────────────────────────────────────────────────────────────

export { pyreonBatch as batch }

// ─── untrack ─────────────────────────────────────────────────────────────────

export { runUntracked as untrack }

// ─── onMount / onCleanup ─────────────────────────────────────────────────────

export { pyreonOnMount as onMount }
export { pyreonOnUnmount as onCleanup }

// ─── createSelector ──────────────────────────────────────────────────────────

export { pyreonCreateSelector as createSelector }

// ─── mergeProps ──────────────────────────────────────────────────────────────

export function mergeProps<T extends object[]>(...sources: [...T]): T[number] {
  const target = {} as Record<PropertyKey, unknown>
  for (const source of sources) {
    const descriptors = Object.getOwnPropertyDescriptors(source)
    for (const key of Reflect.ownKeys(descriptors)) {
      const desc = descriptors[key as string]
      // desc is always defined — getOwnPropertyDescriptors returns valid descriptors
      // Preserve getters for reactivity
      if (desc.get) {
        Object.defineProperty(target, key, {
          get: desc.get,
          enumerable: true,
          configurable: true,
        })
      } else {
        Object.defineProperty(target, key, {
          value: desc.value,
          writable: true,
          enumerable: true,
          configurable: true,
        })
      }
    }
  }
  return target as T[number]
}

// ─── splitProps ──────────────────────────────────────────────────────────────

export function splitProps<T extends Record<string, unknown>, K extends (keyof T)[]>(
  props: T,
  ...keys: K
): [Pick<T, K[number]>, Omit<T, K[number]>] {
  const picked = {} as Pick<T, K[number]>
  const rest = {} as Record<string, unknown>
  const keySet = new Set<string>(keys.flat() as string[])

  const descriptors = Object.getOwnPropertyDescriptors(props)
  for (const key of Reflect.ownKeys(descriptors)) {
    const desc = descriptors[key as string]
    // desc is always defined — getOwnPropertyDescriptors returns valid descriptors
    const target = (typeof key === "string" && keySet.has(key)) ? picked : rest
    if (desc.get) {
      Object.defineProperty(target, key, {
        get: desc.get,
        enumerable: true,
        configurable: true,
      })
    } else {
      Object.defineProperty(target, key, {
        value: desc.value,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
  }

  return [picked, rest as Omit<T, K[number]>]
}

// ─── children ────────────────────────────────────────────────────────────────

export function children(fn: () => VNodeChild): () => VNodeChild {
  const memo = createMemo(() => {
    const result = fn()
    // Resolve function children (reactive getters)
    if (typeof result === "function") return (result as () => VNodeChild)()
    return result
  })
  return memo
}

// ─── lazy ────────────────────────────────────────────────────────────────────

export function lazy<P extends Props>(
  loader: () => Promise<{ default: ComponentFn<P> }>,
): ComponentFn<P> & { preload: () => Promise<{ default: ComponentFn<P> }> } {
  let resolved: ComponentFn<P> | null = null
  let error: Error | null = null
  let promise: Promise<{ default: ComponentFn<P> }> | null = null

  const load = () => {
    if (!promise) {
      promise = loader()
        .then((mod) => {
          resolved = mod.default
          return mod
        })
        .catch((err) => {
          error = err instanceof Error ? err : new Error(String(err))
          // Allow retry on next render by resetting the promise
          promise = null
          throw error
        })
    }
    return promise
  }

  const LazyComponent = ((props: P) => {
    if (error) throw error
    if (!resolved) {
      // Throw the promise so Suspense can catch it
      throw load()
    }
    return resolved(props)
  }) as ComponentFn<P> & { preload: () => Promise<{ default: ComponentFn<P> }> }

  LazyComponent.preload = load

  return LazyComponent
}

// ─── createContext / useContext ───────────────────────────────────────────────

export { pyreonCreateContext as createContext }
export { pyreonUseContext as useContext }

// ─── getOwner / runWithOwner ─────────────────────────────────────────────────

export function getOwner(): EffectScope | null {
  return getCurrentScope()
}

export function runWithOwner<T>(owner: EffectScope | null, fn: () => T): T {
  const prev = getCurrentScope()
  setCurrentScope(owner)
  try {
    return fn()
  } finally {
    setCurrentScope(prev)
  }
}

// ─── Re-exports from @pyreon/core ──────────────────────────────────────────────

export { Show, Switch, Match, For, Suspense, ErrorBoundary }
