/**
 * @pyreon/react-compat
 *
 * Fully React-compatible hook API powered by Pyreon's reactive engine.
 *
 * Components re-render on state change — just like React. Hooks return plain
 * values and use deps arrays for memoization. Existing React code works
 * unchanged when paired with `pyreon({ compat: "react" })` in your vite config.
 *
 * USAGE:
 *   import { useState, useEffect } from "react"          // aliased by vite plugin
 *   import { createRoot } from "react-dom/client"         // aliased by vite plugin
 */

export type { Props, VNode, VNodeChild } from '@pyreon/core'
export { Fragment, h as createElement, h, createRef } from '@pyreon/core'

import type { Context, VNode, VNodeChild } from '@pyreon/core'
import {
  createContext as pyreonCreateContext,
  ErrorBoundary,
  h,
  nativeCompat,
  Portal,
  provide as pyreonProvide,
  Suspense,
  useContext as pyreonUseContext,
} from '@pyreon/core'
import { batch } from '@pyreon/reactivity'
import type { EffectEntry } from './jsx-runtime'
import { getCurrentCtx, getHookIndex } from './jsx-runtime'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireCtx() {
  const ctx = getCurrentCtx()
  if (!ctx) throw new Error('Hook called outside of a component render')
  return ctx
}

function depsChanged(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (a === undefined || b === undefined) return true
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return true
  }
  return false
}

// ─── State ───────────────────────────────────────────────────────────────────

/**
 * React-compatible `useState` — returns `[value, setter]`.
 * Triggers a component re-render when the setter is called.
 */
export function useState<T>(initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] {
  const ctx = requireCtx()
  const idx = getHookIndex()

  if (ctx.hooks.length <= idx) {
    const val = typeof initial === 'function' ? (initial as () => T)() : initial
    // Store both value and a STABLE setter in one hook slot so setter identity
    // never changes across renders (React guarantee).
    const entry = { value: val, setter: null as unknown as (v: T | ((prev: T) => T)) => void }
    entry.setter = (v: T | ((prev: T) => T)) => {
      const current = entry.value
      const next = typeof v === 'function' ? (v as (prev: T) => T)(current) : v
      if (Object.is(current, next)) return
      entry.value = next
      ctx.scheduleRerender()
    }
    ctx.hooks.push(entry)
  }

  const entry = ctx.hooks[idx] as { value: T; setter: (v: T | ((prev: T) => T)) => void }
  return [entry.value, entry.setter]
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * React-compatible `useReducer` — returns `[state, dispatch]`.
 * Supports the 3-argument form: `useReducer(reducer, initialArg, init)`.
 */
export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialArg: S | (() => S),
  init?: (arg: S) => S,
): [S, (action: A) => void] {
  const ctx = requireCtx()
  const idx = getHookIndex()

  if (ctx.hooks.length <= idx) {
    let initial: S
    if (init) {
      initial = init(initialArg as S)
    } else if (typeof initialArg === 'function') {
      initial = (initialArg as () => S)()
    } else {
      initial = initialArg
    }
    // Store both value and a STABLE dispatch in one hook slot so dispatch identity
    // never changes across renders (React guarantee).
    const entry = { value: initial, dispatch: null as unknown as (action: A) => void }
    entry.dispatch = (action: A) => {
      const current = entry.value
      const next = reducer(current, action)
      if (Object.is(current, next)) return
      entry.value = next
      ctx.scheduleRerender()
    }
    ctx.hooks.push(entry)
  }

  const entry = ctx.hooks[idx] as { value: S; dispatch: (action: A) => void }
  return [entry.value, entry.dispatch]
}

// ─── Effects ─────────────────────────────────────────────────────────────────

/**
 * React-compatible `useEffect` — runs after render when deps change.
 * Returns cleanup on unmount and before re-running.
 */
export function useEffect(fn: () => (() => void) | void, deps?: unknown[]): void {
  const ctx = requireCtx()
  const idx = getHookIndex()

  if (ctx.hooks.length <= idx) {
    // First render — always run
    const entry: EffectEntry = { fn, deps, cleanup: undefined }
    ctx.hooks.push(entry)
    ctx.pendingEffects.push(entry)
  } else {
    const entry = ctx.hooks[idx] as EffectEntry
    if (depsChanged(entry.deps, deps)) {
      entry.fn = fn
      entry.deps = deps
      ctx.pendingEffects.push(entry)
    }
  }
}

