/**
 * @pyreon/svelte-compat
 *
 * Svelte-compatible **importable runtime API** powered by Pyreon's
 * reactive engine. Mirrors the scope boundary of the sibling compat
 * layers (react/preact/vue/solid-compat): it shims the APIs Svelte code
 * actually `import`s —
 *
 *   - `svelte/store`  → `writable` `readable` `derived` `get` `readonly`
 *   - `svelte`        → `onMount` `onDestroy` `beforeUpdate` `afterUpdate`
 *                       `tick` `setContext` `getContext` `hasContext`
 *                       `getAllContexts` `createEventDispatcher`
 *                       `mount` `unmount` `flushSync`
 *
 * It does NOT implement the `.svelte` single-file-component compiler or
 * the non-importable Svelte 5 rune *syntax* (`$state`/`$derived`/
 * `$effect`) — those are compiler constructs, not runtime imports, the
 * same boundary solid-compat draws around Solid's compiler. Components
 * here are plain functions returning JSX that run on Pyreon via the
 * shared compat JSX runtime (re-render on store change).
 *
 * Store model: a faithful Svelte store — a plain Set of subscribers
 * notified synchronously on `set`/`update` (signal-free, exactly like
 * Svelte's own `writable`; `derived` subscribes to its inputs
 * explicitly). The store contract (`subscribe(run, invalidate?) →
 * unsubscribe`, lazy `start(set, update?) → stop` notifier) matches
 * Svelte exactly. Subscribing inside a compat component body re-renders
 * it on store change (the faithful `$store` auto-subscription
 * equivalent) without a disposable tracking effect.
 */

import type { ComponentFn, Props, VNodeChild } from '@pyreon/core'
import {
  ErrorBoundary,
  For,
  Match,
  nativeCompat,
  createContext as pyreonCreateContext,
  onMount as pyreonOnMount,
  onUnmount as pyreonOnUnmount,
  provide as pyreonProvide,
  useContext as pyreonUseContext,
  Show,
  Suspense,
  Switch,
} from '@pyreon/core'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { getCurrentCtx, getHookIndex, jsx } from './jsx-runtime'

// Dev-mode counter sink — see packages/internals/perf-harness for contract.
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// ─── Store types (Svelte API surface) ───────────────────────────────────────

export type Subscriber<T> = (value: T) => void
export type Invalidator<T> = (value?: T) => void
export type Unsubscriber = () => void
export type Updater<T> = (value: T) => T
/** `(set, update?) => stop?` — lazy notifier, runs on first subscriber. */
export type StartStopNotifier<T> = (
  set: (value: T) => void,
  update: (fn: Updater<T>) => void,
) => Unsubscriber | void

export interface Readable<T> {
  subscribe(run: Subscriber<T>, invalidate?: Invalidator<T>): Unsubscriber
}
export interface Writable<T> extends Readable<T> {
  set(value: T): void
  update(updater: Updater<T>): void
}

const noop = () => {
  /* noop */
}

// Internal subscriptions (`get()`, `derived`'s input wiring) must NOT take
// the render-aware hook-indexed path even when they happen to run during a
// component render — doing so would consume the component's hook indices and
// desync onMount/onDestroy. This depth counter suppresses the render-aware
// branch for the duration of an internal subscribe.
let _plainDepth = 0
function plainSubscribe<R>(fn: () => R): R {
  _plainDepth++
  try {
    return fn()
  } finally {
    _plainDepth--
  }
}

// ─── writable ────────────────────────────────────────────────────────────────

/**
 * Svelte's `safe_not_equal`: primitives dedup, objects/functions always
 * notify (so in-place-mutated store objects still propagate).
 */
function safeNotEqual(a: unknown, b: unknown): boolean {
  // eslint-disable-next-line no-self-compare
  return a != a
    ? // eslint-disable-next-line no-self-compare
      b == b
    : a !== b || (a !== null && typeof a === 'object') || typeof a === 'function'
}

interface SubEntry<T> {
  run: Subscriber<T>
  invalidate: Invalidator<T>
  /** Component re-render trigger — set only for render-aware subscriptions. */
  rerender?: () => void
}

