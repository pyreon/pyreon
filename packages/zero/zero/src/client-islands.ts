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
import { activateServerIslandElement, hydrateIslandsAuto } from '@pyreon/server/client'
import type { IslandRootLoader, IslandsRegistry } from './client-marker'

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

  activateTopLevelServerIslands()
  if (!islands) return () => {}

  return hydrateIslandsAuto(
    islands,
    islandRoot
      ? { root: islandRoot as () => Promise<{ default: ComponentFn } | ComponentFn> }
      : undefined,
  )
}

/**
 * Activate the server islands that sit OUTSIDE every client island. Nothing
 * else would: no router or app mounts on an islands-only page, and a marker's
 * self-activation runs only when a component mounts it. Each fetches under
 * the base the server stamped on it (`data-base`). A marker INSIDE a client
 * island is left to that island: it activates itself when the island
 * hydrates, and swapping its fragment in first would change the DOM the
 * island hydrates against.
 */
function activateTopLevelServerIslands(): void {
  // pyreon-lint-disable-next-line pyreon/no-window-in-ssr, pyreon/no-dom-in-setup -- client-only: startIslands runs only after startIslandsOnlyPage found a document
  const markers = document.querySelectorAll<HTMLElement>('pyreon-server-island[data-name]:not([data-pyreon-si])')
  for (const el of markers) {
    if (el.closest('pyreon-island') === null) activateServerIslandElement(el)
  }
}