/**
 * React-compatible `useLayoutEffect` — runs synchronously after DOM mutations.
 */
export function useLayoutEffect(fn: () => (() => void) | void, deps?: unknown[]): void {
  const ctx = requireCtx()
  const idx = getHookIndex()

  if (ctx.hooks.length <= idx) {
    const entry: EffectEntry = { fn, deps, cleanup: undefined }
    ctx.hooks.push(entry)
    ctx.pendingLayoutEffects.push(entry)
  } else {
    const entry = ctx.hooks[idx] as EffectEntry
    if (depsChanged(entry.deps, deps)) {
      entry.fn = fn
      entry.deps = deps
      ctx.pendingLayoutEffects.push(entry)
    }
  }
}

/**
 * React-compatible `useInsertionEffect` — runs synchronously before layout effects.
 * Intended for CSS-in-JS libraries to inject styles before DOM reads.
 */
export function useInsertionEffect(fn: () => (() => void) | void, deps?: unknown[]): void {
  const ctx = requireCtx()
  const idx = getHookIndex()

  if (ctx.hooks.length <= idx) {
    const entry: EffectEntry = { fn, deps, cleanup: undefined }
    ctx.hooks.push(entry)
    ctx.pendingInsertionEffects.push(entry)
  } else {
    const entry = ctx.hooks[idx] as EffectEntry
    if (depsChanged(entry.deps, deps)) {
      entry.fn = fn
      entry.deps = deps
      ctx.pendingInsertionEffects.push(entry)
    }
  }
}

// ─── Memoization ─────────────────────────────────────────────────────────────

/**
 * React-compatible `useMemo` — returns the cached value, recomputed when deps change.
 */
export function useMemo<T>(fn: () => T, deps: unknown[]): T {
  const ctx = requireCtx()
  const idx = getHookIndex()

  if (ctx.hooks.length <= idx) {
    const value = fn()
    ctx.hooks.push({ value, deps })
    return value
  }

  const entry = ctx.hooks[idx] as { value: T; deps: unknown[] }
  if (depsChanged(entry.deps, deps)) {
    entry.value = fn()
    entry.deps = deps
  }
  return entry.value
}

/**
 * React-compatible `useCallback` — returns the cached function when deps haven't changed.
 */
export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: unknown[]): T {
  return useMemo(() => fn, deps)
}

// ─── Refs ────────────────────────────────────────────────────────────────────

/**
 * React-compatible `useRef` — returns `{ current }` persisted across re-renders.
 */
export function useRef<T>(initial?: T): { current: T | null } {
  const ctx = requireCtx()
  const idx = getHookIndex()

  if (ctx.hooks.length <= idx) {
    const ref = { current: initial !== undefined ? (initial as T) : null }
    ctx.hooks.push(ref)
  }

  return ctx.hooks[idx] as { current: T | null }
}

// ─── Context ─────────────────────────────────────────────────────────────────

const COMPAT_CTX = Symbol.for('pyreon:compat-ctx')

/**
 * Compat-specific context with subscriber notification and tree-scoped nesting.
 *
 * Uses Pyreon's native context stack for tree-scoped Provider nesting (inner
 * Providers override outer ones for their subtree), with a subscriber set
 * layered on top for React-style consumer re-rendering.
 */
export interface CompatContext<T> {
  /** Brand marker so `useContext` can distinguish compat contexts */
  readonly [COMPAT_CTX_BRAND]: true
  /** Default value when no Provider is mounted */
  _defaultValue: T
  /** Pyreon native context for tree-scoped value+subscriber storage */
  _pyreonCtx: Context<{ value: T; subscribers: Set<() => void> }>
  /** Subscribers at the default (no-Provider) level */
  _subscribers: Set<() => void>
  /** React-compatible Provider component (native Pyreon, NOT compat-wrapped).
   * Returns a reactive accessor `() => VNodeChild` for Pyreon's renderer. */
  Provider: (props: Record<string, unknown>) => unknown
}

const COMPAT_CTX_BRAND: typeof COMPAT_CTX = COMPAT_CTX

/**
 * React-compatible `createContext` — creates a context with a Provider that
 * supports nested Providers (inner overrides outer for its subtree) and
 * notifies all `useContext` consumers when its value changes.
 */