/**
 * Svelte-compatible `writable`. A faithful Svelte store: a Set of
 * subscribers notified synchronously on `set`/`update`. NOT signal-
 * backed — Svelte's own `writable` is signal-free, and `derived` here
 * subscribes to its inputs explicitly, so no signal auto-tracking is
 * needed.
 *
 * Subscribing inside a compat component body is the faithful equivalent
 * of Svelte's `$store` auto-subscription: the subscriber carries the
 * component's `scheduleRerender`, so a store write re-renders the
 * component — the same "write drives re-render" model the sibling
 * solid-compat layer uses. Crucially this is NOT a persistent tracking
 * effect: such an effect, created inside the wrapper accessor's run, is
 * collected as an inner effect and disposed on the NEXT re-render (the
 * cached path never recreates it), so store changes stopped propagating
 * after the first one. A plain subscriber Set has no such hazard — it
 * lives until `unsub` (registered in `ctx.unmountCallbacks`).
 *
 * `start` runs when the subscriber count goes 0→1 and its returned
 * `stop` runs at 1→0. Synchronous `set` calls inside `start` mutate the
 * value but do NOT notify (the store isn't "ready" until `start`
 * returns), so the first subscriber sees exactly the post-start value —
 * matching Svelte's `derived` (one emission, no spurious initial).
 */
export function writable<T>(value?: T, start: StartStopNotifier<T> = noop): Writable<T> {
  let v = value as T
  let stop: Unsubscriber | void
  const subs = new Set<SubEntry<T>>()

  const setVal = (next: T): void => {
    if (!safeNotEqual(v, next)) return
    v = next
    if (!stop) return // not "ready" — Svelte's gate (start hasn't returned)
    for (const s of subs) s.invalidate(v)
    for (const s of subs) {
      s.run(v)
      s.rerender?.()
    }
  }
  const set = (next: T): void => setVal(next)
  const update = (fn: Updater<T>): void => setVal(fn(v))

  const addSub = (entry: SubEntry<T>): Unsubscriber => {
    subs.add(entry)
    if (subs.size === 1) stop = start(set, update) || noop
    entry.run(v) // Svelte: subscriber invoked immediately with current value
    return () => {
      subs.delete(entry)
      if (subs.size === 0 && stop) {
        stop()
        stop = undefined
      }
    }
  }

  return {
    set,
    update,
    subscribe(run: Subscriber<T>, invalidate: Invalidator<T> = noop): Unsubscriber {
      // Render-aware path: inside a compat component body (and not an
      // internal `_plainDepth` subscription), carry the component's
      // scheduleRerender so a store write re-renders it. Hook-indexed so
      // the one live subscription is created exactly once across
      // re-renders; the cached pass just refreshes the component-local.
      const ctx = _plainDepth === 0 ? getCurrentCtx() : null
      if (ctx) {
        const idx = getHookIndex()
        const cached = ctx.hooks[idx] as { unsub: Unsubscriber } | undefined
        if (cached) {
          run(v)
          // Re-push the cached unsub into the (possibly-reset)
          // unmountCallbacks array. When a parent re-renders and
          // preserves the ChildInstance, the wrapper resets
          // `ctx.unmountCallbacks = []` to drop stale cycle-N
          // callbacks before cycle-N+1 begins (`jsx-runtime.ts:172`).
          // Without this re-push the cached subscription's unsub is
          // lost from the array and the subscription stays active on
          // the store forever — one leaked subscriber per
          // `writable.subscribe()` call per parent re-render cycle.
          if (!ctx.unmountCallbacks.includes(cached.unsub)) {
            ctx.unmountCallbacks.push(cached.unsub)
            // Leak-class D diagnostic — emit per re-push that fires
            // during the cached fast-path. Non-zero confirms parent
            // re-renders are actually exercising the cached subscribe
            // path (and the unsub stays bound to the live cleanup
            // array). Zero on a render-heavy workload = either no
            // cached subscriptions OR — bug — the includes() guard
            // suppressed a valid re-push.
            if (__DEV__) _countSink.__pyreon_count__?.('svelte-compat.subscribe.cachedRePush')
          }
          return cached.unsub
        }
        const entry: SubEntry<T> = {
          run,
          invalidate,
          rerender: () => {
            if (!ctx.unmounted) ctx.scheduleRerender()
          },
        }
        const unsub = addSub(entry)
        ctx.hooks[idx] = { unsub }
        ctx.unmountCallbacks.push(unsub)
        return unsub
      }
      return addSub({ run, invalidate })
    },
  }
}

// ─── readable ────────────────────────────────────────────────────────────────

/** Svelte-compatible `readable` — a `writable` with `set`/`update` hidden. */
export function readable<T>(value?: T, start?: StartStopNotifier<T>): Readable<T> {
  const w = writable<T>(value, start)
  return { subscribe: w.subscribe }
}

// ─── readonly ────────────────────────────────────────────────────────────────

/** Svelte-compatible `readonly` — view of a store exposing only `subscribe`. */
export function readonly<T>(store: Readable<T>): Readable<T> {
  return { subscribe: store.subscribe }
}

// ─── get ─────────────────────────────────────────────────────────────────────

