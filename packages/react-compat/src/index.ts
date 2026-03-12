/**
 * @pyreon/react-compat
 *
 * React-compatible hook API that runs on Pyreon's reactive engine.
 *
 * Allows you to write familiar React-style code while getting Pyreon's
 * fine-grained reactivity, built-in router/store, and superior performance.
 *
 * DIFFERENCES FROM REACT:
 *  - No hooks rules: call these anywhere in a component, in loops, conditions, etc.
 *  - useEffect deps array is IGNORED — Pyreon tracks dependencies automatically.
 *  - useCallback/memo are identity functions — no re-renders means no stale closures.
 *  - Components run ONCE (setup), not on every render.
 *
 * USAGE:
 *   Replace `import { useState, useEffect } from "react"` with
 *             `import { useState, useEffect } from "@pyreon/react-compat"`
 *   Replace `import { createRoot } from "react-dom/client"` with
 *             `import { createRoot } from "@pyreon/react-compat/dom"`
 */

export type { Props, VNode as ReactNode, VNodeChild } from "@pyreon/core"
// Re-export Pyreon's JSX runtime so JSX transforms work the same way
// Lifecycle
export { Fragment, h as createElement, h, onMount as useLayoutEffect } from "@pyreon/core"

import type { CleanupFn, ComponentFn, Props, VNodeChild } from "@pyreon/core"
import {
  createContext,
  createRef,
  ErrorBoundary,
  onErrorCaptured,
  onMount,
  onUnmount,
  onUpdate,
  Portal,
  Suspense,
  useContext,
} from "@pyreon/core"
import {
  batch,
  computed,
  createSelector,
  effect,
  getCurrentScope,
  runUntracked,
  signal,
} from "@pyreon/reactivity"

// ─── State ────────────────────────────────────────────────────────────────────

/**
 * Drop-in for React's `useState`.
 * Returns `[getter, setter]` — call `getter()` to read, `setter(v)` to write.
 *
 * Unlike React: the getter is a signal, so any component or effect that reads
 * it will re-run automatically. No dep arrays needed.
 */
export function useState<T>(initial: T | (() => T)): [() => T, (v: T | ((prev: T) => T)) => void] {
  const s = signal<T>(typeof initial === "function" ? (initial as () => T)() : initial)
  const setter = (v: T | ((prev: T) => T)) => {
    if (typeof v === "function") s.update(v as (prev: T) => T)
    else s.set(v)
  }
  return [s, setter]
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Drop-in for React's `useReducer`.
 */
export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S | (() => S),
): [() => S, (action: A) => void] {
  const s = signal<S>(typeof initial === "function" ? (initial as () => S)() : initial)
  const dispatch = (action: A) => s.update((prev) => reducer(prev, action))
  return [s, dispatch]
}

// ─── Effects ─────────────────────────────────────────────────────────────────

/**
 * Drop-in for React's `useEffect`.
 *
 * The `deps` array is IGNORED — Pyreon tracks reactive dependencies automatically.
 * If `deps` is `[]` (mount-only), wrap the body in `runUntracked(() => ...)`.
 *
 * Returns a cleanup the same way React does (return a function from `fn`).
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is intentional — callers may return void
export function useEffect(fn: () => CleanupFn | void, deps?: unknown[]): void {
  if (deps !== undefined && deps.length === 0) {
    // [] means "run once on mount" — use onMount instead of a tracking effect
    onMount((): undefined => {
      const cleanup = runUntracked(fn)
      if (typeof cleanup === "function") onUnmount(cleanup)
    })
  } else {
    // No deps or non-empty deps: run reactively (Pyreon auto-tracks)
    let cleanup: CleanupFn | void
    const e = effect(() => {
      if (typeof cleanup === "function") cleanup()
      cleanup = fn()
    })
    onUnmount(() => {
      if (typeof cleanup === "function") cleanup()
      e.dispose()
    })
  }
}

/**
 * Drop-in for React's `useLayoutEffect`.
 * In Pyreon there is no paint distinction — maps to `onMount` (same as useEffect).
 */
export { useEffect as useLayoutEffect_ }

// ─── Memoization ─────────────────────────────────────────────────────────────

/**
 * Drop-in for React's `useMemo`.
 * The `deps` array is IGNORED — Pyreon's `computed` tracks dependencies automatically.
 * Returns a getter: call `value()` to read the memoized result.
 */
export function useMemo<T>(fn: () => T, _deps?: unknown[]): () => T {
  return computed(fn)
}

