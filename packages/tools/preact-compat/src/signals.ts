/**
 * @pyreon/preact-compat/signals
 *
 * Preact Signals compatibility layer (`@preact/signals` style).
 * Wraps Pyreon's signal/computed in `{ value }` accessor objects.
 */

import type { Effect } from "@pyreon/reactivity";
import {
  batch as pyreonBatch,
  computed as pyreonComputed,
  effect as pyreonEffect,
  signal as pyreonSignal,
} from "@pyreon/reactivity";

// ─── Signal ──────────────────────────────────────────────────────────────────

export interface ReadonlySignal<T> {
  readonly value: T;
  peek(): T;
}

export interface WritableSignal<T> extends ReadonlySignal<T> {
  value: T;
}

/**
 * Create a Preact-style signal with `.value` accessor.
 *
 * @example
 * const count = signal(0)
 * count.value++       // write
 * console.log(count.value)  // read (tracked)
 */
export function signal<T>(initial: T): WritableSignal<T> {
  const s = pyreonSignal<T>(initial);
  return {
    get value(): T {
      return s();
    },
    set value(v: T) {
      s.set(v);
    },
    peek(): T {
      return s.peek();
    },
  };
}

// ─── Computed ────────────────────────────────────────────────────────────────

/**
 * Create a Preact-style computed with `.value` accessor.
 *
 * @example
 * const doubled = computed(() => count.value * 2)
 * console.log(doubled.value)
 */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
  const c = pyreonComputed(fn);
  return {
    get value(): T {
      return c();
    },
    peek(): T {
      // computed doesn't have peek — just read the value untracked
      return c();
    },
  };
}

// ─── Effect ──────────────────────────────────────────────────────────────────

/**
 * Run a side-effect that auto-tracks signal reads.
 * Returns a dispose function.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is intentional — callers may return void
export function effect(fn: () => void | (() => void)): () => void {
  // Pyreon's effect() natively supports cleanup return values
  const e: Effect = pyreonEffect(fn);
  return () => {
    e.dispose();
  };
}

// ─── Batch ───────────────────────────────────────────────────────────────────

/**
 * Batch multiple signal writes into a single update.
 */
export { pyreonBatch as batch };
