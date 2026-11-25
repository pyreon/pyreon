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
import { startServerIslands } from './client-server-islands'
import type { IslandRootLoader, IslandsRegistry } from './client-marker'
import { isPlainRecord } from './plain-record'

/**
 * Hydrate the islands on an islands-only page. Returns a cleanup that ends
 * every island it scheduled (see `hydrateIslands`).
 */
export function startIslands(
  islands: IslandsRegistry | undefined,
  islandRoot: IslandRootLoader | undefined,
): () => void {
  // Shared @pyreon/store state the server rendered with: seeded before any
  // island mounts, exactly as the app path does (decoupled bridge set by
  // @pyreon/store on import; undefined when the app uses no stores). `typeof`
  // and a plain record, not truthiness: without @pyreon/store, markup with
  // that `id` makes the bridge an element (named access on Window), and the
  // same goes for the state.
  const hydrateStores = (globalThis as { __PYREON_HYDRATE_STORES__?: unknown }).__PYREON_HYDRATE_STORES__
  const storeState = (globalThis as Record<string, unknown>).__PYREON_STORE_STATE__
  if (typeof hydrateStores === 'function' && isPlainRecord(storeState)) hydrateStores(storeState)

  startServerIslands()
  if (!islands) return () => {}

  return hydrateIslandsAuto(
    islands,
    islandRoot
      ? { root: islandRoot as () => Promise<{ default: ComponentFn } | ComponentFn> }
      : undefined,
  )
}