/**
 * Drop-in for React's `useCallback`.
 * In Pyreon, components run once so callbacks are never recreated — returns `fn` as-is.
 */
export function useCallback<T extends (...args: unknown[]) => unknown>(
  fn: T,
  _deps?: unknown[],
): T {
  return fn
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

/**
 * Drop-in for React's `useRef`.
 * Returns `{ current: T }` — same shape as React's ref object.
 */
export function useRef<T>(initial?: T): { current: T | null } {
  const ref = createRef<T>()
  if (initial !== undefined) ref.current = initial as T
  return ref
}

// ─── Context ─────────────────────────────────────────────────────────────────

/**
 * Drop-in for React's `createContext` + `useContext`.
 * Usage mirrors React: `const Ctx = createContext(defaultValue)`.
 */
export { createContext, useContext }

// ─── ID ───────────────────────────────────────────────────────────────────────

/**
 * Drop-in for React's `useId` — returns a stable unique string per component instance.
 *
 * Uses the component's effectScope as the key so the counter starts at 0 for every
 * component on both server and client — IDs are deterministic and hydration-safe.
 */
const _idCounters = new WeakMap<object, number>()

export function useId(): string {
  const scope = getCurrentScope()
  if (!scope) return `:r${Math.random().toString(36).slice(2, 9)}:`
  const count = _idCounters.get(scope) ?? 0
  _idCounters.set(scope, count + 1)
  return `:r${count.toString(36)}:`
}

// ─── Optimization ─────────────────────────────────────────────────────────────

/**
 * Drop-in for React's `memo` — wraps a component.
 * In Pyreon, components run once (no re-renders), so memoization is a no-op.
 * Kept for API compatibility when migrating React code.
 */
export function memo<P extends Record<string, unknown>>(
  component: (props: P) => VNodeChild,
): (props: P) => VNodeChild {
  return component
}

/**
 * Drop-in for React's `useTransition` — no-op in Pyreon (no concurrent mode).
 * Returns `[false, (fn) => fn()]` to keep code runnable without changes.
 */
export function useTransition(): [boolean, (fn: () => void) => void] {
  return [false, (fn) => fn()]
}

/**
 * Drop-in for React's `useDeferredValue` — returns the value as-is in Pyreon.
 */
export function useDeferredValue<T>(value: T): T {
  return value
}

// ─── Batching ─────────────────────────────────────────────────────────────────

/**
 * Drop-in for React's `unstable_batchedUpdates` / React 18's automatic batching.
 * Pyreon's `batch()` does the same thing.
 */
export { batch }

// ─── Error boundaries ─────────────────────────────────────────────────────────

/**
 * Drop-in for React's error boundary pattern.
 * Return `true` from `handler` to prevent error propagation (like `componentDidCatch`).
 */
export { onErrorCaptured as useErrorBoundary }

// ─── Portals ─────────────────────────────────────────────────────────────────

/**
 * Drop-in for React's `createPortal(children, target)`.
 */
export function createPortal(children: VNodeChild, target: Element): VNodeChild {
  return Portal({ target, children })
}

// ─── Imperative handle ────────────────────────────────────────────────────────

/**
 * Drop-in for React's `useImperativeHandle`.
 * In Pyreon, expose methods via a ref prop directly — this is a compatibility shim.
 */
export function useImperativeHandle<T>(
  ref: { current: T | null } | null | undefined,
  init: () => T,
  _deps?: unknown[],
): void {
  onMount((): undefined => {
    if (ref) ref.current = init()
  })
  onUnmount(() => {
    if (ref) ref.current = null
  })
}

// ─── Selector ─────────────────────────────────────────────────────────────────

/**
 * Pyreon-specific: O(1) equality selector (no React equivalent).
 * Useful for large lists where only the selected item should re-render.
 * @see createSelector in @pyreon/reactivity
 */
export { createSelector }

// ─── onUpdate ─────────────────────────────────────────────────────────────────

/** Pyreon-specific lifecycle hook — runs after each reactive update. */
export { onMount, onUnmount, onUpdate }

// ─── Suspense / lazy ──────────────────────────────────────────────────────────

/**
 * Drop-in for React's `lazy()`.
 * Re-exported from `@pyreon/core` — wraps a dynamic import, renders null until
 * the module resolves. Pair with `<Suspense>` to show a fallback during loading.
 */
export { lazy } from "@pyreon/core"

/**
 * Drop-in for React's `<Suspense>`.
 * Shows `fallback` while a `lazy()` child is still loading.
 */
export { Suspense, ErrorBoundary }