/** Svelte-compatible `get` — read a store's value synchronously. */
export function get<T>(store: Readable<T>): T {
  let value!: T
  plainSubscribe(() => {
    const unsub = store.subscribe((v) => {
      value = v
    })
    unsub()
  })
  return value
}

// ─── derived ─────────────────────────────────────────────────────────────────

type Stores =
  | Readable<unknown>
  | [Readable<unknown>, ...Array<Readable<unknown>>]
  | Array<Readable<unknown>>
type StoresValues<T> = T extends Readable<infer U>
  ? U
  : { [K in keyof T]: T[K] extends Readable<infer U> ? U : never }

/**
 * Svelte-compatible `derived`. Supports both the sync form
 * `(values) => result` and the async/cleanup form
 * `(values, set, update?) => stop`.
 */
export function derived<S extends Stores, T>(
  stores: S,
  fn:
    | ((values: StoresValues<S>) => T)
    | ((
        values: StoresValues<S>,
        set: (value: T) => void,
        update: (fn: Updater<T>) => void,
      ) => Unsubscriber | void),
  initialValue?: T,
): Readable<T> {
  const single = !Array.isArray(stores)
  const storeArr = (single ? [stores] : stores) as Array<Readable<unknown>>
  const isAsync = fn.length >= 2

  const out = writable<T>(initialValue as T, (set, update) => {
    let inited = false
    const values: unknown[] = []
    let cleanup: Unsubscriber | void

    const sync = () => {
      if (cleanup) {
        cleanup()
        cleanup = undefined
      }
      const input = (single ? values[0] : values) as StoresValues<S>
      if (isAsync) {
        cleanup = (
          fn as (v: StoresValues<S>, s: (x: T) => void, u: (f: Updater<T>) => void) => Unsubscriber | void
        )(input, set, update)
      } else {
        set((fn as (v: StoresValues<S>) => T)(input))
      }
    }

    const unsubs = plainSubscribe(() =>
      storeArr.map((s, i) =>
        s.subscribe((v) => {
          values[i] = v
          if (inited) sync()
        }),
      ),
    )
    inited = true
    sync()

    return () => {
      for (const u of unsubs) u()
      if (cleanup) cleanup()
    }
  })

  return { subscribe: out.subscribe }
}

// ─── lifecycle (svelte) ──────────────────────────────────────────────────────

type CleanupFn = () => void

/** Svelte-compatible `onMount` — runs after the component's first render. */
export function onMount(fn: () => CleanupFn | void): void {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx >= ctx.hooks.length) {
      ctx.hooks[idx] = true
      // Svelte's onMount may return a cleanup that runs on destroy. The
      // shared jsx-runtime schedules pendingEffects post-render but never
      // invokes their stored cleanup on unmount, so wire it explicitly
      // into unmountCallbacks (runs in the wrapper's onUnmount).
      let cleanup: CleanupFn | undefined
      ctx.pendingEffects.push({
        fn: () => {
          const c = fn()
          cleanup = typeof c === 'function' ? c : undefined
          return cleanup
        },
        deps: undefined,
        cleanup: undefined,
      })
      ctx.unmountCallbacks.push(() => {
        if (cleanup) cleanup()
      })
    }
    return
  }
  pyreonOnMount(fn)
}

/** Svelte-compatible `onDestroy` — runs when the component unmounts. */
export function onDestroy(fn: () => void): void {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx >= ctx.hooks.length) {
      ctx.hooks[idx] = true
      ctx.unmountCallbacks.push(fn)
    }
    return
  }
  pyreonOnUnmount(fn)
}

/**
 * Svelte-compatible `beforeUpdate` / `afterUpdate`. The compat wrapper
 * re-renders by tearing down + rebuilding (no per-update diff), so these
 * map to a post-first-render hook rather than Svelte's per-tick timing —
 * the documented boundary (most Svelte interop uses onMount/onDestroy).
 */
export function beforeUpdate(fn: () => void): void {
  const ctx = getCurrentCtx()
  if (ctx) {
    const idx = getHookIndex()
    if (idx >= ctx.hooks.length) {
      ctx.hooks[idx] = true
      fn() // before the first render commits
    }
    return
  }
  fn()
}
export function afterUpdate(fn: () => void): void {
  onMount(() => {
    fn()
  })
}

/** Svelte-compatible `tick` — resolves after the current microtask. */
export function tick(): Promise<void> {
  return new Promise<void>((resolve) => queueMicrotask(resolve))
}

// ─── context (svelte) ────────────────────────────────────────────────────────

