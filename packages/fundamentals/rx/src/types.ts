import type { computed } from '@pyreon/reactivity'

/** A readable signal — any callable that returns a value and tracks subscribers. */
export type ReadableSignal<T> = (() => T) & { peek?: () => T }

/** Result of a signal-aware transform — Computed when input is signal, plain when not. */
export type ReactiveResult<TInput, TOutput> =
  TInput extends ReadableSignal<any> ? ReturnType<typeof computed<TOutput>> : TOutput

/** Key extractor — string key name or function. */
export type KeyOf<T> = keyof T | ((item: T) => string | number)

/** Resolve a key extractor to a function. */
export function resolveKey<T>(key: KeyOf<T>): (item: T) => string | number {
  return typeof key === 'function' ? key : (item: T) => String(item[key])
}

/**
 * Check if a value is a reactive source. Detection is deliberately
 * `typeof value === 'function'` — ANY callable (a signal, a computed, a plain
 * `() => T` accessor) is treated as reactive and read inside a computed. It
 * does NOT check for `.set`/`.peek`, so a non-reactive function is still
 * "reactive" here (it simply never notifies).
 */
export function isSignal<T>(value: unknown): value is ReadableSignal<T> {
  return typeof value === 'function'
}
