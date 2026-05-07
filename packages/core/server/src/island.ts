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

import type { ComponentFn, Props, VNode } from '@pyreon/core'
import { h } from '@pyreon/core'

// ─── Types ───────────────────────────────────────────────────────────────────

export type HydrationStrategy = 'load' | 'idle' | 'visible' | 'never' | `media(${string})`

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
  const { name, hydrate = 'load' } = options

  const IslandWrapper = async function IslandWrapper(props: P): Promise<VNode | null> {
    const mod = await loader()
    const Comp = typeof mod === 'function' ? mod : mod.default
    const serializedProps = serializeIslandProps(props, name)

    return h(
      'pyreon-island',
      {
        'data-component': name,
        'data-props': serializedProps,
        'data-hydrate': hydrate,
      },
      h(Comp, props),
    )
  }

  // Attach metadata so tooling (CLI project scanner, MCP, future codegen) can
  // detect islands without runtime introspection.
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
 * Serialize island props to JSON for embedding in `data-props`.
 *
 * **Prop contract** (what survives the SSR → client roundtrip):
 *
 * - ✅ JSON-native: strings, finite numbers, booleans, null, arrays, plain objects
 * - ❌ **Dropped silently**: `children`, functions, symbols, `undefined` (a warning
 *   fires in dev when `children` is dropped — it's the most common surprise)
 * - ❌ **Coerced**: `Date` becomes an ISO string (no auto-revival on the client),
 *   `Map` / `Set` / class instances lose their type
 * - ⚠️ **`BigInt` is unsupported**: `JSON.stringify` throws on `BigInt` values.
 *   We catch the throw, log in dev, and emit `{}` rather than 500ing the SSR.
 *   Convert to string yourself before passing as a prop.
 *
 * For anything more complex than JSON, pass an ID and have the island component
 * fetch / restore the rich value on the client.
 */
function serializeIslandProps(
  props: Record<string, unknown>,
  islandName: string,
): string {
  const clean: Record<string, unknown> = {}
  let droppedChildren = false
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children') {
      if (value !== undefined) droppedChildren = true
      continue
    }
    if (typeof value === 'function') continue
    if (typeof value === 'symbol') continue
    if (value === undefined) continue
    clean[key] = value
  }
  if (droppedChildren && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      `[Pyreon] island "${islandName}" was passed children, but island props ` +
        `do not support children — they were dropped. Render the children inside ` +
        `the island component itself.`,
    )
  }
  // The SSR renderer's renderProp() already applies escapeHtml() to attribute
  // values, so the JSON is safe to embed in HTML attributes without double-escaping.
  try {
    return JSON.stringify(clean)
  } catch (err) {
    // JSON.stringify throws on BigInt and on circular references. Don't 500
    // the SSR — emit empty props and warn so the dev sees it before users do.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error(
        `[Pyreon] island "${islandName}" props could not be serialized (likely ` +
          `BigInt or circular reference). Falling back to empty props. Original ` +
          `error: ${(err as Error).message}`,
      )
    }
    return '{}'
  }
}
