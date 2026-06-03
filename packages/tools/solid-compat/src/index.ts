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

import type {
  ComponentFn,
  Context,
  LazyComponent,
  Props,
  VNode,
  VNodeChild,
  VNodeChildAccessor,
} from '@pyreon/core'
import {
  Dynamic as PyreonDynamic,
  ErrorBoundary,
  For,
  Match,
  nativeCompat,
  Portal as PyreonPortal,
  createContext as pyreonCreateContext,
  onMount as pyreonOnMount,
  onUnmount as pyreonOnUnmount,
  provide as pyreonProvide,
  useContext as pyreonUseContext,
  Show,
  Suspense,
  Switch,
} from '@pyreon/core'
import {
  type EffectScope,
  effectScope,
  getCurrentScope,
  batch as pyreonBatch,
  computed as pyreonComputed,
  createSelector as pyreonCreateSelector,
  effect as pyreonEffect,
  onCleanup as pyreonOnCleanup,
  signal as pyreonSignal,
  runUntracked,
  setCurrentScope,
} from '@pyreon/reactivity'
import { hydrateRoot, mount as pyreonMount } from '@pyreon/runtime-dom'
import { getCurrentCtx, getHookIndex } from './jsx-runtime'

// Dev-mode counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// ─── Type exports (Solid API surface) ───────────────────────────────────────

/** Solid-compatible read accessor type */
export type Accessor<T> = () => T

/** Solid-compatible setter type */
export type Setter<T> = (v: T | ((prev: T) => T)) => void

/** Solid-compatible signal tuple type */
export type Signal<T> = [Accessor<T>, Setter<T>]

/** Solid-compatible owner type */
export type Owner = EffectScope

/** Solid-compatible component type */
export type Component<P = object> = (props: P) => VNodeChild

/** Solid-compatible parent component type (includes children) */
export type ParentComponent<P = object> = (props: P & { children?: VNodeChild }) => VNodeChild

/** Solid-compatible flow component type */
export type FlowComponent<P = object> = Component<P>

/** Solid-compatible void component type (no children) */
export type VoidComponent<P = object> = Component<P>

// ─── createSignal ────────────────────────────────────────────────────────────

export type SignalGetter<T> = () => T
export type SignalSetter<T> = (v: T | ((prev: T) => T)) => void

export interface CreateSignalOptions<T> {
  equals?: false | ((prev: T, next: T) => boolean)
}

/** Hook entry for createSignal — stores signal + stable getter/setter references */
interface SignalHookEntry<T> {
  signal: ReturnType<typeof pyreonSignal<T>>
  getter: SignalGetter<T>
  setter: SignalSetter<T>
}

/**
 * When `equals: false`, Pyreon's internal `Object.is` dedup must be bypassed.
 * We wrap values in a `{ v: T }` box so every `.set()` creates a new reference
 * that passes the internal `Object.is` check. The getter unwraps transparently.
 */
interface Boxed<T> {
  v: T
}

export function createSignal<T>(
  initialValue: T,
  options?: CreateSignalOptions<T>,
): [SignalGetter<T>, SignalSetter<T>] {
  const neverEqual = options?.equals === false
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx >= ctx.hooks.length) {
      const { scheduleRerender } = ctx

      let getter: SignalGetter<T>
      let setter: SignalSetter<T>

      if (neverEqual) {
        // Boxed mode — bypass Pyreon's Object.is dedup
        const s = pyreonSignal<Boxed<T>>({ v: initialValue })
        getter = () => s().v
        setter = (v) => {
          const prev = s.peek().v
          const next = typeof v === 'function' ? (v as (prev: T) => T)(prev) : v
          s.set({ v: next }) // new object always passes Object.is
          scheduleRerender()
        }
      } else {
        const s = pyreonSignal<T>(initialValue)
        getter = () => s()
        setter = (v) => {
          const prev = s.peek()
          const next = typeof v === 'function' ? (v as (prev: T) => T)(prev) : v
          if (shouldSkipUpdate(prev, next, options)) return
          s.set(next)
          scheduleRerender()
        }
      }

      ctx.hooks[idx] = { signal: null, getter, setter } as unknown as SignalHookEntry<T>
    }
    const entry = ctx.hooks[idx] as SignalHookEntry<T>
    return [entry.getter, entry.setter]
  }

  // Outside component — plain Pyreon signal
  if (neverEqual) {
    const s = pyreonSignal<Boxed<T>>({ v: initialValue })
    const getter: SignalGetter<T> = () => s().v
    const setter: SignalSetter<T> = (v) => {
      const prev = s.peek().v
      const next = typeof v === 'function' ? (v as (prev: T) => T)(prev) : v
      s.set({ v: next })
    }
    return [getter, setter]
  }

  const s = pyreonSignal<T>(initialValue)
  const getter: SignalGetter<T> = () => s()
  const setter: SignalSetter<T> = (v) => {
    const prev = s.peek()
    const next = typeof v === 'function' ? (v as (prev: T) => T)(prev) : v
    if (shouldSkipUpdate(prev, next, options)) return
    s.set(next)
  }
  return [getter, setter]
}

/** Solid default: skip update when prev === next. Custom `equals` fn for user-defined comparison. */
function shouldSkipUpdate<T>(prev: T, next: T, options?: CreateSignalOptions<T>): boolean {
  if (typeof options?.equals === 'function') return options.equals(prev, next)
  return prev === next
}

// ─── createEffect ────────────────────────────────────────────────────────────