export function createContext<T>(defaultValue: T): CompatContext<T> {
  // Pyreon native context: each Provider pushes { value, subscribers } onto
  // the tree-scoped stack. Consumers read the nearest frame via useContext.
  const pyreonCtx = pyreonCreateContext<{ value: T; subscribers: Set<() => void> }>({
    value: defaultValue,
    subscribers: new Set(),
  })

  // Default-level subscribers (for consumers with no Provider above them)
  const defaultSubscribers = new Set<() => void>()

  // Provider is a NATIVE Pyreon component (not compat-wrapped).
  // It calls provide() once during setup to push onto the context stack,
  // then returns a reactive accessor that updates the frame value on re-render.
  const Provider = (props: Record<string, unknown>) => {
    // Setup (runs once per mount):
    const frame = { value: (props as { value: T }).value, subscribers: new Set<() => void>() }
    pyreonProvide(pyreonCtx, frame)

    // Return reactive accessor for children (re-evaluated when props change)
    return () => {
      const { value, children } = props as { value: T; children?: VNodeChild }
      // On re-render: update the frame value and notify subscribers
      if (!Object.is(frame.value, value)) {
        frame.value = value
        for (const sub of frame.subscribers) sub()
      }
      return children ?? null
    }
  }
  // Mark as native so jsx() doesn't wrap it with wrapCompatComponent
  nativeCompat(Provider)

  const ctx: CompatContext<T> = {
    [COMPAT_CTX_BRAND]: true as const,
    _defaultValue: defaultValue,
    _pyreonCtx: pyreonCtx,
    _subscribers: defaultSubscribers,
    Provider,
  }
  return ctx
}

/**
 * React-compatible `useContext` — reads the current context value and
 * subscribes the calling component to future value changes.
 *
 * Reads from Pyreon's tree-scoped context stack (correct nesting) and
 * subscribes to the nearest Provider's subscriber set for re-rendering.
 *
 * Works with both compat contexts (from this module's `createContext`) and
 * Pyreon native contexts (from `@pyreon/core`).
 */
export function useContext<T>(context: CompatContext<T> | Context<T>): T {
  if (COMPAT_CTX in context) {
    const compatCtx = context as CompatContext<T>
    // Read from Pyreon's tree-scoped stack (correct nesting)
    const frame = pyreonUseContext(compatCtx._pyreonCtx)
    const renderCtx = getCurrentCtx()
    if (renderCtx) {
      const idx = getHookIndex()
      if (renderCtx.hooks.length <= idx) {
        // Subscribe to the frame's subscriber set
        const sub = () => renderCtx.scheduleRerender()
        frame.subscribers.add(sub)
        renderCtx.hooks.push({ _contextUnsub: () => frame.subscribers.delete(sub) })
      }
    }
    return frame.value
  }
  return pyreonUseContext(context as Context<T>)
}

// ─── ID ──────────────────────────────────────────────────────────────────────

let _idCounter = 0

/**
 * React-compatible `useId` — returns a stable unique string per hook call.
 */
export function useId(): string {
  const ctx = requireCtx()
  const idx = getHookIndex()

  if (ctx.hooks.length <= idx) {
    ctx.hooks.push(`:r${(_idCounter++).toString(36)}:`)
  }

  return ctx.hooks[idx] as string
}

// ─── Optimization ────────────────────────────────────────────────────────────

function shallowEqual<P extends Record<string, unknown>>(a: P, b: P): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (!Object.is(a[k], b[k])) return false
  }
  return true
}

/**
 * React-compatible `memo` — wraps a component to skip re-render when props
 * are shallowly equal.
 *
 * Each component INSTANCE gets its own props/result cache via a hook slot,
 * so two `<MemoComp />` usages don't share memoization state.
 */
