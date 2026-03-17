/**
 * @pyreon/solid-compat
 *
 * Fully SolidJS-compatible API powered by Pyreon's reactive engine.
 *
 * Components re-render on state change via the compat JSX runtime wrapper.
 * Signals use Pyreon's native signal system internally (enabling auto-tracking
 * for createEffect/createMemo), while the component body runs inside
 * `runUntracked` to prevent signal reads from being tracked by the reactive
 * accessor. Only the version signal triggers re-renders.
 *
 * USAGE:
 *   import { createSignal, createEffect } from "solid-js"  // aliased by vite plugin
 */

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
import { getCurrentCtx, getHookIndex } from "./jsx-runtime"

// ─── createSignal ────────────────────────────────────────────────────────────

export type SignalGetter<T> = () => T
export type SignalSetter<T> = (v: T | ((prev: T) => T)) => void

export function createSignal<T>(initialValue: T): [SignalGetter<T>, SignalSetter<T>] {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx >= ctx.hooks.length) {
      ctx.hooks[idx] = pyreonSignal<T>(initialValue)
    }
    const s = ctx.hooks[idx] as ReturnType<typeof pyreonSignal<T>>
    const { scheduleRerender } = ctx

    const getter: SignalGetter<T> = () => s()
    const setter: SignalSetter<T> = (v) => {
      if (typeof v === "function") {
        s.update(v as (prev: T) => T)
      } else {
        s.set(v)
      }
      scheduleRerender()
    }
    return [getter, setter]
  }

  // Outside component — plain Pyreon signal
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

/**
 * Solid-compatible `createEffect` — creates a reactive side effect.
 *
 * In component context: hook-indexed, only created on first render. The effect
 * uses Pyreon's native tracking so signal reads are automatically tracked.
 * A re-entrance guard prevents infinite loops from signal writes inside
 * the effect.
 */
export function createEffect(fn: () => void): void {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return // Already registered on first render

    let running = false
    const e = pyreonEffect(() => {
      if (running) return
      running = true
      try {
        fn()
      } finally {
        running = false
      }
    })
    const stop = () => e.dispose()
    ctx.hooks[idx] = stop
    ctx.unmountCallbacks.push(stop)
    return
  }

  // Outside component
  pyreonEffect(fn)
}

// ─── createRenderEffect ──────────────────────────────────────────────────────

/**
 * Solid-compatible `createRenderEffect` — same as createEffect.
 * In Solid, this runs during the render phase; here it runs as a Pyreon effect.
 */
export function createRenderEffect(fn: () => void): void {
  createEffect(fn)
}

// ─── createComputed (legacy Solid API) ───────────────────────────────────────

export { createEffect as createComputed }

// ─── createMemo ──────────────────────────────────────────────────────────────

/**
 * Solid-compatible `createMemo` — derives a value from reactive sources.
 *
 * In component context: hook-indexed, only created on first render.
 * Uses Pyreon's native computed for auto-tracking.
 */
export function createMemo<T>(fn: () => T): () => T {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx >= ctx.hooks.length) {
      ctx.hooks[idx] = pyreonComputed(fn)
    }
    const c = ctx.hooks[idx] as ReturnType<typeof pyreonComputed<T>>
    return () => c()
  }

  // Outside component
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

/**
 * Solid-compatible `onMount` — runs once after the component's first render.
 */
type CleanupFn = () => void
export function onMount(fn: () => CleanupFn | undefined): void {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx >= ctx.hooks.length) {
      ctx.hooks[idx] = true
      ctx.pendingEffects.push({
        fn: () => {
          fn()
          return undefined
        },
        deps: undefined,
        cleanup: undefined,
      })
    }
    return
  }

  // Outside component
  pyreonOnMount(fn)
}

/**
 * Solid-compatible `onCleanup` — registers a callback to run when the component unmounts.
 */
export function onCleanup(fn: () => void): void {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx >= ctx.hooks.length) {
      ctx.hooks[idx] = true
      ctx.unmountCallbacks.push(fn)
    }
    return
  }

  // Outside component
  pyreonOnUnmount(fn)
}

// ─── createSelector ──────────────────────────────────────────────────────────

export function createSelector<T>(source: () => T): (key: T) => boolean {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx >= ctx.hooks.length) {
      ctx.hooks[idx] = pyreonCreateSelector(source)
    }
    return ctx.hooks[idx] as (key: T) => boolean
  }

  return pyreonCreateSelector(source)
}

// ─── mergeProps ──────────────────────────────────────────────────────────────

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never

type MergeProps<T extends object[]> = UnionToIntersection<T[number]>

export function mergeProps<T extends object[]>(...sources: [...T]): MergeProps<T> {
  const target = {} as Record<PropertyKey, unknown>
  for (const source of sources) {
    const descriptors = Object.getOwnPropertyDescriptors(source)
    for (const key of Reflect.ownKeys(descriptors)) {
      const desc = descriptors[key as string]
      if (!desc) continue
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
  return target as MergeProps<T>
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
    if (!desc) continue
    const target = typeof key === "string" && keySet.has(key) ? picked : rest
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

export { pyreonCreateContext as createContext, pyreonUseContext as useContext }

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

export { ErrorBoundary, For, Match, Show, Suspense, Switch }
