/**
 * @pyreon/preact-compat/hooks
 *
 * Preact-compatible hooks — separate import like `preact/hooks`.
 *
 * Components re-render on state change — just like Preact. Hooks return plain
 * values and use deps arrays for memoization. Existing Preact code works
 * unchanged when paired with `pyreon({ compat: "preact" })` in your vite config.
 */

import type { VNodeChild } from "@pyreon/core";
import { onErrorCaptured, useContext } from "@pyreon/core";
import type { EffectEntry } from "./jsx-runtime";
import { getCurrentCtx, getHookIndex } from "./jsx-runtime";

export { useContext };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireCtx() {
  const ctx = getCurrentCtx();
  if (!ctx) throw new Error("Hook called outside of a component render");
  return ctx;
}

function depsChanged(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (a === undefined || b === undefined) return true;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return true;
  }
  return false;
}

// ─── useState ────────────────────────────────────────────────────────────────

/**
 * Preact-compatible `useState` — returns `[value, setter]`.
 * Triggers a component re-render when the setter is called.
 */
export function useState<T>(initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] {
  const ctx = requireCtx();
  const idx = getHookIndex();

  if (ctx.hooks.length <= idx) {
    ctx.hooks.push(typeof initial === "function" ? (initial as () => T)() : initial);
  }

  const value = ctx.hooks[idx] as T;
  const setter = (v: T | ((prev: T) => T)) => {
    const current = ctx.hooks[idx] as T;
    const next = typeof v === "function" ? (v as (prev: T) => T)(current) : v;
    if (Object.is(current, next)) return;
    ctx.hooks[idx] = next;
    ctx.scheduleRerender();
  };

  return [value, setter];
}

// ─── useEffect ───────────────────────────────────────────────────────────────

/**
 * Preact-compatible `useEffect` — runs after render when deps change.
 * Returns cleanup on unmount and before re-running.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: matches Preact's useEffect signature
export function useEffect(fn: () => (() => void) | void, deps?: unknown[]): void {
  const ctx = requireCtx();
  const idx = getHookIndex();

  if (ctx.hooks.length <= idx) {
    // First render — always run
    const entry: EffectEntry = { fn, deps, cleanup: undefined };
    ctx.hooks.push(entry);
    ctx.pendingEffects.push(entry);
  } else {
    const entry = ctx.hooks[idx] as EffectEntry;
    if (depsChanged(entry.deps, deps)) {
      entry.fn = fn;
      entry.deps = deps;
      ctx.pendingEffects.push(entry);
    }
  }
}

// ─── useLayoutEffect ─────────────────────────────────────────────────────────

/**
 * Preact-compatible `useLayoutEffect` — runs synchronously after DOM mutations.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: matches Preact's useLayoutEffect signature
export function useLayoutEffect(fn: () => (() => void) | void, deps?: unknown[]): void {
  const ctx = requireCtx();
  const idx = getHookIndex();

  if (ctx.hooks.length <= idx) {
    const entry: EffectEntry = { fn, deps, cleanup: undefined };
    ctx.hooks.push(entry);
    ctx.pendingLayoutEffects.push(entry);
  } else {
    const entry = ctx.hooks[idx] as EffectEntry;
    if (depsChanged(entry.deps, deps)) {
      entry.fn = fn;
      entry.deps = deps;
      ctx.pendingLayoutEffects.push(entry);
    }
  }
}

// ─── useMemo ─────────────────────────────────────────────────────────────────

/**
 * Preact-compatible `useMemo` — returns the cached value, recomputed when deps change.
 */
export function useMemo<T>(fn: () => T, deps: unknown[]): T {
  const ctx = requireCtx();
  const idx = getHookIndex();

  if (ctx.hooks.length <= idx) {
    const value = fn();
    ctx.hooks.push({ value, deps });
    return value;
  }

  const entry = ctx.hooks[idx] as { value: T; deps: unknown[] };
  if (depsChanged(entry.deps, deps)) {
    entry.value = fn();
    entry.deps = deps;
  }
  return entry.value;
}

// ─── useCallback ─────────────────────────────────────────────────────────────

/**
 * Preact-compatible `useCallback` — returns the cached function when deps haven't changed.
 */
export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: unknown[]): T {
  return useMemo(() => fn, deps);
}

// ─── useRef ──────────────────────────────────────────────────────────────────

/**
 * Preact-compatible `useRef` — returns `{ current }` persisted across re-renders.
 */
export function useRef<T>(initial?: T): { current: T | null } {
  const ctx = requireCtx();
  const idx = getHookIndex();

  if (ctx.hooks.length <= idx) {
    const ref = { current: initial !== undefined ? (initial as T) : null };
    ctx.hooks.push(ref);
  }

  return ctx.hooks[idx] as { current: T | null };
}

// ─── useReducer ──────────────────────────────────────────────────────────────

/**
 * Preact-compatible `useReducer` — returns `[state, dispatch]`.
 */
export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S | (() => S),
): [S, (action: A) => void] {
  const ctx = requireCtx();
  const idx = getHookIndex();

  if (ctx.hooks.length <= idx) {
    ctx.hooks.push(typeof initial === "function" ? (initial as () => S)() : initial);
  }

  const state = ctx.hooks[idx] as S;
  const dispatch = (action: A) => {
    const current = ctx.hooks[idx] as S;
    const next = reducer(current, action);
    if (Object.is(current, next)) return;
    ctx.hooks[idx] = next;
    ctx.scheduleRerender();
  };

  return [state, dispatch];
}

// ─── useId ───────────────────────────────────────────────────────────────────

let _idCounter = 0;

/**
 * Preact-compatible `useId` — returns a stable unique string per hook call.
 */
export function useId(): string {
  const ctx = requireCtx();
  const idx = getHookIndex();

  if (ctx.hooks.length <= idx) {
    ctx.hooks.push(`:r${(_idCounter++).toString(36)}:`);
  }

  return ctx.hooks[idx] as string;
}

// ─── Optimization ────────────────────────────────────────────────────────────

/**
 * Preact-compatible `memo` — wraps a component to skip re-render when props
 * are shallowly equal.
 */
export function memo<P extends Record<string, unknown>>(
  component: (props: P) => VNodeChild,
  areEqual?: (prevProps: P, nextProps: P) => boolean,
): (props: P) => VNodeChild {
  const compare =
    areEqual ??
    ((a: P, b: P) => {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      for (const k of keysA) {
        if (!Object.is(a[k], b[k])) return false;
      }
      return true;
    });

  let prevProps: P | null = null;
  let prevResult: VNodeChild = null;

  return (props: P) => {
    if (prevProps !== null && compare(prevProps, props)) {
      return prevResult;
    }
    prevProps = props;
    prevResult = (component as (p: P) => VNodeChild)(props);
    return prevResult;
  };
}

// ─── useErrorBoundary ────────────────────────────────────────────────────────

/**
 * Preact-compatible `useErrorBoundary`.
 * Wraps Pyreon's `onErrorCaptured`.
 */
export { onErrorCaptured as useErrorBoundary };