export function memo<P extends Record<string, unknown>>(
  component: (props: P) => VNodeChild,
  areEqual?: (prevProps: P, nextProps: P) => boolean,
): (props: P) => VNodeChild {
  const compare = areEqual ?? shallowEqual

  const MEMO_MARKER = Symbol.for('pyreon:memo')

  // Fallback closure-level cache for calls outside a compat render context
  // (e.g. direct function calls in tests). Inside a render context, each
  // component instance gets its own cache via a hook slot.
  let _fallbackPrevProps: P | null = null
  let _fallbackPrevResult: VNodeChild = null

  const memoized = (props: P) => {
    const ctx = getCurrentCtx()
    if (ctx) {
      // Per-instance cache via hook slot
      const idx = getHookIndex()
      if (ctx.hooks.length <= idx) {
        ctx.hooks.push({ prevProps: null as P | null, prevResult: null as VNodeChild })
      }
      const cache = ctx.hooks[idx] as { prevProps: P | null; prevResult: VNodeChild }
      if (cache.prevProps !== null && compare(cache.prevProps, props)) {
        return cache.prevResult
      }
      cache.prevProps = props
      cache.prevResult = component(props)
      return cache.prevResult
    }
    // No compat context — use closure-level fallback cache
    if (_fallbackPrevProps !== null && compare(_fallbackPrevProps, props)) {
      return _fallbackPrevResult
    }
    _fallbackPrevProps = props
    _fallbackPrevResult = component(props)
    return _fallbackPrevResult
  }
  ;(memoized as unknown as Record<symbol, boolean>)[MEMO_MARKER] = true
  memoized.displayName =
    (component as unknown as { displayName?: string }).displayName || component.name || 'Memo'
  return memoized
}

/**
 * React-compatible `useTransition` — no concurrent mode in Pyreon.
 */
export function useTransition(): [boolean, (fn: () => void) => void] {
  return [false, (fn) => fn()]
}

/**
 * React-compatible `useDeferredValue` — returns the value as-is.
 */
export function useDeferredValue<T>(value: T): T {
  return value
}

// ─── Imperative handle ───────────────────────────────────────────────────────

/**
 * React-compatible `useImperativeHandle`.
 */
export function useImperativeHandle<T>(
  ref: { current: T | null } | null | undefined,
  init: () => T,
  deps?: unknown[],
): void {
  useLayoutEffect(() => {
    if (ref) ref.current = init()
    return () => {
      if (ref) ref.current = null
    }
  }, deps)
}

// ─── Batching ────────────────────────────────────────────────────────────────

export { batch }

// ─── Portals ─────────────────────────────────────────────────────────────────

/**
 * React-compatible `createPortal(children, target)`.
 */
export function createPortal(children: VNodeChild, target: Element): VNodeChild {
  return Portal({ target, children })
}

// ─── Suspense / lazy / ErrorBoundary ─────────────────────────────────────────

export { lazy } from '@pyreon/core'
export { ErrorBoundary, Suspense }

// ─── forwardRef ─────────────────────────────────────────────────────────────

/**
 * React-compatible `forwardRef` — pass-through in Pyreon.
 * Refs are regular props in Pyreon, so no wrapper is needed.
 * The render function receives (props, ref) — we merge ref into props.
 */
export function forwardRef<P extends Record<string, unknown>>(
  render: (props: P, ref: { current: unknown } | null) => VNodeChild,
): (props: P & { ref?: { current: unknown } | null }) => VNodeChild {
  const forwarded = (props: P & { ref?: { current: unknown } | null }) => {
    const { ref, ...rest } = props
    return render(rest as P, ref ?? null)
  }
  forwarded.displayName =
    (render as unknown as { displayName?: string }).displayName || render.name || 'ForwardRef'
  return forwarded
}

// ─── cloneElement ───────────────────────────────────────────────────────────

/**
 * React-compatible `cloneElement` — creates a new VNode with merged props.
 */
export function cloneElement(
  element: VNode,
  props?: Record<string, unknown>,
  ...children: VNodeChild[]
): VNode {
  const mergedProps = { ...element.props, ...props }
  const mergedChildren = children.length > 0 ? children : element.children
  return h(element.type, mergedProps, ...mergedChildren)
}

// ─── Children utilities ─────────────────────────────────────────────────────

function flattenChildren(children: VNodeChild | VNodeChild[]): VNodeChild[] {
  if (children == null) return []
  if (!Array.isArray(children)) return [children]
  const result: VNodeChild[] = []
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...flattenChildren(child))
    } else {
      result.push(child)
    }
  }
  return result
}

/**
 * React-compatible `Children` utilities for working with VNode children.
 */
