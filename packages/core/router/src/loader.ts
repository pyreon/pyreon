import type { Context } from '@pyreon/core'
import { createContext, useContext } from '@pyreon/core'
import type { RouterInstance } from './types'

// Dev-mode gate + counter sink. See packages/internals/perf-harness for contract.
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
 * NOTE: this runs LOADERS only — it does NOT resolve lazy route *components*.
 * The SSR handler additionally calls `router.preload(path)` to resolve lazy
 * components into the cache before the synchronous render (an unresolved
 * `lazy()` would otherwise fall back to its empty loading state and ship a
 * blank page). This function stays loaders-only because it is also the
 * RouterLink-prefetch path, which should warm loader DATA on hover without
 * eagerly downloading every route's component chunk.
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
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('router.prefetch')
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
 * Serialize loader data to JSON for embedding in an SSR `<script>` tag.
 *
 * M2.2 — Drop-in replacement for `JSON.stringify(serializeLoaderData(router))`
 * with three correctness wins:
 *   1. **Strips functions / symbols / undefined values silently** so a loader
 *      that accidentally returns `{ data, fn: () => {} }` doesn't crash
 *      hydration — `JSON.stringify` drops these by default for the value
 *      itself but THROWS on circular references containing them. The custom
 *      replacer drops them inline so the surrounding object survives.
 *   2. **Detects circular references** with a WeakSet and emits a clear
 *      `[Pyreon] Loader returned circular reference at key "<path>"` error
 *      naming the offending key instead of `Converting circular structure
 *      to JSON` (which doesn't tell the user which loader is broken).
 *   3. **Escapes `</`** so embedding the JSON inside `<script>` can't break
 *      out of the script tag — already done at every call site but now
 *      centralised so all four callers (handler string-mode, handler stream-
 *      mode, SSG entry, dev SSR) get the escape uniformly.
 *
 * Returns the safely-escaped JSON string ready to drop into a `<script>`
 * tag's body. Throws (with the Pyreon-prefixed error) on circular refs so
 * the caller's existing try/catch wraps it correctly — silent serialization
 * failures were the pre-fix shape.
 *
 * @example
 * const json = stringifyLoaderData(serializeLoaderData(router))
 * const tag = `<script>window.__PYREON_LOADER_DATA__=${json}</script>`
 */
export function stringifyLoaderData(loaderData: Record<string, unknown>): string {
  // True cycle detection: track the ANCESTOR PATH only (add on descend,
  // remove on ascend), NOT every object ever visited. The prior
  // implementation kept an all-seen WeakSet that was never pruned, so any
  // object referenced more than once — a DAG, not a cycle — falsely threw
  // "circular reference" and 500'd the SSR response. Shared references are
  // extremely common in loader payloads (`{ author: user, lastEditor: user }`
  // where both are the same ORM instance; a list whose rows share a lookup
  // object). `JSON.stringify` serializes those fine; only a real cycle must
  // throw. A `JSON.stringify` replacer has no "leave" hook, so cycle
  // detection runs as a single recursive pre-pass that maintains the
  // ancestor set, then `JSON.stringify` does the (now cycle-free) encode.
  const ancestors = new Set<object>()
  const detectCycle = (value: unknown, path: string): void => {
    if (value === null || typeof value !== 'object') return
    // Respect `toJSON` so detection matches what JSON.stringify actually
    // serializes (Date/etc. become primitives — no cycle through them).
    const v =
      typeof (value as { toJSON?: unknown }).toJSON === 'function'
        ? (value as { toJSON: () => unknown }).toJSON()
        : value
    if (v === null || typeof v !== 'object') return
    const obj = v as object
    if (ancestors.has(obj)) {
      throw new Error(
        `[Pyreon] Loader returned circular reference at "${path || '<root>'}". ` +
          `Loaders must return JSON-serializable data (no cycles, no functions, no Date/Map/Set without a custom replacer). ` +
          `Common cause: returning a Mongo/Prisma model with back-references intact.`,
      )
    }
    ancestors.add(obj)
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) detectCycle(obj[i], `${path}[${i}]`)
    } else {
      for (const k of Object.keys(obj)) {
        const child = (obj as Record<string, unknown>)[k]
        // Mirror the encode-time drop: function/symbol values are not
        // serialized, so a cycle reachable only THROUGH one can't occur.
        if (typeof child === 'function' || typeof child === 'symbol') continue
        detectCycle(child, path ? `${path}.${k}` : k)
      }
    }
    ancestors.delete(obj) // ascend — siblings / shared refs are NOT cycles
  }
  detectCycle(loaderData, '')

  const replacer = (_key: string, value: unknown): unknown => {
    // Drop silently. JSON.stringify already drops these as VALUES, but an
    // explicit drop also handles array entries (where it'd convert to null
    // otherwise — undesirable for downstream typed hydration).
    if (typeof value === 'function' || typeof value === 'symbol') return undefined
    return value
  }
  return JSON.stringify(loaderData, replacer).replace(/<\//g, '<\\/')
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
