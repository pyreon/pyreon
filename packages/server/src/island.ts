/**
 * Island architecture — partial hydration for content-heavy sites.
 *
 * Islands are interactive components embedded in otherwise-static HTML.
 * Only island components ship JavaScript to the client — the rest of the
 * page stays as zero-JS server-rendered HTML.
 *
 * ## Server side
 *
 * `island()` wraps an async component import and returns a ComponentFn.
 * During SSR, it renders the component output inside a `<pyreon-island>` element
 * with serialized props, so the client knows what to hydrate.
 *
 * ```tsx
 * import { island } from "@pyreon/server"
 *
 * const Counter = island(() => import("./Counter"), { name: "Counter" })
 * const Search  = island(() => import("./Search"),  { name: "Search" })
 *
 * function Page() {
 *   return <div>
 *     <h1>Static heading (no JS)</h1>
 *     <Counter initial={5} />   // hydrated on client
 *     <p>Static paragraph</p>
 *     <Search />                // hydrated on client
 *   </div>
 * }
 * ```
 *
 * ## Client side
 *
 * Use `hydrateIslands()` from `@pyreon/server/client` to hydrate all islands
 * on the page. Only the island components' JavaScript is loaded.
 *
 * ```ts
 * // entry-client.ts (island mode)
 * import { hydrateIslands } from "@pyreon/server/client"
 *
 * hydrateIslands({
 *   Counter: () => import("./Counter"),
 *   Search:  () => import("./Search"),
 * })
 * ```
 *
 * ## Hydration strategies
 *
 * Control when an island hydrates via the `hydrate` option:
 *   - "load" (default) — hydrate immediately on page load
 *   - "idle"           — hydrate when the browser is idle (requestIdleCallback)
 *   - "visible"        — hydrate when the island scrolls into the viewport
 *   - "media(query)"   — hydrate when a media query matches
 *   - "never"          — never hydrate (render-only, no client JS)
 */

import type { ComponentFn, Props, VNode } from "@pyreon/core"
import { h } from "@pyreon/core"

// ─── Types ───────────────────────────────────────────────────────────────────

export type HydrationStrategy = "load" | "idle" | "visible" | "never" | `media(${string})`

export interface IslandOptions {
  /** Unique name — must match the key in the client-side hydrateIslands() registry */
  name: string
  /** When to hydrate on the client (default: "load") */
  hydrate?: HydrationStrategy
}

export interface IslandMeta {
  readonly __island: true
  readonly name: string
  readonly hydrate: HydrationStrategy
}

// ─── Server-side island factory ──────────────────────────────────────────────

/**
 * Create an island component.
 *
 * Returns an async ComponentFn that:
 *   1. Resolves the dynamic import
 *   2. Renders the component to VNodes
 *   3. Wraps the output in `<pyreon-island>` with serialized props + hydration strategy
 */
export function island<P extends Props = Props>(
  loader: () => Promise<{ default: ComponentFn<P> } | ComponentFn<P>>,
  options: IslandOptions,
): ComponentFn<P> & IslandMeta {
  const { name, hydrate = "load" } = options

  const IslandWrapper = async function IslandWrapper(props: P): Promise<VNode | null> {
    const mod = await loader()
    const Comp = typeof mod === "function" ? mod : mod.default
    const serializedProps = serializeIslandProps(props)

    return h(
      "pyreon-island",
      {
        "data-component": name,
        "data-props": serializedProps,
        "data-hydrate": hydrate,
      },
      h(Comp, props),
    )
  }

  // Attach metadata so the Vite plugin can detect islands for code-splitting
  const wrapper = IslandWrapper as unknown as ComponentFn<P> & IslandMeta
  Object.defineProperties(wrapper, {
    __island: { value: true, enumerable: true },
    name: { value: name, enumerable: true, writable: false, configurable: true },
    hydrate: { value: hydrate, enumerable: true },
  })

  return wrapper
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Serialize component props to a JSON string for embedding in HTML attributes.
 * Strips non-serializable values (functions, symbols, children).
 */
function serializeIslandProps(props: Record<string, unknown>): string {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    // Skip non-serializable or internal props
    if (key === "children") continue
    if (typeof value === "function") continue
    if (typeof value === "symbol") continue
    if (value === undefined) continue
    clean[key] = value
  }
  // The SSR renderer's renderProp() already applies escapeHtml() to attribute
  // values, so the JSON is safe to embed in HTML attributes without double-escaping.
  return JSON.stringify(clean)
}