export const Children = {
  /**
   * Iterate over children, calling `fn` for each non-null child.
   */
  map<T>(children: VNodeChild | VNodeChild[], fn: (child: VNodeChild, index: number) => T): T[] {
    const flat = flattenChildren(children)
    const result: T[] = []
    let validIndex = 0
    for (let i = 0; i < flat.length; i++) {
      const child = flat[i]
      if (child == null || child === true || child === false) continue
      const mapped = fn(child, validIndex)
      // Assign key to mapped VNode children if they don't already have one
      if (mapped && typeof mapped === 'object' && 'type' in mapped && 'props' in mapped) {
        const vnode = mapped as unknown as VNode
        if (vnode.key == null) {
          vnode.key = `.${validIndex}`
        }
      }
      result.push(mapped)
      validIndex++
    }
    return result
  },

  /**
   * Call `fn` for each non-null child (no return value).
   */
  forEach(children: VNodeChild | VNodeChild[], fn: (child: VNodeChild, index: number) => void): void {
    const flat = flattenChildren(children)
    let validIndex = 0
    for (let i = 0; i < flat.length; i++) {
      const child = flat[i]
      if (child == null || child === true || child === false) continue
      fn(child, validIndex++)
    }
  },

  /**
   * Count non-null children.
   */
  count(children: VNodeChild | VNodeChild[]): number {
    const flat = flattenChildren(children)
    let count = 0
    for (const child of flat) {
      if (child != null && child !== true && child !== false) count++
    }
    return count
  },

  /**
   * Convert children to a flat array.
   */
  toArray(children: VNodeChild | VNodeChild[]): VNodeChild[] {
    const flat = flattenChildren(children)
    return flat.filter((child) => child != null && child !== true && child !== false)
  },

  /**
   * Assert and return the only child. Throws if not exactly one child.
   */
  only(children: VNodeChild | VNodeChild[]): VNodeChild {
    const arr = Children.toArray(children)
    if (arr.length !== 1) {
      throw new Error('[Pyreon] Children.only expected exactly one child')
    }
    return arr[0] as VNodeChild
  },
}

// ─── useSyncExternalStore ───────────────────────────────────────────────────

/**
 * React-compatible `useSyncExternalStore` — subscribes to an external store.
 * Re-subscribes automatically when the `subscribe` function identity changes.
 */
export function useSyncExternalStore<T>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T,
): T {
  const ctx = requireCtx()
  const idx = getHookIndex()

  // SSR path
  if (typeof window === 'undefined' && getServerSnapshot) {
    if (ctx.hooks.length <= idx) {
      ctx.hooks.push({ subscribe, unsubscribe: undefined, snapshot: getServerSnapshot() })
    }
    return (ctx.hooks[idx] as { snapshot: T }).snapshot
  }

  if (ctx.hooks.length <= idx) {
    const snapshot = getSnapshot()
    const entry = {
      subscribe,
      unsubscribe: undefined as (() => void) | undefined,
      snapshot,
    }
    const onChange = () => {
      const next = getSnapshot()
      if (!Object.is(entry.snapshot, next)) {
        entry.snapshot = next
        ctx.scheduleRerender()
      }
    }
    entry.unsubscribe = subscribe(onChange)
    ctx.hooks.push(entry)
    return snapshot
  }

  const entry = ctx.hooks[idx] as {
    subscribe: typeof subscribe
    unsubscribe: (() => void) | undefined
    snapshot: T
  }

  // Re-subscribe if subscribe function identity changed
  if (entry.subscribe !== subscribe) {
    if (entry.unsubscribe) entry.unsubscribe()
    const onChange = () => {
      const next = getSnapshot()
      if (!Object.is(entry.snapshot, next)) {
        entry.snapshot = next
        ctx.scheduleRerender()
      }
    }
    entry.unsubscribe = subscribe(onChange)
    entry.subscribe = subscribe
  }

  // Always read fresh snapshot during render
  entry.snapshot = getSnapshot()
  return entry.snapshot
}

// ─── use ────────────────────────────────────────────────────────────────────

const _promiseCache = new WeakMap<
  Promise<unknown>,
  { status: 'pending' | 'resolved' | 'rejected'; value?: unknown; error?: unknown }
>()

