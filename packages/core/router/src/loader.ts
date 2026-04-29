import type { Context } from '@pyreon/core'
import { createContext, useContext } from '@pyreon/core'
import type { RouterInstance } from './types'

// Dev-mode gate + counter sink. See packages/internals/perf-harness for contract.
const __DEV__ = process.env.NODE_ENV !== 'production'
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Context frame that holds the loader data for the currently rendered route record.
 * Pushed by RouterView's withLoaderData wrapper before invoking the route component.
 */
export const LoaderDataContext: Context<unknown> = createContext<unknown>(undefined)

/**
 * Returns the data resolved by the current route's `loader` function.
 * Must be called inside a route component rendered by <RouterView />.
 *
 * @example
 * const routes = [{ path: "/users", component: Users, loader: fetchUsers }]
 *
 * function Users() {
 *   const users = useLoaderData<User[]>()
 *   return h("ul", null, users.map(u => h("li", null, u.name)))
 * }
 */
export function useLoaderData<T = unknown>(): T {
  return useContext(LoaderDataContext) as T
}

/**
 * SSR helper: pre-run all loaders for the given path before rendering.
 * Call this before `renderToString` so route components can read data via `useLoaderData()`.
 *
 * The optional `request` is forwarded to each loader's `LoaderContext.request`,
 * letting server-side loaders read cookies / auth headers and `throw redirect()`
 * before the layout renders. A loader that throws `redirect()` propagates the
 * thrown error here — the SSR handler's `catch` converts it into a 302/307
 * `Location:` Response.
 *
 * @example
 * const router = createRouter({ routes, url: req.url })
 * await prefetchLoaderData(router, req.url, request)
 * const html = await renderToString(h(App, { router }))
 */
export async function prefetchLoaderData(
  router: RouterInstance,
  path: string,
  request?: Request,
): Promise<void> {
  if (__DEV__) _countSink.__pyreon_count__?.('router.prefetch')
  const route = router._resolve(path)
  // Use a local AbortController — prefetch is best-effort and must NOT
  // clobber `router._abortController`, which belongs to the active
  // navigation. Previously, hovering a link during a navigation replaced
  // the nav's controller, destroying its abort capability.
  const ac = new AbortController()
  await Promise.all(
    route.matched
      .filter((r) => r.loader)
      .map(async (r) => {
        const data = await r.loader?.({
          params: route.params,
          query: route.query,
          signal: ac.signal,
          ...(request ? { request } : {}),
        })
        router._loaderData.set(r, data)
      }),
  )
}

/**
 * Serialize loader data to a JSON-safe plain object for embedding in SSR HTML.
 * Keys are route path patterns (stable across server and client).
 *
 * @example — SSR handler:
 * await prefetchLoaderData(router, req.url)
 * const { html, head } = await renderWithHead(h(App, null))
 * const page = `...${head}
 *   <script>window.__PYREON_LOADER_DATA__=${JSON.stringify(serializeLoaderData(router))}</script>
 *   ...${html}...`
 */
export function serializeLoaderData(router: RouterInstance): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [record, data] of router._loaderData) {
    result[record.path] = data
  }
  return result
}

/**
 * Hydrate loader data from a serialized object (e.g. `window.__PYREON_LOADER_DATA__`).
 * Populates the router's internal `_loaderData` map so the initial render uses
 * server-fetched data without re-running loaders on the client.
 *
 * Call this before `mount()`, after `createRouter()`.
 *
 * @example — client entry:
 * import { hydrateLoaderData } from "@pyreon/router"
 * const router = createRouter({ routes })
 * hydrateLoaderData(router, window.__PYREON_LOADER_DATA__ ?? {})
 * mount(h(App, null), document.getElementById("app")!)
 */
export function hydrateLoaderData(
  router: RouterInstance,
  serialized: Record<string, unknown>,
): void {
  if (!serialized || typeof serialized !== 'object') return
  const route = router._resolve(router.currentRoute().path)
  for (const record of route.matched) {
    if (Object.hasOwn(serialized, record.path)) {
      router._loaderData.set(record, serialized[record.path])
    }
  }
}