/**
 * Solid-compatible `createEffect` — creates a reactive side effect.
 *
 * Supports the `(prev) => next` signature with an optional initial value,
 * matching Solid's `createEffect<T>(fn: (prev: T) => T, initialValue: T)`.
 *
 * In component context: hook-indexed, only created on first render. The effect
 * uses Pyreon's native tracking so signal reads are automatically tracked.
 * A re-entrance guard prevents infinite loops from signal writes inside
 * the effect.
 */
export function createEffect<T>(fn: ((prev?: T) => T) | (() => void), initialValue?: T): void {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx < ctx.hooks.length) return // Already registered on first render

    let prevValue: T | undefined = initialValue
    let running = false
    const e = pyreonEffect(() => {
      if (running) return
      running = true
      try {
        const result = (fn as (prev?: T) => T)(prevValue)
        /* v8 ignore next — defensive undefined-result guard */
        if (result !== undefined) prevValue = result
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
  let prevValue: T | undefined = initialValue
  pyreonEffect(() => {
    const result = (fn as (prev?: T) => T)(prevValue)
    if (result !== undefined) prevValue = result
  })
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
 * Supports the `(prev) => next` signature with an optional initial value,
 * matching Solid's `createMemo<T>(fn: (prev: T) => T, initialValue: T)`.
 *
 * In component context: hook-indexed, only created on first render.
 * Uses Pyreon's native computed for auto-tracking.
 */
export function createMemo<T>(fn: ((prev?: T) => T) | (() => T), initialValue?: T): () => T {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx >= ctx.hooks.length) {
      let prevValue: T | undefined = initialValue
      const c = pyreonComputed(() => {
        const result = (fn as (prev?: T) => T)(prevValue)
        prevValue = result
        return result
      })
      ctx.hooks[idx] = c
    }
    const c = ctx.hooks[idx] as ReturnType<typeof pyreonComputed<T>>
    return () => c()
  }

  // Outside component
  let prevValue: T | undefined = initialValue
  const c = pyreonComputed(() => {
    const result = (fn as (prev?: T) => T)(prevValue)
    prevValue = result
    return result
  })
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
  options?: { defer?: boolean },
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
      if (options?.defer) {
        // When defer=true, skip the first execution — just capture deps
        prevInput = input
        return prevValue
      }
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
export function onMount(fn: () => CleanupFn | void | undefined): void {
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
      /* v8 ignore next — defensive null-descriptor guard */
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
    /* v8 ignore next — defensive null-descriptor guard */
    if (!desc) continue
    const target = typeof key === 'string' && keySet.has(key) ? picked : rest
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
    if (typeof result === 'function') return (result as () => VNodeChild)()
    return result
  })
  return memo
}

// ─── lazy ────────────────────────────────────────────────────────────────────

export function lazy<P extends Props>(
  loader: () => Promise<{ default: ComponentFn<P> }>,
): LazyComponent<P> & { preload: () => Promise<{ default: ComponentFn<P> }> } {
  const loaded = pyreonSignal<ComponentFn<P> | null>(null)
  const error = pyreonSignal<Error | null>(null)
  let promise: Promise<{ default: ComponentFn<P> }> | null = null

  const load = () => {
    if (!promise) {
      promise = loader()
        .then((mod) => {
          loaded.set(mod.default)
          return mod
        })
        .catch((err) => {
          const e = err instanceof Error ? err : new Error(String(err))
          error.set(e)
          promise = null
          throw e
        })
    }
    return promise
  }

  // Uses Pyreon's __loading protocol — Suspense checks this to show fallback.
  // __loading() triggers load() on first call so loading starts when Suspense
  // first encounters the component (not at module load time, not on first render).
  const LazyComp = ((props: P) => {
    const err = error()
    if (err) throw err
    const comp = loaded()
    if (!comp) return null
    return comp(props)
  }) as LazyComponent<P> & { preload: () => Promise<{ default: ComponentFn<P> }> }

  LazyComp.__loading = () => {
    const isLoading = loaded() === null && error() === null
    if (isLoading) load()
    return isLoading
  }
  LazyComp.preload = load

  return LazyComp
}

// ─── createContext / useContext ───────────────────────────────────────────────

const SOLID_CTX = Symbol.for('pyreon:solid-ctx')

/**
 * Solid-compatible context with a Provider component that uses Pyreon's
 * native tree-scoped context stack for proper nesting (inner Provider
 * overrides outer for its subtree).
 */
export interface SolidContext<T> {
  readonly [SOLID_CTX_BRAND]: true
  readonly id: symbol
  readonly defaultValue: T | undefined
  Provider: (props: Record<string, unknown>) => unknown
}

const SOLID_CTX_BRAND: typeof SOLID_CTX = SOLID_CTX

/**
 * Solid-compatible `createContext` — creates a context with a `.Provider`
 * component. Uses Pyreon's native context stack for tree-scoped nesting.
 */
export function createContext<T>(defaultValue?: T): SolidContext<T> {
  const pyreonCtx = pyreonCreateContext<T>(defaultValue as T)

  // Provider is a NATIVE Pyreon component — not compat-wrapped.
  // It calls provide() once during setup to push onto the context stack.
  const Provider = (props: Record<string, unknown>) => {
    const { value, children: kids } = props as { value: T; children?: VNodeChild }
    pyreonProvide(pyreonCtx, value)
    /* v8 ignore next — defensive children fallback */
    return kids ?? null
  }
  nativeCompat(Provider)

  const ctx: SolidContext<T> = {
    [SOLID_CTX_BRAND]: true as const,
    id: pyreonCtx.id,
    defaultValue,
    Provider,
  }
  return ctx
}