/**
 * React-compatible `use` — reads a Context or suspends on a Promise.
 * Can be called conditionally (unlike other hooks).
 *
 * IMPORTANT: Promises must have a stable identity across renders.
 * Create promises outside the component or memoize them. Calling
 * `use(fetch('/api'))` creates a new promise each render and will
 * cause infinite suspension.
 */
export function use<T>(resource: Context<T> | CompatContext<T> | Promise<T>): T {
  // Compat context path
  if (resource && typeof resource === 'object' && COMPAT_CTX in resource) {
    return useContext(resource as CompatContext<T>)
  }
  // Pyreon native context path
  if (resource && typeof resource === 'object' && 'id' in resource && 'defaultValue' in resource) {
    return pyreonUseContext(resource as Context<T>)
  }
  // Promise path — suspend via throw
  const promise = resource as Promise<T>
  let entry = _promiseCache.get(promise)
  if (!entry) {
    entry = { status: 'pending' }
    _promiseCache.set(promise, entry)
    promise.then(
      (value) => {
        entry!.status = 'resolved'
        entry!.value = value
      },
      (error) => {
        entry!.status = 'rejected'
        entry!.error = error
      },
    )
  }
  if (entry.status === 'resolved') return entry.value as T
  if (entry.status === 'rejected') throw entry.error
  throw promise // Suspense catches this
}

// ─── useActionState ─────────────────────────────────────────────────────────

/**
 * React-compatible `useActionState` — manages async action state with pending indicator.
 */
export function useActionState<S, P>(
  action: (state: S, payload: P) => S | Promise<S>,
  initialState: S,
): [S, (payload: P) => void, boolean] {
  const [state, setState] = useState(initialState)
  const [isPending, setIsPending] = useState(false)

  const dispatch = (payload: P) => {
    setIsPending(true)
    const result = action(state, payload)
    if (result instanceof Promise) {
      result.then((next) => {
        setState(next)
        setIsPending(false)
      })
    } else {
      setState(result)
      setIsPending(false)
    }
  }

  return [state, dispatch, isPending]
}

// ─── startTransition ────────────────────────────────────────────────────────

/**
 * React-compatible `startTransition` — runs the callback synchronously.
 * No concurrent mode in Pyreon, so transitions are immediate.
 */
export function startTransition(fn: () => void): void {
  fn()
}

// ─── isValidElement ─────────────────────────────────────────────────────────

/**
 * React-compatible `isValidElement` — checks if a value is a VNode.
 */
export function isValidElement(value: unknown): value is VNode {
  return value != null && typeof value === 'object' && 'type' in value && 'props' in value
}

// ─── useDebugValue ──────────────────────────────────────────────────────────

/**
 * React-compatible `useDebugValue` — no-op in Pyreon (no React DevTools integration).
 */
export function useDebugValue<T>(_value: T, _format?: (v: T) => unknown): void {}

// ─── flushSync ──────────────────────────────────────────────────────────────

/**
 * React-compatible `flushSync` — runs the callback synchronously.
 *
 * BEHAVIORAL DIFFERENCE: In Pyreon's compat model, state updates are
 * batched via microtask. flushSync runs the callback and returns its
 * result, but the DOM updates triggered by state changes inside the
 * callback still fire asynchronously. For DOM measurement after state
 * updates, use `await act(() => setState(...))` in tests, or
 * `requestAnimationFrame` in production code.
 */
export function flushSync<T>(fn: () => T): T {
  return fn()
}

// ─── act (testing) ──────────────────────────────────────────────────────────

/**
 * React-compatible `act` — flushes pending microtasks for testing.
 */
export async function act(fn: () => void | Promise<void>): Promise<void> {
  const result = fn()
  if (result instanceof Promise) await result
  // Flush two rounds of microtasks to drain pending effects and rerenders
  await new Promise<void>((r) => queueMicrotask(r))
  await new Promise<void>((r) => queueMicrotask(r))
}

// ─── version ────────────────────────────────────────────────────────────────

export const version = '19.0.0-pyreon'

// ─── StrictMode / Profiler ──────────────────────────────────────────────────

/**
 * React-compatible `StrictMode` — pass-through in Pyreon (no double-invoke behavior).
 */
export function StrictMode(props: { children?: VNodeChild }): VNodeChild {
  return props.children ?? null
}

/**
 * React-compatible `Profiler` — pass-through in Pyreon (no profiling integration).
 */
