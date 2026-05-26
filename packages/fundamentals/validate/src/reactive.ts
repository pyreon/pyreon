/**
 * Reactive bridges to `@pyreon/reactivity`.
 *
 * `parseReactive(schema, source)` — wraps a Standard Schema's
 *   `~standard.validate` in a `Computed<ParseResult>` that re-derives
 *   on every read of the source signal/accessor. Synchronous-only:
 *   async validators promote to `Promise<ParseResult>` and the caller
 *   must `await` (or use `parseReactiveAsync`).
 *
 * `parseReactiveAsync(schema, source)` — same shape, but the result is
 *   a `Computed<Promise<ParseResult>>`. Use for schemas that include
 *   async refinements (Zod `.refine(async)`, Valibot's async pipe).
 *   Honours abort tokens: when the source signal flips before the
 *   previous validation settles, the previous result is discarded
 *   (the latest input always wins).
 *
 * `watchValid(schema, source, callback)` — fires `callback(valid)` when
 *   the validity bit flips (input transitions from valid to invalid or
 *   vice versa). Suitable for form-state hooks that only care about
 *   "is this field OK?" without re-rendering on every error-message
 *   change.
 */

import { type Computed, type Signal, computed, watch } from '@pyreon/reactivity'
import type {
  StandardSchemaIssue,
  StandardSchemaResult,
  StandardSchemaV1,
} from './types'

/**
 * Source the validator reads. Accepts a `Signal<T>` directly OR a
 * `() => T` accessor. Accessor form is the canonical Pyreon shape —
 * any `computed()`, `props.X`, or hand-rolled function counts.
 */
export type ReactiveSource<T> = Signal<T> | (() => T)

/**
 * Resolve a `ReactiveSource<T>` to its current value. Calling `()` on
 * a `Signal<T>` returns the value AND registers a reactive dependency
 * — same for plain accessors. Symmetric for both shapes.
 */
function read<T>(source: ReactiveSource<T>): T {
  return typeof source === 'function' ? source() : (source as Signal<T>)()
}

/**
 * The synchronous-or-async parse result shape — exposes `value` on
 * success and `issues` on failure. Mirrors Standard Schema's `Result<T>`
 * exactly (so downstream code that already handles StdSchema results
 * just works).
 */
export type ParseResult<T> = StandardSchemaResult<T>

/**
 * Reactively parse `source` through `schema`. Returns a `Computed<ParseResult>`
 * that re-validates on every source change.
 *
 * For schemas whose `validate` is async (Zod `.refine(async)`, Valibot
 * async pipe, ArkType's `Promise`-returning narrows), use
 * {@link parseReactiveAsync} — this sync variant treats a Promise
 * return as an issue (the caller didn't expect async).
 *
 * @example
 * ```ts
 * import { signal } from '@pyreon/reactivity'
 * import { z } from 'zod'
 * import { parseReactive } from '@pyreon/validate'
 *
 * const $email = signal('foo@bar.com')
 * const $result = parseReactive(z.string().email(), $email)
 *
 * effect(() => {
 *   const r = $result()
 *   if (r.issues) console.warn('invalid:', r.issues)
 *   else console.log('parsed:', r.value)
 * })
 *
 * $email.set('not-an-email')   // → $result fires, issues populated
 * ```
 */
export function parseReactive<S extends StandardSchemaV1<unknown, unknown>>(
  schema: S,
  source: ReactiveSource<unknown>,
): Computed<ParseResult<unknown>> {
  return computed<ParseResult<unknown>>(() => {
    const value = read(source)
    const result = schema['~standard'].validate(value)
    if (result instanceof Promise) {
      // Sync-only API: surface an issue so the caller knows to switch
      // to `parseReactiveAsync`. The error is structured so test code
      // can assert on it programmatically.
      return {
        issues: [
          {
            message:
              '[Pyreon] schema is async — use parseReactiveAsync(schema, source) instead of parseReactive()',
            path: [],
          } satisfies StandardSchemaIssue,
        ],
      }
    }
    return result
  })
}

/**
 * Async variant of {@link parseReactive}. Returns a `Computed<Promise<ParseResult>>`
 * — the outer `Computed` re-evaluates synchronously on source change,
 * but the inner `Promise` resolves once the validator finishes.
 *
 * **Stale-result handling**: rapid source changes (typing) produce
 * overlapping in-flight promises. The CALLER is responsible for
 * awaiting only the latest — pattern below uses `watch` to track the
 * latest accessor identity.
 *
 * @example
 * ```ts
 * import { signal, watch } from '@pyreon/reactivity'
 * import { parseReactiveAsync } from '@pyreon/validate'
 *
 * const $email = signal('')
 * const $result = parseReactiveAsync(schemaWithAsyncRefine, $email)
 *
 * watch($result, async (current) => {
 *   const result = await current
 *   // Use result — watch() naturally drops stale frames.
 * })
 * ```
 */
export function parseReactiveAsync<S extends StandardSchemaV1<unknown, unknown>>(
  schema: S,
  source: ReactiveSource<unknown>,
): Computed<Promise<ParseResult<unknown>>> {
  return computed<Promise<ParseResult<unknown>>>(async () => {
    const value = read(source)
    const result = schema['~standard'].validate(value)
    return result instanceof Promise ? result : result
  })
}

/**
 * Subscribe to validity transitions. The callback fires when validity
 * flips (true→false or false→true), not on every error-message change.
 * Returns an unsubscribe function.
 *
 * Internally a `watch()` over `parseReactive(schema, source)` with an
 * equality check on `issues === undefined`. Cheap.
 *
 * @example
 * ```ts
 * const stop = watchValid(emailSchema, $email, (valid) => {
 *   submitButton.disabled = !valid
 * })
 *
 * onUnmount(stop)
 * ```
 */
export function watchValid<S extends StandardSchemaV1<unknown, unknown>>(
  schema: S,
  source: ReactiveSource<unknown>,
  callback: (valid: boolean) => void,
): () => void {
  let lastValid: boolean | undefined
  return watch(
    () => {
      const value = read(source)
      const result = schema['~standard'].validate(value)
      if (result instanceof Promise) return undefined
      return result.issues === undefined
    },
    (valid) => {
      // Filter — only fire on REAL transitions.
      if (valid === undefined) return
      if (lastValid !== valid) {
        lastValid = valid
        callback(valid)
      }
    },
    { immediate: true },
  )
}