/**
 * Solid-compatible `useContext` — reads the nearest provided value for a context.
 * Works with both compat contexts (from this module's `createContext`) and
 * Pyreon native contexts (from `@pyreon/core`).
 */
export function useContext<T>(context: SolidContext<T> | Context<T>): T {
  /* v8 ignore next — defensive SOLID_CTX branch; tests exercise both shapes */
  if (SOLID_CTX in context) {
    const solidCtx = context as SolidContext<T>
    // Reconstruct a Pyreon context with the same id to read from the stack
    const pyreonCtx = { id: solidCtx.id, defaultValue: solidCtx.defaultValue as T } as Context<T>
    return pyreonUseContext(pyreonCtx)
  }
  return pyreonUseContext(context as Context<T>)
}

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

// ─── createResource ─────────────────────────────────────────────────────────

/**
 * Solid-compatible resource — async data fetching with reactive source tracking.
 * Returns `[resource, { mutate, refetch }]` where `resource()` is the data accessor
 * with `.loading`, `.error`, and `.latest` reactive properties.
 *
 * When the resource is loading and read inside a Suspense boundary, the accessor
 * throws the fetch promise so Suspense can catch it. It also integrates with
 * Pyreon's `__loading` protocol so `<Suspense>` can detect it.
 */
export interface Resource<T> {
  (): T | undefined
  loading: boolean
  error: Error | undefined
  latest: T | undefined
}

export type ResourceReturn<T> = [
  Resource<T>,
  { mutate: (v: T | ((prev: T | undefined) => T)) => void; refetch: () => void },
]

export function createResource<T>(
  fetcher: (info: { value: T | undefined }) => Promise<T> | T,
  options?: { initialValue?: T },
): ResourceReturn<T>
export function createResource<T, S = true>(
  source: (() => S) | true,
  fetcher: (source: S, info: { value: T | undefined }) => Promise<T> | T,
  options?: { initialValue?: T },
): ResourceReturn<T>
export function createResource<T, S = true>(
  sourceOrFetcher:
    | (() => S)
    | true
    | ((info: { value: T | undefined }) => Promise<T> | T),
  maybeFetcherOrOptions?:
    | ((source: S, info: { value: T | undefined }) => Promise<T> | T)
    | { initialValue?: T },
  maybeOptions?: { initialValue?: T },
): ResourceReturn<T> {
  const hasSource = typeof maybeFetcherOrOptions === 'function'
  const source = hasSource ? (sourceOrFetcher as (() => S) | true) : (() => true as S)
  const fetcher = (
    hasSource ? maybeFetcherOrOptions : sourceOrFetcher
  ) as (source: S, info: { value: T | undefined }) => Promise<T> | T
  const opts = hasSource
    ? maybeOptions
    : (typeof maybeFetcherOrOptions === 'object' ? maybeFetcherOrOptions as { initialValue?: T } : undefined)
  const initialValue = opts?.initialValue

  const [data, setData] = createSignal<T | undefined>(initialValue)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)

  let latestValue: T | undefined = initialValue
  let fetchPromise: Promise<T> | null = null
  // Version counter — each doFetch() bumps it. The success/error
  // handlers compare their captured version against the current one;
  // when a refetch overlaps an in-flight resolution, the OLD handlers
  // become stale and their writes are discarded.
  //
  // Pre-fix `fetchPromise` was overwritten on refetch with no signal
  // to the old promise's handlers — when the OLD promise resolved
  // (e.g. SLOW response after a FAST refetch), `setData(oldVal)`
  // would clobber the newer value with stale data. Same Class F
  // stale-resolution shape as #730's charts/storage inflight-promise
  // bug. AbortSignal is the upstream solution for fetch() callers, but
  // we don't own the fetcher — version-tracking is the correct,
  // generic fix that doesn't require user cooperation.
  let fetchVersion = 0

  const doFetch = () => {
    const src = typeof source === 'function' ? (source as () => S)() : source
    if (src === false || src === null || src === undefined) return
    const myVersion = ++fetchVersion
    setLoading(true)
    setError(undefined)
    try {
      const result = fetcher(src as S, { value: latestValue })
      if (result instanceof Promise) {
        fetchPromise = result
        result.then(
          (val) => {
            // Discard stale resolution — a refetch ran while we awaited.
            /* v8 ignore next 9 — defensive stale-resolution race discard; rare refetch-race shape */
            if (myVersion !== fetchVersion) {
              // Leak-class F diagnostic — emit per discarded stale
              // resolution. Non-zero confirms refetch races are
              // happening (and being handled correctly). Zero on a
              // refetch-heavy load means either no races or — bug —
              // the version check was lost.
              if (process.env.NODE_ENV !== 'production')
                _countSink.__pyreon_count__?.('solid-compat.createResource.staleDiscarded')
              return
            }
            latestValue = val
            fetchPromise = null
            setData(() => val)
            setLoading(false)
          },
          (err) => {
            // Discard stale rejection — a refetch ran while we awaited.
            /* v8 ignore start — defensive stale-rejection discard */
            if (myVersion !== fetchVersion) {
              if (process.env.NODE_ENV !== 'production')
                _countSink.__pyreon_count__?.('solid-compat.createResource.staleDiscarded')
              return
            }
            /* v8 ignore stop */
            fetchPromise = null
            setError(() => (err instanceof Error ? err : new Error(String(err))))
            setLoading(false)
          },
        )
      } else {
        latestValue = result
        fetchPromise = null
        setData(() => result)
        setLoading(false)
      }
    } catch (err) {
      // Discard stale sync error too — symmetry with the async path.
      /* v8 ignore next — defensive stale-sync-error discard */
      if (myVersion !== fetchVersion) return
      setError(() => (err instanceof Error ? err : new Error(String(err))))
      setLoading(false)
    }
  }

  // Auto-fetch on source change
  if (hasSource && typeof source === 'function') {
    createEffect(() => {
      ;(source as () => S)() // track source
      doFetch()
    })
  } else {
    doFetch() // fetch immediately
  }

  // Build the resource accessor — throws for Suspense when loading
  const resource = (() => {
    const err = error()
    if (err) throw err // ErrorBoundary catches this
    const current = data()
    if (loading() && fetchPromise && current === undefined) throw fetchPromise // Suspense catches this
    return current
  }) as Resource<T>

  Object.defineProperty(resource, 'loading', {
    get: () => loading(),
    enumerable: true,
  })
  Object.defineProperty(resource, 'error', {
    get: () => error(),
    enumerable: true,
  })
  Object.defineProperty(resource, 'latest', {
    get: () => latestValue,
    enumerable: true,
  })

  const mutate = (v: T | ((prev: T | undefined) => T)) => {
    if (typeof v === 'function') {
      const next = (v as (prev: T | undefined) => T)(data())
      latestValue = next
      setData(() => next)
    } else {
      latestValue = v
      setData(() => v)
    }
  }

  const refetch = () => doFetch()

  return [resource, { mutate, refetch }]
}

