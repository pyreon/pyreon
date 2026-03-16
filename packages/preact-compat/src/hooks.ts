/**
 * @pyreon/preact-compat/hooks
 *
 * Preact hooks — separate import like `preact/hooks`.
 * All hooks run on Pyreon's reactive engine under the hood.
 */

import type { CleanupFn } from "@pyreon/core"
import { createRef, onErrorCaptured, onMount, onUnmount, useContext } from "@pyreon/core"
import { computed, effect, getCurrentScope, runUntracked, signal } from "@pyreon/reactivity"

export { useContext }

// ─── useState ────────────────────────────────────────────────────────────────

/**
 * Drop-in for Preact's `useState`.
 * Returns `[getter, setter]` — call `getter()` to read, `setter(v)` to write.
 */
export function useState<T>(initial: T | (() => T)): [() => T, (v: T | ((prev: T) => T)) => void] {
  const s = signal<T>(typeof initial === "function" ? (initial as () => T)() : initial)
  const setter = (v: T | ((prev: T) => T)) => {
    if (typeof v === "function") s.update(v as (prev: T) => T)
    else s.set(v)
  }
  return [s, setter]
}

// ─── useEffect ───────────────────────────────────────────────────────────────

/**
 * Drop-in for Preact's `useEffect`.
 * The `deps` array is IGNORED — Pyreon tracks dependencies automatically.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is intentional — callers may return void
export function useEffect(fn: () => CleanupFn | void, deps?: unknown[]): void {
  if (deps !== undefined && deps.length === 0) {
    onMount((): undefined => {
      const cleanup = runUntracked(fn)
      if (typeof cleanup === "function") onUnmount(cleanup)
    })
  } else {
    // effect() natively supports cleanup: if fn() returns a function,
    // it's called before re-runs and on dispose.
    const e = effect(fn)
    onUnmount(() => {
      e.dispose()
    })
  }
}

// ─── useLayoutEffect ─────────────────────────────────────────────────────────

/**
 * Drop-in for Preact's `useLayoutEffect`.
 * No distinction from useEffect in Pyreon — same implementation.
 */
export const useLayoutEffect = useEffect

// ─── useMemo ─────────────────────────────────────────────────────────────────

/**
 * Drop-in for Preact's `useMemo`.
 * Returns a getter — call `value()` to read.
 */
export function useMemo<T>(fn: () => T, _deps?: unknown[]): () => T {
  return computed(fn)
}

// ─── useCallback ─────────────────────────────────────────────────────────────

/**
 * Drop-in for Preact's `useCallback`.
 * Components run once in Pyreon — returns `fn` as-is.
 */
// biome-ignore lint/suspicious/noExplicitAny: any is needed for contravariant function params
export function useCallback<T extends (...args: any[]) => any>(fn: T, _deps?: unknown[]): T {
  return fn
}

// ─── useRef ──────────────────────────────────────────────────────────────────

/**
 * Drop-in for Preact's `useRef`.
 * Returns `{ current: T }`.
 */
export function useRef<T>(initial?: T): { current: T | null } {
  const ref = createRef<T>()
  if (initial !== undefined) ref.current = initial as T
  return ref
}

// ─── useReducer ──────────────────────────────────────────────────────────────

/**
 * Drop-in for Preact's `useReducer`.
 */
export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S | (() => S),
): [() => S, (action: A) => void] {
  const s = signal<S>(typeof initial === "function" ? (initial as () => S)() : initial)
  const dispatch = (action: A) => s.update((prev) => reducer(prev, action))
  return [s, dispatch]
}

// ─── useId ───────────────────────────────────────────────────────────────────

const _idCounters = new WeakMap<object, number>()

/**
 * Drop-in for Preact's `useId`.
 * Returns a stable unique string per component instance.
 */
export function useId(): string {
  const scope = getCurrentScope()
  if (!scope) return `:r${Math.random().toString(36).slice(2, 9)}:`
  const count = _idCounters.get(scope) ?? 0
  _idCounters.set(scope, count + 1)
  return `:r${count.toString(36)}:`
}

// ─── useErrorBoundary ────────────────────────────────────────────────────────

/**
 * Drop-in for Preact's `useErrorBoundary`.
 * Wraps Pyreon's `onErrorCaptured`.
 */
export { onErrorCaptured as useErrorBoundary }
