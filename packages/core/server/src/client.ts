/**
 * Client-side entry helpers for Pyreon SSR/SSG apps.
 *
 * ## Full app hydration
 *
 * ```ts
 * // entry-client.ts
 * import { startClient } from "@pyreon/server/client"
 * import { App } from "./App"
 * import { routes } from "./routes"
 *
 * startClient({ App, routes })
 * ```
 *
 * ## Island hydration (partial)
 *
 * ```ts
 * // entry-client.ts
 * import { hydrateIslands } from "@pyreon/server/client"
 *
 * hydrateIslands({
 *   Counter: () => import("./Counter"),
 *   Search:  () => import("./Search"),
 * })
 * ```
 */

import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { createRouter, hydrateLoaderData, type RouteRecord, RouterProvider } from '@pyreon/router'
import { hydrateRoot, mount } from '@pyreon/runtime-dom'
import type { HydrationStrategy, PrefetchStrategy } from './island'

// ─── Full app hydration ──────────────────────────────────────────────────────

export interface StartClientOptions {
  /** Root application component */
  App: ComponentFn
  /** Route definitions (same as server) */
  routes: RouteRecord[]
  /** CSS selector or element for the app container (default: "#app") */
  container?: string | Element
}

/**
 * Hydrate a server-rendered Pyreon app on the client.
 *
 * Handles:
 *   - Router creation (history mode)
 *   - Loader data hydration from `window.__PYREON_LOADER_DATA__`
 *   - Hydration if container has SSR content, fresh mount otherwise
 *
 * Returns a cleanup function that unmounts the app.
 */
