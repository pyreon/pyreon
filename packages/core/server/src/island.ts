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
 *   - "load" (default)         — hydrate immediately on page load
 *   - "idle"                   — hydrate when the browser is idle (requestIdleCallback)
 *   - "visible"                — hydrate when the island scrolls into the viewport
 *   - "interaction"            — hydrate on first user interaction (focus/click/pointerenter/touchstart)
 *   - "interaction(<events>)"  — hydrate on first matching event (e.g. "interaction(focus)" or "interaction(click,touchstart)")
 *   - "media(query)"           — hydrate when a media query matches
 *   - "never"                  — never hydrate (render-only, no client JS)
 *
 * Use `interaction` for components that are interactive but not visible on
 * load — modals, dropdowns, command palettes. The component stays as a
 * non-hydrated DOM region until the user reaches for it (clicks the trigger,
 * tabs through the page, hovers, taps).
 *
 * ## Prefetch hint
 *
 * Pair a deferred-hydration strategy (`visible` / `interaction` / `media(...)`)
 * with a `prefetch` hint to start fetching the island's chunk BEFORE it's needed
 * for hydration — the chunk is warm in the module cache by the time the
 * hydration trigger fires, so hydration is instant instead of blank-while-fetching.
 *
 *   - "none" (default) — no prefetch
 *   - "idle"           — call loader() during browser idle time (requestIdleCallback)
 *   - "visible"        — call loader() ~200px before the island scrolls into view
 *
 * Pair `hydrate: 'visible'` with `prefetch: 'idle'` for the canonical "fetch
 * during idle, hydrate on scroll-in" pattern. Prefetch is a no-op (silently
 * skipped) for `hydrate: 'load'` (loader runs synchronously already) and
 * `hydrate: 'never'` (defeats the zero-JS strategy).
 */

import type { ComponentFn, Props, VNode } from '@pyreon/core'
import { h, onMount } from '@pyreon/core'
import { encodeIslandProps } from './island-codec'

// ─── Types ───────────────────────────────────────────────────────────────────

export type HydrationStrategy =
  | 'load'
  | 'idle'
  | 'visible'
  | 'interaction'
  | 'never'
  | `media(${string})`
  | `interaction(${string})`

export type PrefetchStrategy = 'none' | 'idle' | 'visible'

export interface IslandOptions {
  /** Unique name — must match the key in the client-side hydrateIslands() registry */
  name: string
  /** When to hydrate on the client (default: "load") */
  hydrate?: HydrationStrategy
  /**
   * Pre-warm the island's chunk before its hydration trigger fires.
   * Best paired with `hydrate: 'visible'` or `hydrate: 'media(...)'`.
   * Default: "none". No-op when paired with `hydrate: 'load'` or `'never'`.
   */
  prefetch?: PrefetchStrategy
}

export interface IslandMeta {
  readonly __island: true
  readonly name: string
  readonly hydrate: HydrationStrategy
  readonly prefetch: PrefetchStrategy
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
  const { name, hydrate = 'load', prefetch = 'none' } = options

  const IslandWrapper = function IslandWrapper(props: P): VNode | Promise<VNode | null> {
    const serializedProps = serializeIslandProps(props, name)

    // Only emit data-prefetch when it actually changes behavior. `none` is the
    // default and pointless on `load` / `never` — keep the rendered HTML clean.
    const attrs: Record<string, string> = {
      'data-component': name,
      'data-props': serializedProps,
      'data-hydrate': hydrate,
    }
    if (prefetch !== 'none' && hydrate !== 'load' && hydrate !== 'never') {
      attrs['data-prefetch'] = prefetch
    }

    // ── CLIENT: the island OWNS its hydration lifecycle ──────────────────────
    // Render the `<pyreon-island>` marker, then on mount load the chunk + mount
    // the component INTO the marker per the `hydrate` strategy. This is robust
    // whether the host hydrated the page (a static islands app — where island()
    // only ever runs on the server, so this branch never fires there) or
    // RE-MOUNTED the route client-side. `@pyreon/zero` does the latter: its
    // route is a reactive child of RouterView, so the SSR DOM is discarded and
    // re-mounted, which (a) makes an async inline render here throw with no
    // Suspense boundary, and (b) races/defeats a one-shot external
    // `hydrateIslandsAuto` scan. Owning hydration here sidesteps both: no inline
    // async render, no dependency on external scan timing.
    if (typeof document !== 'undefined') {
      if (hydrate === 'never') return h('pyreon-island', attrs)
      let islandEl: HTMLElement | null = null
      onMount(() => {
        if (!islandEl) return
        // Scheduler is client-only — the dynamic import keeps it out of the SSR
        // module graph and avoids a static `client` ↔ `island` import cycle.
        void import('./client').then(({ scheduleHydration, schedulePrefetch }) => {
          if (!islandEl) return
          const isleLoader = loader as () => Promise<{ default: ComponentFn } | ComponentFn>
          if (prefetch !== 'none') schedulePrefetch(islandEl, isleLoader, prefetch)
          scheduleHydration(islandEl, isleLoader, serializedProps, hydrate)
        })
      })
      return h('pyreon-island', {
        ...attrs,
        ref: (e: Element | null) => {
          islandEl = e as HTMLElement | null
        },
      })
    }

    // ── SERVER (SSR/SSG): render the component INSIDE the marker ─────────────
    // so the static HTML carries the island content (SEO / no-JS / first paint).
    return loader().then((mod) => {
      const Comp = typeof mod === 'function' ? mod : mod.default
      return h('pyreon-island', attrs, h(Comp, props))
    })
  }

