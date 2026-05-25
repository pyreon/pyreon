/**
 * Typed accessors for framework-internal APIs in tests.
 *
 * Pre-PR-6, ~240 test sites used the `as unknown as { _internal(): T }`
 * cast pattern to reach Pyreon's framework-internal methods (e.g.
 * `router._resolve`, `signal._s`, internals deliberately not exported
 * for stability reasons but needed for white-box testing).
 *
 * `accessInternal` and `callInternal` collapse that boilerplate to a
 * single typed call site. The type parameter documents WHAT shape the
 * caller expects to see; the runtime is a straight pass-through.
 *
 * The cast is intentionally `as unknown as T` (not `as T`) — a single
 * `as` would error on overlapping-public-surface conflicts. The double
 * cast tells TS "I know better than the public type here," which is
 * precisely the contract of a white-box test.
 *
 * @example
 *   // Before:
 *   const resolved = (router as unknown as {
 *     _resolve(p: string): ResolvedRoute
 *   })._resolve('/foo')
 *
 *   // After:
 *   const resolved = callInternal<'_resolve', ResolvedRoute>(
 *     router,
 *     '_resolve',
 *     '/foo',
 *   )
 *
 *   // Or, to access fields rather than methods:
 *   const subs = accessInternal<{ _s: Set<() => void> }>(signal)._s
 */

/**
 * Type-assert that `obj` has the shape `T`. Compiles to a no-op at
 * runtime — purely a type-narrowing helper for test code that needs to
 * reach internal framework state.
 */
export function accessInternal<T>(obj: object): T {
  return obj as unknown as T
}

/**
 * Call a method on `obj` that isn't part of its public surface.
 * `method` is constrained to `string` so the call site documents the
 * method name explicitly. `TReturn` documents the expected return.
 *
 * Variadic args are passed through unchanged.
 */
export function callInternal<TKey extends string, TReturn>(
  obj: object,
  method: TKey,
  ...args: unknown[]
): TReturn {
  const fn = (obj as unknown as Record<TKey, (...args: unknown[]) => TReturn>)[method]
  if (typeof fn !== 'function') {
    throw new Error(
      `callInternal: ${method} is not a function on the given object`,
    )
  }
  return fn.apply(obj, args)
}