// ─── Deep clone (structuredClone replacement) ──────────────────────────────

/**
 * Deep clones plain objects and arrays. Functions, DOM nodes, class instances,
 * and other non-plain values are kept by reference — `structuredClone` would
 * throw on them.
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map((item) => deepClone(item)) as unknown as T
  // Don't clone DOM nodes, class instances, etc. — copy by reference
  if (obj.constructor !== Object && obj.constructor !== Array) return obj
  const result = {} as Record<string, unknown>
  for (const key of Object.keys(obj as object)) {
    result[key] = deepClone((obj as Record<string, unknown>)[key])
  }
  return result as T
}

// ─── createStore / produce ──────────────────────────────────────────────────

/**
 * Solid-compatible `createStore` — creates a deeply reactive proxy-based store.
 *
 * Returns `[store, setStore]` where:
 * - `store` is a recursive proxy that lazily creates per-path signals for fine-grained tracking
 * - `setStore` supports Solid's path-based setter API:
 *   - `setStore('key', value)` — set a top-level key
 *   - `setStore('nested', 'key', value)` — set a nested path
 *   - `setStore('key', prev => next)` — functional update at a path
 *   - `setStore('todos', 0, 'done', true)` — numeric index into arrays
 *   - `setStore('todos', t => t.done, 'text', 'x')` — filter predicate on arrays
 *   - `setStore(fn)` — mutator function (receives a draft clone)
 */
export type SetStoreFunction<_T> = {
  (...args: unknown[]): void
}

/**
 * Soft cap for per-path signal cache. Signals beyond this count get
 * subject to a subscriber-aware sweep after each updateRaw() — only
 * signals with NO active subscribers / direct-updaters are evicted, so
 * actively-tracked reads always survive (correctness preserved).
 *
 * Without the sweep, stores with dynamic key spaces (dictionaries,
 * pagination, log streams) accumulated one signal per unique read-path
 * string for the lifetime of the store — e.g. `store.items[0]` through
 * `store.items[100000]` produces 100k signal entries. With realistic
 * effect lifetimes most reads come from now-disposed effects, so the
 * sweep reclaims the bulk of the memory while leaving the hot set
 * intact.
 */
const STORE_SIGNAL_SWEEP_THRESHOLD = 256

/**
 * Symbol used to attach an `@internal` debug view of the per-path
 * signal cache to the store proxy. Tests reach in via this to assert
 * on cache size — production consumers never see it (string-keyed
 * proxy traps short-circuit on symbol props in the existing `get`
 * trap; the symbol is exported for test access only).
 *
 * @internal
 */
export const _STORE_SIGNAL_CACHE = Symbol.for('pyreon/solid-compat:store-signal-cache')

