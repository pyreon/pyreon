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

import type { ComponentFn, LazyComponent, Props, VNodeChild } from '@pyreon/core'
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
import { getCurrentCtx, getHookIndex } from './jsx-runtime'

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

// ─── createResource ─────────────────────────────────────────────────────────

/**
 * Solid-compatible resource — async data fetching with reactive source tracking.
 * Returns `[resource, { mutate, refetch }]` where `resource()` is the data accessor
 * with `.loading`, `.error`, and `.latest` reactive properties.
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
): ResourceReturn<T>
export function createResource<T, S = true>(
  source: (() => S) | true,
  fetcher: (source: S, info: { value: T | undefined }) => Promise<T> | T,
): ResourceReturn<T>
export function createResource<T, S = true>(
  sourceOrFetcher:
    | (() => S)
    | true
    | ((info: { value: T | undefined }) => Promise<T> | T),
  maybeFetcher?: (source: S, info: { value: T | undefined }) => Promise<T> | T,
): ResourceReturn<T> {
  const hasSource = maybeFetcher !== undefined
  const source = hasSource ? (sourceOrFetcher as (() => S) | true) : (() => true as S)
  const fetcher = (
    hasSource ? maybeFetcher : sourceOrFetcher
  ) as (source: S, info: { value: T | undefined }) => Promise<T> | T

  const [data, setData] = createSignal<T | undefined>(undefined)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)

  let latestValue: T | undefined

  const doFetch = () => {
    const src = typeof source === 'function' ? (source as () => S)() : source
    if (src === false || src === null || src === undefined) return
    setLoading(true)
    setError(undefined)
    try {
      const result = fetcher(src as S, { value: latestValue })
      if (result instanceof Promise) {
        result.then(
          (val) => {
            latestValue = val
            setData(() => val)
            setLoading(false)
          },
          (err) => {
            setError(() => (err instanceof Error ? err : new Error(String(err))))
            setLoading(false)
          },
        )
      } else {
        latestValue = result
        setData(() => result)
        setLoading(false)
      }
    } catch (err) {
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

  // Build the resource accessor with reactive properties
  const resource = (() => data()) as Resource<T>
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

// ─── createStore / produce ──────────────────────────────────────────────────

/**
 * Solid-compatible `createStore` — creates a reactive proxy-based store.
 * Returns `[store, setStore]` where store is a proxy that reads from a signal
 * and setStore accepts a mutator function that operates on a draft copy.
 */
export function createStore<T extends object>(
  initialValue: T,
): [T, (fn: (state: T) => void) => void] {
  const [state, setState] = createSignal<T>(initialValue, { equals: false })

  const proxy = new Proxy({} as T, {
    get(_target, prop) {
      return (state() as Record<PropertyKey, unknown>)[prop as string]
    },
    has(_target, prop) {
      return prop in (state() as object)
    },
    ownKeys() {
      return Reflect.ownKeys(state() as object)
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(state(), prop)
    },
    set() {
      // oxlint-disable-next-line no-console
      console.warn('[Pyreon] Direct mutation on store is not supported. Use the setter function.')
      return true
    },
  })

  const setStore = (fn: (state: T) => void) => {
    const draft = structuredClone(state())
    fn(draft)
    setState(() => draft)
  }

  return [proxy, setStore]
}

/**
 * Solid-compatible `produce` — creates an Immer-like updater function for stores.
 * Returns a function that clones the state, applies mutations, and returns the result.
 */
export function produce<T extends object>(fn: (state: T) => void): (state: T) => T {
  return (state: T) => {
    const draft = structuredClone(state)
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

// ─── Re-exports from @pyreon/core ──────────────────────────────────────────────

export { ErrorBoundary, For, Match, Show, Suspense, Switch }
