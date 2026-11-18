/**
 * `startClientLazy` — the client entry for an app with islands-only routes
 * (#4371). Same dispatch as `startClient`, with the app behind a dynamic
 * import: an islands-only page downloads the entry and its islands, never
 * the router, the routes module or the route's code.
 *
 * Its own subpath (`@pyreon/zero/client-lazy`), never re-exported from
 * `@pyreon/zero/client`: an entry that imported it from there would pull
 * `startClient`'s static imports (the router, the app) into the entry chunk,
 * and keeping them out is the whole point.
 */
import type { ComponentFn } from '@pyreon/core'
import { isServer } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { type IslandsOnlyOptions, isIslandsOnlyPage, startIslandsOnlyPage } from './client-marker'

export type { IslandRootLoader, IslandsOnlyOptions, IslandsRegistry } from './client-marker'

export interface StartClientLazyOptions extends IslandsOnlyOptions {
  /**
   * Loads the route definitions, called only on a page that starts the app:
   * `routes: () => import('virtual:zero/routes')`.
   */
  routes: () => Promise<{ routes: RouteRecord[] }>
  /** Root layout component. */
  layout?: ComponentFn
}

/**
 * Start the client. On an islands-only page (the server marked it), hydrate
 * its islands and nothing else; on any other page, load the routes and the
 * app, then hydrate or mount exactly as `startClient` does.
 *
 * Returns a cleanup. On an app page the app starts once its code has loaded;
 * a cleanup called before that cancels the start.
 *
 * @example
 * // src/entry-client.ts
 * import { startClientLazy } from '@pyreon/zero/client-lazy'
 * import * as islands from 'virtual:pyreon/islands-registry'
 *
 * startClientLazy({ routes: () => import('virtual:zero/routes'), islands })
 */
export function startClientLazy(options: StartClientLazyOptions): () => void {
  if (isServer) {
    throw new Error('[Pyreon] startClientLazy() can only be called in the browser.')
  }
  if (isIslandsOnlyPage()) return startIslandsOnlyPage(options)

  let disposed = false
  let stop: (() => void) | null = null
  Promise.all([import('./client'), options.routes()]).then(
    ([client, mod]) => {
      if (disposed) return
      stop = client.startClient({
        routes: mod.routes,
        ...(options.layout ? { layout: options.layout } : {}),
        ...(options.islands ? { islands: options.islands } : {}),
        ...(options.islandRoot ? { islandRoot: options.islandRoot } : {}),
      })
    },
    (err: unknown) => {
      // oxlint-disable-next-line no-console
      console.error('[Pyreon] Could not load the app for this page:', err)
    },
  )

  return () => {
    disposed = true
    stop?.()
  }
}