export function startClient(options: StartClientOptions): () => void {
  if (typeof document === 'undefined') {
    throw new Error('[Pyreon] startClient() can only be called in the browser.')
  }
  const { App, routes, container = '#app' } = options

  const el = typeof container === 'string' ? document.querySelector(container) : container

  if (!el) {
    throw new Error(`[Pyreon] Container "${container}" not found`)
  }

  // Create client-side router (history mode to match SSR)
  const router = createRouter({ routes, mode: 'history' })

  // Hydrate loader data from SSR (avoids re-fetching on initial render)
  const loaderData = (window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__
  if (loaderData && typeof loaderData === 'object') {
    hydrateLoaderData(router as never, loaderData as Record<string, unknown>)
  }

  // Build app tree
  const app = h(RouterProvider, { router }, h(App, null))

  // Hydrate if container has SSR content, mount fresh otherwise
  if (el.childNodes.length > 0) {
    return hydrateRoot(el, app)
  }
  return mount(app, el as HTMLElement)
}

// ─── Island hydration ────────────────────────────────────────────────────────

type IslandLoader = () => Promise<{ default: ComponentFn } | ComponentFn>

/**
 * Hydrate all `<pyreon-island>` elements on the page.
 *
 * Only loads JavaScript for components that are actually present in the HTML.
 * Respects hydration strategies (load, idle, visible, media, never). Returns
 * a cleanup function that disconnects any pending observers/listeners.
 *
 * **`hydrate: 'never'` islands do NOT require a registry entry** — the whole
 * point of the strategy is shipping zero client JS, so importing the loader
 * (which would pull the component into the client bundle graph) defeats it.
 * Such islands are silently skipped here without a `data-island-error` flag.
 *
 * @example
 * hydrateIslands({
 *   Counter: () => import("./Counter"),
 *   Search:  () => import("./Search"),
 *   // No entry for `StaticBadge` even though it appears as a never-island
 *   // in the HTML — registering one would defeat the strategy.
 * })
 */
export function hydrateIslands(registry: Record<string, IslandLoader>): () => void {
  if (typeof document === 'undefined') return () => {}
  const islands = document.querySelectorAll('pyreon-island')
  const cleanups: (() => void)[] = []

  for (const el of islands) {
    const componentId = el.getAttribute('data-component')
    if (!componentId) continue

    // Detect nested islands. An island whose ancestor (up the DOM tree) is
    // also a `<pyreon-island>` would, on hydration, be torn out and replaced
    // when the outer island hydrates — losing its hydrate strategy entirely.
    // Mark it as errored, log, and skip rather than silently break.
    if (el.parentElement?.closest('pyreon-island')) {
      console.error(
        `[Pyreon] island "${componentId}" is nested inside another <pyreon-island>. ` +
          `Nested islands are not supported — the outer island's hydrateRoot replaces ` +
          `the inner element before its loader runs. Move the inner island out of the ` +
          `outer island's tree, or fold them into a single component.`,
      )
      el.setAttribute('data-island-error', 'nested')
      continue
    }

    const strategy = (el.getAttribute('data-hydrate') ?? 'load') as HydrationStrategy

    // `hydrate: 'never'` deliberately ships zero client JS for the island —
    // no loader is registered because the loader's whole purpose is to be
    // imported. Skip the missing-loader warning for never-strategy islands;
    // any other strategy without a loader IS a real misconfiguration.
    if (strategy === 'never') continue

    const loader = registry[componentId]
    if (!loader) {
      console.warn(`No loader registered for island "${componentId}"`)
      el.setAttribute('data-island-error', 'no-loader')
      continue
    }

    const propsJson = el.getAttribute('data-props') ?? '{}'

    // Prefetch (if requested) primes the module cache before the hydration
    // trigger fires. Independent of hydration scheduling — the same loader
    // promise is reused, so a `visible` island with `prefetch: 'idle'` will
    // hit a warm cache when the IntersectionObserver finally fires.
    const prefetch = (el.getAttribute('data-prefetch') ?? 'none') as PrefetchStrategy
    const prefetchCleanup = schedulePrefetch(el as HTMLElement, loader, prefetch)
    if (prefetchCleanup) cleanups.push(prefetchCleanup)

    const cleanup = scheduleHydration(el as HTMLElement, loader, propsJson, strategy)
    if (cleanup) cleanups.push(cleanup)
  }

  return () => {
    for (const fn of cleanups) fn()
  }
}

function schedulePrefetch(
  el: HTMLElement,
  loader: IslandLoader,
  prefetch: PrefetchStrategy,
): (() => void) | null {
  if (prefetch === 'none') return null
  if (typeof window === 'undefined') return null
  let cancelled = false
  // Fire and forget — we don't await; the dynamic import warms the module
  // cache and the hydration path will await its OWN loader() call (which
  // resolves to the same module via JS's import-promise dedup).
  const prime = () => {
    if (cancelled) return
    loader().catch(() => {
      // Silent — hydration will surface the failure with its own error path.
      // Prefetch is a hint, not a contract.
    })
  }

  if (prefetch === 'idle') {
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(prime)
      return () => {
        cancelled = true
        cancelIdleCallback(id)
      }
    }
    const id = setTimeout(prime, 200)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }

  // 'visible' — fetch ~200px before the island enters the viewport
  if (!('IntersectionObserver' in window)) {
    prime()
    return null
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect()
          prime()
          return
        }
      }
    },
    { rootMargin: '200px' },
  )
  observer.observe(el)
  return () => {
    cancelled = true
    observer.disconnect()
  }
}

/**
 * Auto-discovered island registry shape — emitted by `@pyreon/vite-plugin`
 * as `virtual:pyreon/islands-registry`. The user passes the imported module
 * to `hydrateIslandsAuto()`.
 */
export interface AutoIslandRegistry {
  readonly __pyreonIslandRegistry: Record<string, IslandLoader>
  readonly __pyreonIslandsEnabled: boolean
}

