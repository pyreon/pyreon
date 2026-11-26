import { setLoaderData } from './loader-data-store'
import { markLoaderError } from './loader-error'
import { isNotFoundError } from './not-found'
import { getRedirectInfo } from './redirect'
import type { Router, RouterInstance } from './types'

// Server-side loader passes. They are free functions, not router methods, so a
// client bundle that never calls them carries none of their code (a method on
// the router object is retained whether or not anything calls it).

/**
 * Resolve `path` for a server render: run the initial navigation's guards,
 * load the matched lazy route components into the router's cache
 * (`router.preloadComponents`), then run the matched routes' loaders
 * (`serverLoader` when the record has one, else `loader`) with `request`.
 * After it resolves, a `RouterView` rendered against this router for `path`
 * produces final HTML synchronously: no loading fallbacks, no
 * `useLoaderData()` returning `undefined`.
 *
 * - A loader's `redirect()` rejects with that redirect (hosts turn it into an
 *   HTTP 30x); a guard redirect on the initial route does the same.
 * - A loader's `notFound()` does not reject: the router enters the not-found
 *   state for `path`, so the render produces the not-found chain (status 404).
 * - A route the initial guards cancel runs no loaders.
 *
 * The router's `currentRoute` is not changed: create the router with the same
 * `url` (`createRouter({ routes, url: path })`).
 */
export async function preloadRoute(router: Router, path: string, request?: Request): Promise<void> {
  const r = router as unknown as RouterInstance
  if (!(await r.preloadComponents(path))) return
  const resolved = r._resolve(path)
  // A LOCAL AbortController: this pass must not clobber
  // `router._abortController`, which belongs to the active navigation.
  const ac = new AbortController()
  let notFoundThrown = false
  await Promise.all(
    resolved.matched
      // `serverLoader` runs here exactly like `loader`: this pass only executes
      // on the server (SSR handler, SSG build, OG images), where the function
      // import exists.
      .filter((rec) => rec.loader || typeof rec.serverLoader === 'function')
      .map(async (rec) => {
        // `Promise.resolve().then(...)` turns a SYNCHRONOUS throw (`redirect()`
        // or `notFound()` from a sync loader, a plain `throw`) into a rejection
        // the surrounding Promise.all surfaces, instead of an uncaught throw in
        // the dev SSR pipeline.
        const run = rec.serverLoader ?? rec.loader
        let data: unknown
        try {
          data = await Promise.resolve().then(() =>
            run!({
              params: resolved.params,
              query: resolved.query,
              signal: ac.signal,
              ...(request ? { request } : {}),
            }),
          )
        } catch (err) {
          // `notFound()` is not a render failure: the page renders the
          // not-found chain. Anything else, `redirect()` included, rejects. In
          // development the error is tagged with the route whose loader threw,
          // so a dev host (zero's error overlay) can say "loader" rather than
          // "render" and name the route.
          if (!isNotFoundError(err)) {
            if (process.env.NODE_ENV !== 'production') markLoaderError(err, rec.path)
            throw err
          }
          notFoundThrown = true
          return
        }
        setLoaderData(r, rec, resolved, data)
      }),
  )
  // The not-found chain needs no extra component loading: its layouts are a
  // prefix of this chain (loaded above) and its leaf is the eager
  // `notFoundComponent`.
  if (notFoundThrown) {
    r._loaderNotFound.set(resolved.path)
  } else if (r._loaderNotFound.peek() === resolved.path) {
    r._loaderNotFound.set(null)
  }
}

/** What {@link runServerLoaders} answers for the single-fetch data endpoint. */
export type ServerLoadersResult =
  | { kind: 'data'; data: Record<number, unknown> }
  | { kind: 'redirect'; to: string; status: number }
  | { kind: 'notFound' }

/**
 * The single-fetch data endpoint's worker: run ONLY the matched chain's
 * `serverLoader` records for `path` (never isomorphic `loader`s, which run in
 * the browser; running them here would fire their side effects twice). The
 * result is keyed by matched-chain INDEX, not `record.path`: a layout and its
 * index page share a path. The client resolves the same path to the same
 * chain, so the indices map back exactly.
 *
 * Returns the data, a redirect descriptor when a server loader threw
 * `redirect()`, or `{ kind: 'notFound' }` when one threw `notFound()`.
 * Server-only: `serverLoader` functions exist only in the SSR module graph.
 */
export async function runServerLoaders(
  router: Router,
  path: string,
  request?: Request,
): Promise<ServerLoadersResult> {
  const resolved = (router as unknown as RouterInstance)._resolve(path)
  const ac = new AbortController()
  const loaderCtx = {
    params: resolved.params,
    query: resolved.query,
    signal: ac.signal,
    ...(request ? { request } : {}),
  }
  const data: Record<number, unknown> = {}
  let notFoundThrown = false
  try {
    await Promise.all(
      resolved.matched.map(async (rec, i) => {
        if (typeof rec.serverLoader !== 'function') return
        // Same sync-throw-to-rejection wrap as preloadRoute.
        try {
          data[i] = await Promise.resolve().then(() => rec.serverLoader!(loaderCtx))
        } catch (err) {
          if (!isNotFoundError(err)) throw err
          notFoundThrown = true
        }
      }),
    )
  } catch (err) {
    const info = getRedirectInfo(err)
    if (info) return { kind: 'redirect', to: info.url, status: info.status }
    throw err
  }
  if (notFoundThrown) return { kind: 'notFound' }

  return { kind: 'data', data }
}
