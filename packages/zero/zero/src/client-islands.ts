/**
 * The browser half of an islands-only page (#4371): the page is static HTML
 * plus its `<pyreon-island>` elements, so the client hydrates those and
 * starts nothing else (no router, no app tree, no route code).
 *
 * Loaded with a dynamic import by `startClient` / `startClientLazy`, only on
 * a marked page that has at least one island, so a page that starts the app
 * (or has no islands) never downloads it. Imports nothing from the app side.
 */
import type { ComponentFn } from '@pyreon/core'
import { hydrateIslandsAuto } from '@pyreon/server/client'
import type { IslandRootLoader, IslandsRegistry } from './client-marker'

/**
 * Hydrate the islands on an islands-only page. Returns a cleanup that ends
 * every island it scheduled (see `hydrateIslands`).
 */
export function startIslands(
  islands: IslandsRegistry,
  islandRoot: IslandRootLoader | undefined,
): () => void {
  // Shared @pyreon/store state the server rendered with: seeded before any
  // island mounts, exactly as the app path does (decoupled bridge set by
  // @pyreon/store on import; undefined when the app uses no stores).
  const hydrateStores = (
    globalThis as {
      __PYREON_HYDRATE_STORES__?: (d: Record<string, Record<string, unknown>>) => void
    }
  ).__PYREON_HYDRATE_STORES__
  const storeState = (globalThis as Record<string, unknown>).__PYREON_STORE_STATE__
  if (hydrateStores && storeState && typeof storeState === 'object') {
    hydrateStores(storeState as Record<string, Record<string, unknown>>)
  }

  return hydrateIslandsAuto(
    islands,
    islandRoot
      ? { root: islandRoot as () => Promise<{ default: ComponentFn } | ComponentFn> }
      : undefined,
  )
}