/**
 * Hydrate all `<pyreon-island>` elements using a registry auto-generated by
 * `@pyreon/vite-plugin` (`pyreon({ islands: true })` is the default).
 *
 * Eliminates the manual sync between `island()` declarations in source and
 * the client-side `hydrateIslands({ ... })` call — typo / forgotten entry /
 * registry drift is the #1 author foot-gun for islands.
 *
 * The auto-registry omits `hydrate: 'never'` islands by design; their
 * components stay out of the client bundle entirely. Other strategies
 * resolve via the same dynamic-import paths their `island()` declaration
 * specified.
 *
 * The user passes the virtual-module result. We don't import it inside
 * `@pyreon/server/client` because Rolldown's static-import analysis runs
 * before plugin resolveId hooks for workspace sources, and would fail to
 * resolve the virtual specifier. Importing in the user's entry-client (where
 * the plugin's resolveId fires natively) is the clean shape.
 *
 * @example
 * // src/entry-client.ts
 * import { hydrateIslandsAuto } from '@pyreon/server/client'
 * import * as registry from 'virtual:pyreon/islands-registry'
 * hydrateIslandsAuto(registry)
 */
export function hydrateIslandsAuto(registry: AutoIslandRegistry): () => void {
  if (typeof document === 'undefined') return () => {}
  if (!registry.__pyreonIslandsEnabled) {
    throw new Error(
      `[Pyreon] hydrateIslandsAuto() requires \`pyreon({ islands: true })\` ` +
        `in vite.config.ts (the default). The plugin emitted a stub registry ` +
        `because islands support was explicitly disabled. Either re-enable ` +
        `islands in the plugin, or use the manual hydrateIslands({ ... }) form.`,
    )
  }
  return hydrateIslands(registry.__pyreonIslandRegistry)
}

function scheduleHydration(
  el: HTMLElement,
  loader: IslandLoader,
  propsJson: string,
  strategy: HydrationStrategy,
): (() => void) | null {
  if (typeof window === 'undefined') return null
  let cancelled = false
  const hydrate = () => {
    if (!cancelled) hydrateIsland(el, loader, propsJson)
  }

  switch (strategy) {
    case 'load':
      hydrate()
      return null

    case 'idle': {
      if ('requestIdleCallback' in window) {
        const id = requestIdleCallback(hydrate)
        return () => {
          cancelled = true
          cancelIdleCallback(id)
        }
      }
      const id = setTimeout(hydrate, 200)
      return () => {
        cancelled = true
        clearTimeout(id)
      }
    }

    case 'visible':
      return observeVisibility(el, hydrate)

    case 'never':
      return null

    default:
      // media(query)
      if (strategy.startsWith('media(')) {
        const query = strategy.slice(6, -1)
        const mql = window.matchMedia(query)
        if (mql.matches) {
          hydrate()
          return null
        }
        const onChange = (e: MediaQueryListEvent) => {
          if (e.matches) {
            mql.removeEventListener('change', onChange)
            hydrate()
          }
        }
        mql.addEventListener('change', onChange)
        return () => {
          cancelled = true
          mql.removeEventListener('change', onChange)
        }
      }
      hydrate()
      return null
  }
}

async function hydrateIsland(
  el: HTMLElement,
  loader: IslandLoader,
  propsJson: string,
): Promise<void> {
  const name = el.getAttribute('data-component') ?? 'unknown'
  try {
    let props: Record<string, unknown>
    try {
      props = JSON.parse(propsJson)
      if (typeof props !== 'object' || props === null || Array.isArray(props)) {
        throw new TypeError('Expected object')
      }
    } catch (parseErr) {
      console.error(`Invalid island props JSON for "${name}"`, parseErr)
      el.setAttribute('data-island-error', 'invalid-props')
      return
    }

    const mod = await loader()
    const Comp = typeof mod === 'function' ? mod : mod.default
    hydrateRoot(el, h(Comp, props))
  } catch (err) {
    console.error(`Failed to hydrate island "${name}"`, err)
    el.setAttribute('data-island-error', 'hydration-failed')
  }
}

function observeVisibility(el: HTMLElement, callback: () => void): (() => void) | null {
  if (typeof window === 'undefined') return null
  if (!('IntersectionObserver' in window)) {
    callback()
    return null
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect()
          callback()
          return
        }
      }
    },
    { rootMargin: '200px' },
  )

  observer.observe(el)
  return () => observer.disconnect()
}