  // Attach metadata so tooling (CLI project scanner, MCP, future codegen) can
  // detect islands without runtime introspection.
  const wrapper = IslandWrapper as unknown as ComponentFn<P> & IslandMeta
  Object.defineProperties(wrapper, {
    __island: { value: true, enumerable: true },
    name: { value: name, enumerable: true, writable: false, configurable: true },
    hydrate: { value: hydrate, enumerable: true },
    prefetch: { value: prefetch, enumerable: true },
  })

  return wrapper
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Serialize island props to JSON for embedding in `data-props`.
 *
 * **Prop contract** (what survives the SSR → client roundtrip):
 *
 * - ✅ **JSON-native**: strings, finite numbers, booleans, null, arrays, plain objects
 * - ✅ **Roundtripped losslessly** (via the `encodeIslandProps` codec):
 *   `Date`, `Map`, `Set`, `RegExp`, `BigInt`. The client receives the
 *   real type, not an ISO string / empty object. An internal
 *   `__pyreon_t` marker tags them on the wire; the inverse codec in the
 *   client unwraps the marker before passing props to the hydrated
 *   component. If your own data legitimately uses an object key called
 *   `__pyreon_t`, an `'e'`-escape wrapping kicks in automatically.
 * - ❌ **Dropped silently**: `children`, functions, symbols, `undefined`
 *   on plain objects (mirrors `JSON.stringify`); replaced with `null` in
 *   arrays / `Map` values / `Set` items (also matches `JSON.stringify`).
 *   A dev-mode warning fires when `children` is dropped — it's the most
 *   common surprise.
 * - 🚨 **Fail-loud (was silently `{}`)**: instances of custom classes
 *   (anything whose prototype is not `Object.prototype` and isn't one
 *   of the tagged types above) emit a dev-mode error naming the offending
 *   prop path + constructor name, then fall back to empty props. The
 *   prior behaviour silently dropped class instances to `{}` and let
 *   the bug surface at runtime on the hydrated client. Pass an ID +
 *   restore the rich value on the client, or convert to a plain object.
 * - 🚨 **Fail-loud on circular references** (same path as above —
 *   detected during walking, no throw escapes to break the SSR).
 *
 * For anything more complex than JSON, pass an ID and have the island
 * component fetch / restore the rich value on the client.
 */
function serializeIslandProps(
  props: Record<string, unknown>,
  islandName: string,
): string {
  // The `children` key is dropped explicitly (with a dev warning) BEFORE
  // the codec sees them — children carry VNode trees / closures and are
  // never portable, so the dev message about them stays focused.
  const clean: Record<string, unknown> = {}
  let droppedChildren = false
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children') {
      if (value !== undefined) droppedChildren = true
      continue
    }
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
    const encoded = encodeIslandProps(clean, islandName)
    return JSON.stringify(encoded)
  } catch (err) {
    // Encoder threw on a class instance, depth overflow, or circular
    // reference (the codec catches each with a named-path message). Don't
    // 500 the SSR — emit empty props and surface the full error in dev so
    // the offending site is visible before users hit it on the client.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error(
        `[Pyreon] island "${islandName}" props could not be serialized. ` +
          `Falling back to empty props. ${(err as Error).message}`,
      )
    }
    return '{}'
  }
}
