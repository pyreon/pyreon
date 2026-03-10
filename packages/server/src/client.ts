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

import { h } from "@pyreon/core"
import type { ComponentFn } from "@pyreon/core"
import { type RouteRecord, RouterProvider, createRouter, hydrateLoaderData } from "@pyreon/router"
import { hydrateRoot, mount } from "@pyreon/runtime-dom"
import type { HydrationStrategy } from "./island"

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
  const { App, routes, container = "#app" } = options

  const el = typeof container === "string" ? document.querySelector(container) : container

  if (!el) {
    throw new Error(`[pyreon/client] Container "${container}" not found`)
  }

  // Create client-side router (history mode to match SSR)
  const router = createRouter({ routes, mode: "history" })

  // Hydrate loader data from SSR (avoids re-fetching on initial render)
  const loaderData = (window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__
  if (loaderData && typeof loaderData === "object") {
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
 * Respects hydration strategies (load, idle, visible, media, never).
 *
 * @example
 * hydrateIslands({
 *   Counter: () => import("./Counter"),
 *   Search:  () => import("./Search"),
 * })
 */
/**
 * Hydrate all `<pyreon-island>` elements on the page.
 * Returns a cleanup function that disconnects any pending observers/listeners.
 */
export function hydrateIslands(registry: Record<string, IslandLoader>): () => void {
  const islands = document.querySelectorAll("pyreon-island")
  const cleanups: (() => void)[] = []

  for (const el of islands) {
    const componentId = el.getAttribute("data-component")
    if (!componentId) continue

    const loader = registry[componentId]
    if (!loader) {
      console.warn(`[pyreon/client] No loader registered for island "${componentId}"`)
      continue
    }

    const strategy = (el.getAttribute("data-hydrate") ?? "load") as HydrationStrategy
    const propsJson = el.getAttribute("data-props") ?? "{}"

    const cleanup = scheduleHydration(el as HTMLElement, loader, propsJson, strategy)
    if (cleanup) cleanups.push(cleanup)
  }

  return () => {
    for (const fn of cleanups) fn()
  }
}

function scheduleHydration(
  el: HTMLElement,
  loader: IslandLoader,
  propsJson: string,
  strategy: HydrationStrategy,
): (() => void) | null {
  let cancelled = false
  const hydrate = () => {
    if (!cancelled) hydrateIsland(el, loader, propsJson)
  }

  switch (strategy) {
    case "load":
      hydrate()
      return null

    case "idle": {
      if ("requestIdleCallback" in window) {
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

    case "visible":
      return observeVisibility(el, hydrate)

    case "never":
      return null

    default:
      // media(query)
      if (strategy.startsWith("media(")) {
        const query = strategy.slice(6, -1)
        const mql = window.matchMedia(query)
        if (mql.matches) {
          hydrate()
          return null
        }
        const onChange = (e: MediaQueryListEvent) => {
          if (e.matches) {
            mql.removeEventListener("change", onChange)
            hydrate()
          }
        }
        mql.addEventListener("change", onChange)
        return () => {
          cancelled = true
          mql.removeEventListener("change", onChange)
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
  try {
    let props: Record<string, unknown>
    try {
      props = JSON.parse(propsJson)
      if (typeof props !== "object" || props === null || Array.isArray(props)) {
        throw new TypeError("Expected object")
      }
    } catch (parseErr) {
      console.error("[pyreon/client] Invalid island props JSON:", parseErr)
      return
    }

    const mod = await loader()
    const Comp = typeof mod === "function" ? mod : mod.default
    hydrateRoot(el, h(Comp, props))
  } catch (err) {
    console.error(
      `[pyreon/client] Failed to hydrate island "${el.getAttribute("data-component") ?? "unknown"}":`,
      err,
    )
  }
}

function observeVisibility(el: HTMLElement, callback: () => void): (() => void) | null {
  if (!("IntersectionObserver" in window)) {
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
    { rootMargin: "200px" },
  )

  observer.observe(el)
  return () => observer.disconnect()
}
