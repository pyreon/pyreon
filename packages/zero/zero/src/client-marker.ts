/**
 * The part of the islands-only dispatch (#4371) that runs before anything is
 * loaded: is this page islands-only, and can its islands hydrate. Imported
 * statically by both client entries, so it imports nothing. Not even
 * `isServer`: with it, the bundler moved @pyreon/core's environment module
 * into a chunk of its own that every page then requested (measured on the
 * `fixture-islands-only` build, caught by `e2e/zero-islands-only.spec.ts`).
 */
import type { ComponentFn } from '@pyreon/core'
import type { AutoIslandRegistry } from '@pyreon/server/client'

/**
 * The module `@pyreon/vite-plugin` generates as `virtual:pyreon/islands-registry`:
 * `@pyreon/server`'s `AutoIslandRegistry`, which `hydrateIslandsAuto` reads.
 * A type-only import, so this module still imports nothing at runtime.
 */
export type IslandsRegistry = AutoIslandRegistry

/**
 * Loads the component that wraps every standalone island: the providers an
 * island needs when no app is around it (a theme, a UI system's root scope).
 * It must render only its children.
 */
export type IslandRootLoader = () => Promise<{ default: ComponentFn } | ComponentFn>

/** Options both client entries take for islands-only pages. */
export interface IslandsOnlyOptions {
  /**
   * The islands registry, for pages that declare `export const hydrate =
   * 'islands'`: `import * as islands from 'virtual:pyreon/islands-registry'`.
   * Without it an islands-only page hydrates nothing (and says so).
   */
  islands?: IslandsRegistry | undefined
  /**
   * Wraps every island on an islands-only page, loaded with the first island
   * that hydrates: `islandRoot: () => import('./IslandRoot')`. Render only
   * the children, inside your providers, so the island still adopts its
   * server HTML.
   */
  islandRoot?: IslandRootLoader | undefined
}

/**
 * Mirrors `ISLANDS_ONLY_MARKER` in `@pyreon/server` (render-page.ts), which
 * the server writes into the page. Not imported from there: `@pyreon/server`'s
 * main entry is server-only. `client-marker.test.ts` keeps the two in step.
 */
export const ISLANDS_ONLY_SELECTOR = 'meta[name="pyreon-hydrate"][content="islands"]'

/**
 * The dev server's custom HMR event for "a module the server rendered with
 * changed" (`ISLANDS_ONLY_SSR_UPDATE_EVENT` in vite-plugin.ts).
 */
export const SSR_UPDATE_EVENT = 'pyreon:ssr-update'

/** The part of Vite's `import.meta.hot` this module uses. */
interface HotContext {
  on(event: string, cb: (data: unknown) => void): void
}

/**
 * Dev only: an islands-only page is server HTML, and the browser never loads
 * the route's code, so there is nothing to hot-swap when the route, its layout
 * or a component it renders changes. Reload to get the new server HTML.
 * `import.meta.hot` is undefined in a production build, so this compiles out.
 */
function watchServerModules(): void {
  // Through `unknown`: this source is typechecked under whatever `ImportMeta`
  // the consuming program declares (Vite's, Bun's, or none), and Bun's `hot`
  // does not overlap this shape. The cast erases to `import.meta.hot`, which is
  // the exact text Vite replaces.
  const hot = (import.meta as unknown as { hot?: HotContext }).hot
  // pyreon-lint-disable-next-line pyreon/no-window-in-ssr -- an HMR callback: only the dev server's browser client ever calls it
  if (hot) hot.on(SSR_UPDATE_EVENT, () => location.reload())
}

/** True when the server marked this page islands-only. */
export function isIslandsOnlyPage(): boolean {
  // pyreon-lint-disable-next-line pyreon/prefer-isserver -- importing isServer costs every page a request (see the module comment)
  if (typeof document === 'undefined') return false
  return document.querySelector(ISLANDS_ONLY_SELECTOR) !== null
}

/**
 * Start an islands-only page: hydrate its islands, start nothing else. A page
 * with no islands loads nothing at all. Returns the cleanup.
 */
export function startIslandsOnlyPage(options: IslandsOnlyOptions): () => void {
  // pyreon-lint-disable-next-line pyreon/prefer-isserver -- importing isServer costs every page a request (see the module comment)
  if (typeof document === 'undefined') return () => {}
  watchServerModules()
  if (document.querySelector('pyreon-island') === null) return () => {}
  const islands = options.islands
  if (!islands) {
    // A wiring mistake every islands-only page shows in dev; its text stays
    // out of the production entry, which every page downloads.
    if (process.env.NODE_ENV !== 'production') {
      // oxlint-disable-next-line no-console
      console.error(
        "[Pyreon] This page is islands-only (`export const hydrate = 'islands'`), but the client was started " +
          'without an islands registry, so none of its islands hydrate. Pass it in the client entry:\n' +
          "  import * as islands from 'virtual:pyreon/islands-registry'\n" +
          "  startClientLazy({ routes: () => import('virtual:zero/routes'), islands })",
      )
    }

    return () => {}
  }
  let disposed = false
  let stop: (() => void) | null = null
  import('./client-islands').then(
    (m) => {
      if (!disposed) stop = m.startIslands(islands, options.islandRoot)
    },
    (err: unknown) => {
      // oxlint-disable-next-line no-console
      console.error('[Pyreon] Could not load the islands runtime for this page:', err)
    },
  )

  return () => {
    disposed = true
    stop?.()
  }
}
