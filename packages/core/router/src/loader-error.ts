/**
 * Dev-only tag: which route's loader threw.
 *
 * `router.preload` (the server-side loader pass every SSR host runs) rethrows
 * a loader's error unchanged. In development it first stores the throwing
 * record's `path` on the error under this registered symbol, so a dev host
 * can tell a loader failure from a render failure and name the route. Zero's
 * development error overlay reads it. The key is a `Symbol.for` so a host
 * that loads its own copy of the router (Vite's SSR module graph next to the
 * Node one) reads the same property.
 *
 * Non-enumerable, so it never shows up in a serialised error. Primitives and
 * frozen errors are left alone.
 *
 * @internal
 */
export const LOADER_ERROR_ROUTE: symbol = Symbol.for('pyreon.router.loaderErrorRoute')

/** @internal */
export function markLoaderError(err: unknown, route: string): void {
  if ((typeof err !== 'object' && typeof err !== 'function') || err === null) return
  try {
    Object.defineProperty(err, LOADER_ERROR_ROUTE, { value: route, configurable: true })
  } catch {
    // A frozen or non-extensible error keeps its identity untagged.
  }
}
