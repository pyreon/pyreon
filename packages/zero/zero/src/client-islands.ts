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
import { hydrateIslandsAuto, setServerIslandBase } from '@pyreon/server/client'
import type { IslandRootLoader, IslandsRegistry } from './client-marker'

/** zero's route base, a build-time constant (see vite-plugin.ts). */
declare const __ZERO_BASE__: string

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

  // The base comes first, before any island can render a server island
  // (`client-server-islands.ts` says why it is code, not the DOM). The
  // activation code loads only on a page that HAS a server island: every
  // other islands-only page shipped it for nothing (about 600 B gzip on
  // pyreon.dev, which has none).
  setServerIslandBase(typeof __ZERO_BASE__ !== 'undefined' ? __ZERO_BASE__ : '/')
  // pyreon-lint-disable-next-line pyreon/no-window-in-ssr, pyreon/no-dom-in-setup -- client-only: startIslandsOnlyPage runs this after it found a document
  if (document.querySelector('pyreon-server-island') !== null) {
    import('./client-server-islands').then(
      (m) => m.startServerIslands(),
      (err: unknown) => {
        // oxlint-disable-next-line no-console
        console.error('[Pyreon] Could not load the server-islands runtime for this page:', err)
      },
    )
  }
  if (!islands) return () => {}

  return hydrateIslandsAuto(
    islands,
    islandRoot
      ? { root: islandRoot as () => Promise<{ default: ComponentFn } | ComponentFn> }
      : undefined,
  )
}

