import type { computed, signal } from '@pyreon/reactivity'

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

/** Check if a value is a signal (callable function with .set or .peek). */
export function isSignal<T>(value: unknown): value is ReadableSignal<T> {
  return typeof value === 'function'
}