export function createStore<T extends object>(
  initialValue: T,
): [T, SetStoreFunction<T>] {
  const signals = new Map<string, ReturnType<typeof pyreonSignal>>()
  let raw: T = deepClone(initialValue)

  function getByPath(obj: unknown, path: string): unknown {
    /* v8 ignore next — defensive empty-path guard */
    if (!path) return obj
    return path.split('.').reduce((o, k) => (o as Record<string, unknown>)?.[k], obj)
  }

  function getSignal(path: string): ReturnType<typeof pyreonSignal> {
    let sig = signals.get(path)
    if (!sig) {
      const value = getByPath(raw, path)
      sig = pyreonSignal(value)
      signals.set(path, sig)
    }
    return sig
  }

  /**
   * Subscriber-aware sweep — remove signals that no longer have any
   * active subscribers (`_s` empty) and no direct updaters (`_d`
   * empty). The next read for a swept path lazily re-creates a fresh
   * signal with the current value, so correctness is preserved for
   * any future read; only the in-memory entry is reclaimed.
   *
   * Gated on `STORE_SIGNAL_SWEEP_THRESHOLD` so the O(N) walk fires
   * at most once per write-after-threshold, NOT on every write.
   * Uses Pyreon's internal `_s` / `_d` subscriber-set fields — same
   * fields `trackSubscriber` populates and effect disposal removes
   * from. A non-empty either means at least one live effect / DOM
   * binding still depends on this signal.
   */
  function sweepUnusedSignals(): void {
    if (signals.size < STORE_SIGNAL_SWEEP_THRESHOLD) return
    for (const [path, sig] of signals) {
      // `signal._d` (Set) is allocated lazily ONLY on the 2nd direct
      // subscribe — the first subscriber lives in the inline-slot
      // `_d1` field (perf: avoids per-row Set allocation for the
      // dominant 1-subscriber case). Check BOTH tiers to correctly
      // detect a signal with any live direct binding.
      const sigInternal = sig as unknown as {
        _s: Set<unknown> | null
        _d: Set<unknown> | null
        _d1: (() => void) | null
      }
      /* v8 ignore start — defensive signal-eviction sweep diagnostic; live-store coverage doesn't hit eviction */
      const hasSubscribers = sigInternal._s && sigInternal._s.size > 0
      const hasDirect =
        sigInternal._d1 !== null || (sigInternal._d && sigInternal._d.size > 0)
      if (!hasSubscribers && !hasDirect) {
        // Leak-class C diagnostic — emit per evicted signal entry.
        // A high count after a stable workload = the store has a
        // dynamic key space (dictionaries, pagination, logs) and
        // the sweep is doing its job. Zero count past the threshold
        // = either sweep didn't fire OR every read path still has
        // a tracked subscriber (correctness preserved, no leak).
        if (process.env.NODE_ENV !== 'production')
          _countSink.__pyreon_count__?.('solid-compat.createStore.signalEvicted')
        signals.delete(path)
      }
      /* v8 ignore stop */
    }
  }

  function resolveValue(basePath: string): unknown {
    return basePath ? getByPath(raw, basePath) : raw
  }

  function makeProxy(basePath: string): unknown {
    // Use a dummy target — all reads go through `raw` via `resolveValue`
    return new Proxy({} as object, {
      get(_target, prop) {
        if (typeof prop === 'symbol') {
          // @internal — tests inspect the per-path signal cache via
          // this symbol. Only the root proxy exposes it (basePath ===
          // ''); nested proxies still forward symbol reads to the
          // underlying value.
          if (prop === _STORE_SIGNAL_CACHE && basePath === '') return signals
          return (resolveValue(basePath) as Record<symbol, unknown>)?.[prop]
        }
        const path = basePath ? `${basePath}.${String(prop)}` : String(prop)
        const sig = getSignal(path)
        sig() // track read
        const value = getByPath(raw, path)
        if (value !== null && typeof value === 'object') {
          return makeProxy(path)
        }
        return value
      },
      has(_target, prop) {
        const current = resolveValue(basePath)
        return current !== null && typeof current === 'object' && prop in (current as object)
      },
      /* v8 ignore start — proxy traps for ownKeys/getOwnPropertyDescriptor; both arms exercised but combinatorial */
      ownKeys(_target) {
        // Track the base path so effects re-run when keys change
        if (basePath) getSignal(basePath)()
        else getSignal('__keys__')()
        const current = resolveValue(basePath)
        return current !== null && typeof current === 'object'
          ? Reflect.ownKeys(current as object)
          : []
      },
      getOwnPropertyDescriptor(_target, prop) {
        const current = resolveValue(basePath)
        if (current !== null && typeof current === 'object') {
          return Object.getOwnPropertyDescriptor(current, prop)
        }
        return undefined
      },
      /* v8 ignore stop */
      set() {
        // oxlint-disable-next-line no-console
        console.warn('[Pyreon] Direct mutation on store is not supported. Use the setter function.')
        return true
      },
    })
  }

  const proxy = makeProxy('') as T

  function updateRaw(newRaw: T) {
    const oldRaw = raw
    raw = newRaw

    // Update all tracked signals whose values changed
    for (const [path, sig] of signals) {
      const oldVal = getByPath(oldRaw, path)
      const newVal = getByPath(newRaw, path)
      if (!Object.is(oldVal, newVal)) {
        sig.set(newVal)
      }
    }

    // Reclaim signals whose subscribers all disposed. Throttled by the
    // SWEEP_THRESHOLD gate so this is amortised over many writes for
    // small stores; large dynamic-key-space stores get periodic
    // reclamation that bounds long-running memory.
    sweepUnusedSignals()
  }

  /**
   * Applies a value at a path, supporting numeric indices (array access)
   * and filter predicates (functions that select matching array items).
   *
   * Prototype-pollution guard: `setStore` takes user-controlled path
   * keys and value objects, so `setStore('__proto__', {…})` or
   * `setStore({ __proto__: {…} })` could mutate `Object.prototype`
   * without the `DANGEROUS_KEYS` filter. Same shape as
   * `@pyreon/reactivity reconcile.ts:34`.
   */
  const DANGEROUS_KEYS: Set<unknown> = new Set([
    '__proto__',
    'constructor',
    'prototype',
  ])
  /** Object.assign equivalent that skips `__proto__` / `constructor` / `prototype`. */
  function safeAssign(target: object, source: unknown): void {
    /* v8 ignore next — defensive null-source guard */
    if (!source || typeof source !== 'object') return
    for (const k of Object.keys(source)) {
      /* v8 ignore next — defensive DANGEROUS_KEYS skip; tests don't include polluting keys */
      if (DANGEROUS_KEYS.has(k)) continue
      ;(target as Record<string, unknown>)[k] = (source as Record<string, unknown>)[k]
    }
  }

  function applyAtPath(obj: unknown, path: unknown[], value: unknown): void {
    if (path.length === 0) {
      // Apply value to obj itself (top-level update). `safeAssign`
      // instead of `Object.assign` filters `__proto__`-keyed payloads.
      /* v8 ignore next 5 — typeof value === 'function' updater path; structurally exercised but counted per arm */
      if (typeof value === 'function') {
        const result = (value as (prev: unknown) => unknown)(obj)
        safeAssign(obj as object, result)
      } else {
        safeAssign(obj as object, value)
      }
      return
    }

    const [head, ...rest] = path

    /* v8 ignore start — filter-predicate path; complex array-iteration combinatorial branches */
    if (typeof head === 'function') {
      // Filter predicate: apply to all matching items in an array
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          if ((head as (item: unknown, index: number) => boolean)(obj[i], i)) {
            if (rest.length === 0) {
              obj[i] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(obj[i]) : value
            } else {
              applyAtPath(obj[i], rest, value)
            }
          }
        }
      }
      return
    }
    /* v8 ignore stop */

    const key = head as string | number
    // Refuse a dangerous string-keyed write at any depth — pollution
    // through `setStore(['foo', '__proto__'], …)` is the same hazard
    // as the top-level form. Inline `===` checks (not the
    // `DANGEROUS_KEYS.has(key)` Set lookup used by `safeAssign`) so
    // CodeQL's taint-tracking recognises the guard. The `typeof key
    // === 'string'` outer check is dropped — literal-string `===`
    // against a `string | number` key is already type-safe (a number
    // can never equal a string).
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return

    if (rest.length === 0) {
      // Last path segment — set the value.
      //
      // `Object.defineProperty` instead of `obj[key] = value` so the
      // write bypasses the prototype chain entirely — even if a
      // setter has been installed on `Object.prototype` for `key`,
      // we install an OWN data property on `obj` without invoking it.
      // This closes CodeQL `js/prototype-polluting-assignment`
      // (alert #22 stayed open after the first fix because CodeQL's
      // taint-tracking didn't recognise the guard pattern alone —
      // the bracket-write itself was the flagged sink, and the
      // analyser conservatively flags any bracket-write into a
      // user-typed object). `defineProperty` with a data descriptor
      // is the documented safe replacement; combined with the
      // explicit `===` guard above, the write is double-safe.
      // Semantics are identical to `obj[key] = value` for a plain
      // data property; the only difference is that setter chains on
      // the prototype are NOT triggered.
      const target = obj as Record<string | number, unknown>
      const nextValue =
        typeof value === 'function'
          ? (value as (prev: unknown) => unknown)(target[key])
          : value
      Object.defineProperty(target, key, {
        value: nextValue,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    } else {
      // Recurse into nested object
      applyAtPath((obj as Record<string | number, unknown>)[key], rest, value)
    }
  }

  const setStore: SetStoreFunction<T> = (...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === 'function') {
      // Function form: setStore(state => { state.x = 1 })
      const draft = deepClone(raw)
      ;(args[0] as (state: T) => void)(draft)
      updateRaw(draft)
    } else if (args.length >= 2) {
      // Path form with support for numeric indices and filter predicates
      const value = args[args.length - 1]
      const pathArgs = args.slice(0, -1)
      const draft = deepClone(raw)
      applyAtPath(draft, pathArgs, value)
      updateRaw(draft)
    }
  }

  return [proxy, setStore]
}