const CTX_REGISTRY = Symbol.for('pyreon:svelte-ctx-registry')
type CtxMap = Map<unknown, ReturnType<typeof pyreonCreateContext<unknown>>>

function ctxFor(key: unknown): ReturnType<typeof pyreonCreateContext<unknown>> {
  const g = globalThis as Record<symbol, unknown>
  let reg = g[CTX_REGISTRY] as CtxMap | undefined
  if (!reg) {
    reg = new Map()
    g[CTX_REGISTRY] = reg
  }
  let c = reg.get(key)
  if (!c) {
    c = pyreonCreateContext<unknown>(undefined)
    reg.set(key, c)
  }
  return c
}

/** Svelte-compatible `setContext` — provides a value for descendants. */
export function setContext<T>(key: unknown, context: T): T {
  pyreonProvide(ctxFor(key), context)
  return context
}
/** Svelte-compatible `getContext` — reads the nearest provided value. */
export function getContext<T>(key: unknown): T {
  return pyreonUseContext(ctxFor(key)) as T
}
/** Svelte-compatible `hasContext` — whether a value was provided up-tree. */
export function hasContext(key: unknown): boolean {
  return pyreonUseContext(ctxFor(key)) !== undefined
}
/** Svelte-compatible `getAllContexts` — best-effort (not tracked per-key). */
export function getAllContexts<T extends Map<unknown, unknown> = Map<unknown, unknown>>(): T {
  return new Map() as T
}

// ─── createEventDispatcher (svelte) ──────────────────────────────────────────

/**
 * Svelte-compatible `createEventDispatcher`. Svelte's compiler turns
 * `<Child on:foo>` into a prop; here events are forwarded to the
 * current component's `on<Type>` / `on:<type>` prop with a CustomEvent
 * (mirrors how the sibling compat layers map child events to props).
 */
export function createEventDispatcher<EventMap extends Record<string, unknown> = Record<string, unknown>>(): <
  Type extends keyof EventMap & string,
>(
  type: Type,
  detail?: EventMap[Type],
) => boolean {
  const ctx = getCurrentCtx()
  const props = (ctx?.props ?? {}) as Record<string, unknown>
  return (type, detail) => {
    const evt =
      typeof CustomEvent === 'function'
        ? new CustomEvent(type, { detail })
        : ({ type, detail } as unknown as CustomEvent)
    const cap = `on${type.charAt(0).toUpperCase()}${type.slice(1)}`
    const handler = (props[cap] ?? props[`on:${type}`] ?? props[`on${type}`]) as
      | ((e: unknown) => void)
      | undefined
    if (typeof handler === 'function') handler(evt)
    return !(evt as CustomEvent).defaultPrevented
  }
}

// ─── mount / unmount / flushSync (Svelte 5 client API) ───────────────────────

type MountTargetOptions<P> = { target: Element; props?: P; context?: Map<unknown, unknown> }

/**
 * Svelte-5-compatible `mount` — mounts a compat component into a target.
 * Thin wrapper over Pyreon's runtime mount. Returns the props object
 * (Svelte 5 returns the component exports; here props are the surface).
 */
export function mount<P extends Record<string, unknown>>(
  Component: (props: P) => VNodeChild,
  options: MountTargetOptions<P>,
): P {
  const props = (options.props ?? ({} as P)) as P
  // Route through the compat JSX runtime so the component runs inside the
  // shared wrapper (lifecycle + store-driven re-render), exactly as a
  // JSX-rendered child would.
  const vnode = jsx(Component as unknown as ComponentFn, props as unknown as Props)
  const dispose = pyreonMount(vnode, options.target as HTMLElement)
  ;(props as Record<symbol, unknown>)[UNMOUNT] = dispose
  return props
}

const UNMOUNT = Symbol.for('pyreon:svelte-unmount')

/** Svelte-5-compatible `unmount` — disposes a component mounted via `mount`. */
export function unmount(mounted: Record<symbol, unknown>): void {
  const d = mounted?.[UNMOUNT] as (() => void) | undefined
  if (typeof d === 'function') d()
}

/**
 * Svelte-5-compatible `flushSync` — runs `fn` then flushes. Pyreon
 * batches synchronously, so this just invokes `fn`.
 */
export function flushSync<T>(fn?: () => T): T | undefined {
  return fn ? fn() : undefined
}

// ─── createEventDispatcher needs props on ctx ────────────────────────────────
// (jsx-runtime stores `props` on the RenderContext — see jsx-runtime.ts)

// ─── Re-exports from @pyreon/core (control-flow parity) ──────────────────────

export { ErrorBoundary, For, Match, Show, Suspense, Switch }

// Mark the compat surface so framework Providers route natively.
void nativeCompat