export function Profiler(props: {
  id: string
  onRender?: (...args: unknown[]) => void
  children?: VNodeChild
}): VNodeChild {
  return props.children ?? null
}

// ─── Component / PureComponent (class stubs) ────────────────────────────────

/**
 * React-compatible `Component` class stub.
 * Class components are not fully supported — use function components with hooks.
 */
export class Component<P = Record<string, unknown>, S = Record<string, unknown>> {
  props: Readonly<P>
  state: Readonly<S>

  constructor(props: P) {
    this.props = props
    this.state = {} as S
  }

  setState(_partial: Partial<S> | ((prev: S) => Partial<S>)): void {
    console.warn(
      '[Pyreon] Class component setState is not supported. Use function components with hooks.',
    )
  }

  forceUpdate(): void {
    console.warn(
      '[Pyreon] Class component forceUpdate is not supported. Use function components with hooks.',
    )
  }

  render(): VNodeChild {
    return null
  }
}

/**
 * React-compatible `PureComponent` class stub.
 */
export class PureComponent<
  P = Record<string, unknown>,
  S = Record<string, unknown>,
> extends Component<P, S> {}

// ─── React-compatible type exports ──────────────────────────────────────────

export type { Context }

export type FC<P = Record<string, unknown>> = (props: P) => VNodeChild
export type FunctionComponent<P = Record<string, unknown>> = FC<P>
export type ReactElement = VNode
export type ReactNode = VNodeChild
export type JSXElementConstructor<P> = (props: P) => VNodeChild
export type Dispatch<A> = (action: A) => void
export type SetStateAction<S> = S | ((prev: S) => S)
export type RefObject<T> = { readonly current: T | null }
export type MutableRefObject<T> = { current: T }
export type RefCallback<T> = (instance: T | null) => void
export type ForwardedRef<T> = RefObject<T> | RefCallback<T> | null
export type PropsWithChildren<P = Record<string, unknown>> = P & { children?: ReactNode }
export type PropsWithRef<P> = P & { ref?: RefObject<unknown> | RefCallback<unknown> | null }
export type { CSSProperties } from '@pyreon/core'

// Event types — aliases for TargetedEvent patterns
export type SyntheticEvent<T = Element> = Event & { currentTarget: T }
export type ChangeEvent<T = Element> = Event & { currentTarget: T; target: T }
export type FormEvent<T = Element> = Event & { currentTarget: T }
export type MouseEvent<T = Element> = globalThis.MouseEvent & { currentTarget: T }
export type KeyboardEvent<T = Element> = globalThis.KeyboardEvent & { currentTarget: T }
export type FocusEvent<T = Element> = globalThis.FocusEvent & { currentTarget: T }
export type DragEvent<T = Element> = globalThis.DragEvent & { currentTarget: T }
export type PointerEvent<T = Element> = globalThis.PointerEvent & { currentTarget: T }
export type TouchEvent<T = Element> = globalThis.TouchEvent & { currentTarget: T }
export type ClipboardEvent<T = Element> = globalThis.ClipboardEvent & { currentTarget: T }
export type AnimationEvent<T = Element> = globalThis.AnimationEvent & { currentTarget: T }
export type TransitionEvent<T = Element> = globalThis.TransitionEvent & { currentTarget: T }
export type WheelEvent<T = Element> = globalThis.WheelEvent & { currentTarget: T }

// HTML attribute types
export type HTMLAttributes<T = HTMLElement> = Record<string, unknown> & {
  ref?: RefObject<T> | RefCallback<T> | null
}
export type InputHTMLAttributes<T = HTMLInputElement> = HTMLAttributes<T>
export type TextareaHTMLAttributes<T = HTMLTextAreaElement> = HTMLAttributes<T>
export type SelectHTMLAttributes<T = HTMLSelectElement> = HTMLAttributes<T>
export type ButtonHTMLAttributes<T = HTMLButtonElement> = HTMLAttributes<T>
export type AnchorHTMLAttributes<T = HTMLAnchorElement> = HTMLAttributes<T>
export type FormHTMLAttributes<T = HTMLFormElement> = HTMLAttributes<T>
export type ImgHTMLAttributes<T = HTMLImageElement> = HTMLAttributes<T>
export type SVGAttributes<T = SVGElement> = HTMLAttributes<T>