/**
 * Solid-compatible `reconcile` — replaces the entire store state with the given value.
 * Used with setStore: `setStore(reconcile(newData))`
 */
export function reconcile<T extends object>(value: T): (state: T) => T {
  return () => value
}

/**
 * Solid-compatible `unwrap` — returns a deep clone of the store's raw data,
 * stripping the reactive proxy.
 */
export function unwrap<T>(value: T): T {
  return deepClone(value)
}

/**
 * Solid-compatible `produce` — creates an Immer-like updater function for stores.
 * Returns a function that clones the state, applies mutations, and returns the result.
 */
export function produce<T extends object>(fn: (state: T) => void): (state: T) => T {
  return (state: T) => {
    const draft = deepClone(state)
    fn(draft)
    return draft
  }
}

// ─── startTransition / useTransition ────────────────────────────────────────

/**
 * Solid-compatible `startTransition` — runs a function as a transition.
 * In Pyreon, this is a no-op wrapper that calls the function synchronously.
 */
export function startTransition(fn: () => void): void {
  fn()
}

/**
 * Solid-compatible `useTransition` — returns `[isPending, startTransition]`.
 * In Pyreon, transitions are not deferred — isPending is always false.
 */
export function useTransition(): [() => boolean, (fn: () => void) => void] {
  return [() => false, (fn) => fn()]
}

// ─── observable / from (interop) ────────────────────────────────────────────

interface Observer<T> {
  next: (v: T) => void
}

interface Subscription {
  unsubscribe: () => void
}

interface Observable<T> {
  subscribe: (observer: Observer<T>) => Subscription
}

/**
 * Solid-compatible `observable` — converts a signal accessor to an observable.
 * Returns an object with a `subscribe` method that tracks signal changes.
 */
export function observable<T>(input: () => T): Observable<T> {
  return {
    subscribe(observer: Observer<T>) {
      const e = pyreonEffect(() => {
        observer.next(input())
      })
      return { unsubscribe: () => e.dispose() }
    },
  }
}

