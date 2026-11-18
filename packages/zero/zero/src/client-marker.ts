/**
 * The part of the islands-only dispatch (#4371) that runs before anything is
 * loaded: is this page islands-only, and can its islands hydrate. Imported
 * statically by both client entries, so it imports nothing. Not even
 * `isServer`: with it, the bundler moved @pyreon/core's environment module
 * into a chunk of its own that every page then requested (measured on the
 * `fixture-islands-only` build, caught by `e2e/zero-islands-only.spec.ts`).
 */
import type { ComponentFn } from '@pyreon/core'

/** The module `@pyreon/vite-plugin` generates as `virtual:pyreon/islands-registry`. */
export interface IslandsRegistry {
  readonly __pyreonIslandRegistry: Record<
    string,
    () => Promise<{ default: ComponentFn } | ComponentFn>
  >
  readonly __pyreonIslandsEnabled: boolean
}

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
  if (document.querySelector('pyreon-island') === null) return () => {}
  const islands = options.islands
  if (!islands) {
    // oxlint-disable-next-line no-console
    console.error(
      "[Pyreon] This page is islands-only (`export const hydrate = 'islands'`), but the client was started " +
        'without an islands registry, so none of its islands hydrate. Pass it in the client entry:\n' +
        "  import * as islands from 'virtual:pyreon/islands-registry'\n" +
        "  startClientLazy({ routes: () => import('virtual:zero/routes'), islands })",
    )

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
