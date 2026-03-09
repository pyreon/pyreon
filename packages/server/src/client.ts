/**
 * Client-side entry helpers for Nova SSR/SSG apps.
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
import { mount, hydrateRoot } from "@pyreon/runtime-dom"
import {
  createRouter,
  RouterProvider,
  hydrateLoaderData,
  type RouteRecord,
} from "@pyreon/router"
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
 * Hydrate a server-rendered Nova app on the client.
 *
 * Handles:
 *   - Router creation (history mode)
 *   - Loader data hydration from `window.__NOVA_LOADER_DATA__`
 *   - Hydration if container has SSR content, fresh mount otherwise
 *
 * Returns a cleanup function that unmounts the app.
 */
export function startClient(options: StartClientOptions): () => void {
  const { App, routes, container = "#app" } = options

  const el = typeof container === "string"
    ? document.querySelector(container)
    : container

  if (!el) {
    throw new Error(`[nova/client] Container "${container}" not found`)
  }

  // Create client-side router (history mode to match SSR)
  const router = createRouter({ routes, mode: "history" })

  // Hydrate loader data from SSR (avoids re-fetching on initial render)
  const loaderData = (window as unknown as Record<string, unknown>).__NOVA_LOADER_DATA__
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
 * Hydrate all `<nova-island>` elements on the page.
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
export function hydrateIslands(registry: Record<string, IslandLoader>): void {
  const islands = document.querySelectorAll("nova-island")

  for (const el of islands) {
    const componentId = el.getAttribute("data-component")
    if (!componentId) continue

    const loader = registry[componentId]
    if (!loader) {
      console.warn(`[nova/client] No loader registered for island "${componentId}"`)
      continue
    }

    const strategy = (el.getAttribute("data-hydrate") ?? "load") as HydrationStrategy
    const propsJson = el.getAttribute("data-props") ?? "{}"

    scheduleHydration(el as HTMLElement, loader, propsJson, strategy)
  }
}

function scheduleHydration(
  el: HTMLElement,
  loader: IslandLoader,
  propsJson: string,
  strategy: HydrationStrategy,
): void {
  const hydrate = () => hydrateIsland(el, loader, propsJson)

  switch (strategy) {
    case "load":
      hydrate()
      break

    case "idle":
      if ("requestIdleCallback" in window) {
        requestIdleCallback(hydrate)
      } else {
        setTimeout(hydrate, 200)
      }
      break

    case "visible":
      observeVisibility(el, hydrate)
      break

    case "never":
      // Skip — server-rendered HTML stays static
      break

    default:
      // media(query)
      if (strategy.startsWith("media(")) {
        const query = strategy.slice(6, -1)
        const mql = window.matchMedia(query)
        if (mql.matches) {
          hydrate()
        } else {
          mql.addEventListener("change", function onChange(e) {
            if (e.matches) {
              mql.removeEventListener("change", onChange)
              hydrate()
            }
          })
        }
      } else {
        hydrate()
      }
  }
}

async function hydrateIsland(
  el: HTMLElement,
  loader: IslandLoader,
  propsJson: string,
): Promise<void> {
  try {
    const mod = await loader()
    const Comp = typeof mod === "function" ? mod : mod.default
    const props = JSON.parse(propsJson)
    hydrateRoot(el, h(Comp, props))
  } catch (err) {
    console.error(`[nova/client] Failed to hydrate island:`, err)
  }
}

function observeVisibility(el: HTMLElement, callback: () => void): void {
  if (!("IntersectionObserver" in window)) {
    // Fallback: hydrate immediately
    callback()
    return
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
    { rootMargin: "200px" }, // hydrate slightly before visible
  )

  observer.observe(el)
}