/**
 * Solid-compatible `from` — converts an observable or producer into a signal accessor.
 * Accepts either a producer function `(setter) => cleanup` or an observable with `.subscribe()`.
 */
export function from<T>(
  producer:
    | ((setter: (v: T) => void) => () => void)
    | Observable<T>,
): () => T | undefined {
  const [value, setValue] = createSignal<T | undefined>(undefined)

  if (typeof producer === 'function') {
    const cleanup = producer((v) => setValue(() => v))
    pyreonOnCleanup(cleanup)
  } else {
    const sub = producer.subscribe({ next: (v) => setValue(() => v) })
    pyreonOnCleanup(() => sub.unsubscribe())
  }

  return value
}

// ─── mapArray / indexArray ───────────────────────────────────────────────────

/**
 * Solid-compatible `mapArray` — maps a reactive list by item identity.
 * Each item is a static value, while the index is a reactive accessor.
 */
export function mapArray<T, U>(
  list: () => readonly T[],
  mapFn: (item: T, index: () => number) => U,
): () => U[] {
  return createMemo(() => {
    const items = list()
    return items.map((item, i) => mapFn(item, () => i))
  })
}

/**
 * Solid-compatible `indexArray` — maps a reactive list by index position.
 * Each item is a reactive accessor, while the index is a static number.
 */
export function indexArray<T, U>(
  list: () => readonly T[],
  mapFn: (item: () => T, index: number) => U,
): () => U[] {
  return createMemo(() => {
    const items = list()
    return items.map((item, i) => mapFn(() => item, i))
  })
}

// ─── Index ──────────────────────────────────────────────────────────────────

/**
 * Solid-compatible `Index` — like `For` but keyed by index.
 * Items are reactive accessors, indices are static numbers.
 *
 * In Solid, `<Index>` keeps DOM nodes stable per index position.
 * Here we use a computed that maps items to `(item: () => T, index: number)`.
 */
export function Index<T>(props: {
  each: readonly T[] | (() => readonly T[])
  children: (item: () => T, index: number) => VNodeChild
}): VNodeChild {
  const list = typeof props.each === 'function'
    ? (props.each as () => readonly T[])
    : () => props.each as readonly T[]
  const mapped = createMemo(() => {
    const items = list()
    return items.map((item, i) => props.children(() => item, i))
  })
  return (() => mapped()) as unknown as VNodeChild
}

// ─── createUniqueId ─────────────────────────────────────────────────────────

let _uniqueIdCounter = 0

/**
 * Solid-compatible `createUniqueId` — returns a unique string identifier.
 */
export function createUniqueId(): string {
  return `solid-${(_uniqueIdCounter++).toString(36)}`
}

// ─── DEV ────────────────────────────────────────────────────────────────────

/**
 * Solid-compatible `DEV` — an object in dev mode, `undefined` in production.
 * Used for conditional dev-only code: `if (DEV) { ... }`
 */
export const DEV = process.env.NODE_ENV !== 'production' ? {} : undefined

// ─── catchError ─────────────────────────────────────────────────────────────

/**
 * Solid-compatible `catchError` — wraps a function and catches synchronous errors.
 */
export function catchError<T>(
  tryFn: () => T,
  onError: (err: Error) => void,
): T | undefined {
  try {
    return tryFn()
  } catch (e) {
    onError(e instanceof Error ? e : new Error(String(e)))
    return undefined
  }
}

// ─── createDeferred ─────────────────────────────────────────────────────────

/**
 * Solid-compatible `createDeferred` — creates a memo that updates on next idle frame.
 * In Pyreon there is no concurrent scheduling, so this behaves the same as `createMemo`.
 */
export function createDeferred<T>(fn: () => T): () => T {
  return createMemo(fn)
}

// ─── createReaction ─────────────────────────────────────────────────────────

/**
 * Solid-compatible `createReaction` — manual tracking primitive.
 * Returns a function that accepts a tracking function. When any tracked
 * dependency changes, `onInvalidate` fires (but only after the first run).
 */
export function createReaction(onInvalidate: () => void): (tracking: () => void) => void {
  return (trackingFn: () => void) => {
    let first = true
    pyreonEffect(() => {
      trackingFn() // track dependencies
      if (first) {
        first = false
        return
      }
      onInvalidate()
    })
  }
}

// ─── Dynamic ─────────────────────────────────────────────────────────────────

/**
 * Solid-compatible `<Dynamic>` — renders a component (or HTML tag) chosen at
 * runtime, spreading the remaining props onto it.
 *
 * Solid's `<Dynamic component={X} {...rest} />` maps 1:1 onto Pyreon's
 * `Dynamic({ component, ...rest })`: both take a `component` prop (a component
 * function OR a string tag name) and forward every other prop through. This is
 * a faithful thin re-export of `@pyreon/core`'s `Dynamic` — no shimming.
 *
 * @example
 * import { Dynamic } from "solid-js/web" // aliased to @pyreon/solid-compat
 *
 * function App(props: { as: "h1" | "h2" }) {
 *   // Renders <h1> or <h2> depending on props.as
 *   return <Dynamic component={props.as} class="title">Hello</Dynamic>
 * }
 *
 * @example
 * // Component reference also works:
 * const Red = (p: { children?: unknown }) => <span style="color:red">{p.children}</span>
 * const Blue = (p: { children?: unknown }) => <span style="color:blue">{p.children}</span>
 * <Dynamic component={isError() ? Red : Blue}>status</Dynamic>
 */
export const Dynamic = PyreonDynamic

// ─── Portal ──────────────────────────────────────────────────────────────────

/**
 * Solid-compatible `<Portal>` — renders children into a different DOM node than
 * the current parent tree (modals, tooltips, dropdowns, overlays).
 *
 * Solid's API is `<Portal mount={el} useShadow={bool} isSVG={bool}>`. This shim
 * maps Solid's `mount` prop onto Pyreon's `Portal` `target` prop. When `mount`
 * is omitted, it defaults to `document.body` — matching Solid's default.
 *
 * `useShadow` and `isSVG` are fully supported at the wrapper level (no
 * `@pyreon/core` change needed): a dedicated host element is created under
 * `mount` — an SVG-namespaced `<g>` for `isSVG`, or a `<div>` with an open
 * shadow root for `useShadow` — and children portal into that host. The host
 * is removed on unmount (via `onCleanup`), so mount/unmount cycles don't leak
 * detached hosts. With neither flag set the behavior is unchanged (children
 * portal straight into `mount`).
 *
 * @example
 * import { Portal } from "solid-js/web" // aliased to @pyreon/solid-compat
 *
 * function Modal(props: { onClose: () => void }) {
 *   // Renders at document.body level regardless of where <Modal> sits
 *   return (
 *     <Portal>
 *       <div class="backdrop" onClick={props.onClose}>...</div>
 *     </Portal>
 *   )
 * }
 *
 * @example
 * // Explicit mount target:
 * const host = document.getElementById("overlay-root")!
 * <Portal mount={host}><Tooltip /></Portal>
 */
export function Portal(props: {
  mount?: Element
  /** Wrap the portalled content in a shadow root on a dedicated host. */
  useShadow?: boolean
  /** Create the portal host in the SVG namespace (for portalling into `<svg>`). */
  isSVG?: boolean
  children: VNodeChild
}): VNode {
  const mountTarget = props.mount ?? document.body

  // Fast path: no host customization → portal straight into the mount target
  // (identical to the previous behavior; backward compatible).
  if (!props.useShadow && !props.isSVG) {
    return PyreonPortal({ target: mountTarget, children: props.children })
  }

  // Solid creates a dedicated host element under `mount` for shadow/SVG.
  const host = props.isSVG
    ? (document.createElementNS('http://www.w3.org/2000/svg', 'g') as unknown as Element)
    : document.createElement('div')
  mountTarget.appendChild(host)

  // `attachShadow` returns a ShadowRoot — a structurally-valid appendChild
  // container for Pyreon's Portal (the renderer only needs a node it can
  // append children into). The cast is the documented boundary: ShadowRoot
  // is not an `Element` but is a valid mount root for the DOM renderer.
  const target: Element =
    props.useShadow && !props.isSVG
      ? (host.attachShadow({ mode: 'open' }) as unknown as Element)
      : host

  // Remove the host when the surrounding component unmounts so repeated
  // mount/unmount cycles don't leak detached hosts (Solid manages this too).
  onCleanup(() => host.remove())

  return PyreonPortal({ target, children: props.children })
}

// ─── render / hydrate (solid-js/web entry points) ────────────────────────────

/** A DOM node a Solid app can mount into. */
export type MountableElement = Element

/**
 * Solid-compatible `render` (from `solid-js/web`) — mounts an app into a DOM
 * element and returns a dispose function.
 *
 * Solid's signature is `render(code: () => JSX.Element, element): () => void`.
 * The `code` thunk is passed directly to Pyreon's `mount` — `VNodeChild`
 * includes the accessor form `() => VNodeChildAtom`, so the thunk is a valid
 * reactive root child (it re-evaluates on signal change). `mount` returns its
 * own unmount/dispose function, which is returned verbatim — calling it
 * removes everything and disposes effects, matching Solid's contract.
 *
 * @example
 * import { render } from "solid-js/web" // aliased to @pyreon/solid-compat
 * import { createSignal } from "solid-js"
 *
 * function Counter() {
 *   const [n, setN] = createSignal(0)
 *   return <button onClick={() => setN(n() + 1)}>{n()}</button>
 * }
 *
 * const dispose = render(() => <Counter />, document.getElementById("app")!)
 * // later: dispose() — unmounts and cleans up
 */
export function render(code: VNodeChildAccessor, element: MountableElement): () => void {
  return pyreonMount(code, element)
}

/**
 * Solid-compatible `hydrate` (from `solid-js/web`) — hydrates server-rendered
 * markup in `element` and returns a dispose function.
 *
 * Solid's signature is `hydrate(code: () => JSX.Element, element): () => void`.
 * Maps onto `@pyreon/runtime-dom`'s `hydrateRoot(container, vnode)`, which
 * itself returns a dispose function (returned verbatim here, matching Solid's
 * contract). As with `render`, the `code` thunk is a valid reactive root child.
 *
 * @example
 * import { hydrate } from "solid-js/web" // aliased to @pyreon/solid-compat
 *
 * // Server emitted #app's HTML; reuse the DOM instead of re-creating it:
 * const dispose = hydrate(() => <App />, document.getElementById("app")!)
 */
export function hydrate(code: VNodeChildAccessor, element: MountableElement): () => void {
  return hydrateRoot(element, code)
}

// ─── Re-exports from @pyreon/core ──────────────────────────────────────────────

export { ErrorBoundary, For, Match, Show, Suspense, Switch }
