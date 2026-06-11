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
import { decodeIslandProps } from './island-codec'
import { hydrateRoot, mount } from '@pyreon/runtime-dom'
import { isServer, runWithContextOwner, type EffectScope } from '@pyreon/reactivity'
import type { HydrationStrategy, PrefetchStrategy } from './island'

// `island()` is client-safe — it only renders the `<pyreon-island>` marker via
// `h()` and encodes props (island.ts imports nothing beyond `@pyreon/core` +
// `./island-codec`). Re-exported from this CLIENT-safe subentry so island
// declarations can be imported WITHOUT dragging the `@pyreon/server` main
// barrel (`createHandler` / `prerender` + their `node:` deps + the package's
// `registerSingleton`) into a client/route bundle — the leak that breaks
// islands inside `@pyreon/zero` routes (every route ships to the client).
export type { IslandMeta, IslandOptions } from './island'
export { island } from './island'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
// Same pattern as @pyreon/runtime-dom: bare process.env.NODE_ENV gate (the
// bundler-agnostic library standard) so counter strings tree-shake out under
// every modern bundler (Vite, Webpack/Next.js, Rolldown, esbuild, Rollup,
// Parcel, Bun) when consumers ship a production bundle. The optional-chain
// short-circuits in dev when no consumer has called perfHarness.install().
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

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
  // SSR-only guard: hard-fails if startClient is called server-side. Cannot be
  // exercised under happy-dom (document is always defined in the test env).
  /* v8 ignore next 3 */
  if (isServer) {
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
  /* v8 ignore next */
  if (isServer) return () => {}

  // Dev-mode footgun guard: calling `hydrateIslands()` twice without
  // invoking the previous call's cleanup function leaks the old
  // IntersectionObservers / requestIdleCallback IDs / matchMedia + event
  // listeners. This bites HMR users who don't wire up
  // `import.meta.hot.dispose(cleanup)` (or its sub-route equivalent).
  // We warn loudly in dev — production stays silent (tree-shaken). The
  // current call still proceeds (HMR / route-change DOES require
  // re-registration; we just want the user to know they should clean up
  // the previous one first).
  if (process.env.NODE_ENV !== 'production') {
    const w = window as Window & { __pyreon_island_hydrate_active__?: boolean }
    if (w.__pyreon_island_hydrate_active__) {
      console.warn(
        '[Pyreon] hydrateIslands() called again without invoking the previous ' +
          "call's cleanup function. The previous call's listeners / observers / " +
          'timers are now leaked. Wire up cleanup in your entry file:\n' +
          '  const cleanup = hydrateIslands({ ... })\n' +
          "  if (import.meta.hot) import.meta.hot.dispose(cleanup)  // HMR\n" +
          '  // or on SPA route change: cleanup() before re-registering',
      )
    }
    w.__pyreon_island_hydrate_active__ = true
  }

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
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('island.skipped.nested')
      continue
    }

    const strategy = (el.getAttribute('data-hydrate') ?? 'load') as HydrationStrategy

    // `hydrate: 'never'` deliberately ships zero client JS for the island —
    // no loader is registered because the loader's whole purpose is to be
    // imported. Skip the missing-loader warning for never-strategy islands;
    // any other strategy without a loader IS a real misconfiguration.
    if (strategy === 'never') {
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('island.skipped.never')
      continue
    }

    const loader = registry[componentId]
    if (!loader) {
      console.warn(`No loader registered for island "${componentId}"`)
      el.setAttribute('data-island-error', 'no-loader')
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('island.skipped.no-loader')
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

    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('island.scheduled')
    const cleanup = scheduleHydration(el as HTMLElement, loader, propsJson, strategy)
    if (cleanup) cleanups.push(cleanup)
  }

  return () => {
    for (const fn of cleanups) fn()
    if (process.env.NODE_ENV !== 'production') {
      const w = window as Window & { __pyreon_island_hydrate_active__?: boolean }
      w.__pyreon_island_hydrate_active__ = false
    }
  }
}

// Exported so `island()` (in `./island`) can SELF-HYDRATE in hosts that
// re-mount route content client-side (e.g. `@pyreon/zero`, where the route is
// a reactive child of RouterView — the SSR DOM is discarded + re-mounted, so a
// one-shot `hydrateIslandsAuto` scan races the async route mount). island()
// dynamically imports these from its `onMount`, so the scheduler stays
// client-only + out of the SSR graph, and there's no static client↔island cycle.
export function schedulePrefetch(
  el: HTMLElement,
  loader: IslandLoader,
  prefetch: PrefetchStrategy,
): (() => void) | null {
  if (prefetch === 'none') return null
  /* v8 ignore next */
  if (isServer) return null
  let cancelled = false
  // Fire and forget — we don't await; the dynamic import warms the module
  // cache and the hydration path will await its OWN loader() call (which
  // resolves to the same module via JS's import-promise dedup).
  const prime = () => {
    if (cancelled) return
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('island.prefetch')
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
  /* v8 ignore next */
  if (isServer) return () => {}
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

export function scheduleHydration(
  el: HTMLElement,
  loader: IslandLoader,
  propsJson: string,
  strategy: HydrationStrategy,
  // Context owner captured at the island marker's render time (while its
  // owner — and thus the ancestor PyreonUI/theme provider chain — was active).
  // Hydration is deferred (idle / visible / interaction), so by the time the
  // island mounts the active owner is gone; re-establishing this captured
  // owner lets the hydrated component's `useContext()` walk up to ancestor
  // providers. Without it (#1338 owner-based context, no global stack), a
  // rocketstyle component inside the island reads an undefined theme and
  // crashes. `null`/omitted (static islands apps via `hydrateIslands`) keeps
  // the prior detached-root behavior.
  owner?: EffectScope | null,
): (() => void) | null {
  /* v8 ignore next */
  if (isServer) return null
  let cancelled = false
  const hydrate = (): Promise<void> => {
    if (cancelled) return Promise.resolve()
    return hydrateIsland(el, loader, propsJson, owner)
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

    // `case 'never'` is dead here — `hydrateIslands` short-circuits before
    // calling `scheduleHydration` when strategy === 'never' (the whole point
    // of the strategy is shipping zero client JS). Removing the case keeps
    // the branch surface tight; if a future caller invokes scheduleHydration
    // directly with 'never', the default fallback (immediate hydrate) is the
    // wrong shape — gate it at the call site, not here.

    case 'interaction':
      return scheduleInteractionHydration(el, hydrate, DEFAULT_INTERACTION_EVENTS)

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
      // interaction(<events>) — comma-separated event names
      if (strategy.startsWith('interaction(')) {
        const eventsStr = strategy.slice(12, -1).trim()
        const events = eventsStr
          ? eventsStr.split(',').map((s) => s.trim()).filter(Boolean)
          : DEFAULT_INTERACTION_EVENTS
        return scheduleInteractionHydration(el, hydrate, events)
      }
      hydrate()
      return null
  }
}

/**
 * Default events for the `interaction` strategy. Picked to cover the common
 * "user reaches for it" surface: keyboard (`focus`), mouse (`pointerenter`,
 * `click`), touch (`touchstart`), and form `submit` (a form inside an island
 * — newsletter signup, search, comment, etc.). First matching event triggers
 * hydrate + removes ALL listeners (one-shot).
 */
const DEFAULT_INTERACTION_EVENTS: readonly string[] = [
  'focus',
  'click',
  'pointerenter',
  'touchstart',
  // `submit` bubbles to the island root from any descendant form. Without
  // capturing + preventing it pre-hydrate, the browser performs the form's
  // default action (full-page POST/GET) BEFORE the live handler exists.
  'submit',
]

/**
 * Pre-hydrate user interaction we captured for replay. Discriminated by
 * event type so post-hydrate re-dispatch builds the right synthetic event
 * (clicks → `MouseEvent`, form submits → `SubmitEvent`).
 */
type CapturedInteraction =
  | { type: 'click'; path: ReplayPath }
  | { type: 'submit'; path: ReplayPath }

function scheduleInteractionHydration(
  el: HTMLElement,
  hydrate: () => Promise<void>,
  events: readonly string[],
): () => void {
  let hydrationStarted = false
  let hydrated = false
  // Holds replay info if a user interaction came in during in-flight
  // hydration — we replay it on the equivalent post-hydration element so
  // the user's first click / form submit both wakes the island AND fires
  // the live handler.
  //
  // Hydration may REPLACE DOM nodes (mismatch fallback, or even successful
  // hydrate-as-mount on some shapes). The original `event.target` reference
  // can therefore be detached after hydration completes. To survive this,
  // we capture an identifying "replay path" — preferring `data-testid` (a
  // stable, semantic identifier) and falling back to a tag-based child
  // index walk relative to `el`. After hydration we re-query the live tree.
  let captured: CapturedInteraction | null = null
  // Stamp a "scheduled" marker for tests / devtools introspection.
  el.setAttribute('data-island-state', 'awaiting-interaction')

  const startHydration = () => {
    if (hydrationStarted) return
    hydrationStarted = true
    el.setAttribute('data-island-state', 'hydrating')
    void hydrate().then(() => {
      hydrated = true
      el.removeAttribute('data-island-state')
      for (const ev of events) {
        el.removeEventListener(ev, dispatch, INTERACTION_LISTENER_OPTS)
      }
      if (!captured) return
      const liveTarget = resolveReplayPath(el, captured.path)
      if (!liveTarget || !liveTarget.isConnected) return
      if (captured.type === 'submit' && liveTarget instanceof HTMLFormElement) {
        // The browser exposes `SubmitEvent` in real browsers and modern
        // happy-dom — fall back to a plain `Event('submit')` if the
        // global is missing (older happy-dom builds, exotic runtimes).
        const SubmitEventCtor =
          typeof SubmitEvent === 'function'
            ? SubmitEvent
            : (Event as unknown as typeof SubmitEvent)
        liveTarget.dispatchEvent(
          new SubmitEventCtor('submit', { bubbles: true, cancelable: true }),
        )
      } else {
        liveTarget.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true }),
        )
      }
    })
  }

  const dispatch = (event: Event) => {
    // After hydration, listeners are removed in the `then` above —
    // this branch is defensive only.
    if (hydrated) return

    if (event.type === 'click') {
      // Stop the click — the SSR DOM has no live click handler bound yet,
      // so propagating it does nothing useful. Capture the click target
      // for replay after hydration. Works whether or not hydration was
      // already started by a previous non-click event — the click always
      // replays as the user-intended action.
      event.stopImmediatePropagation()
      event.preventDefault()
      const target = event.target as HTMLElement | null
      if (target) {
        const path = captureReplayPath(el, target)
        if (path) captured = { type: 'click', path }
      }
    } else if (event.type === 'submit') {
      // Same logic as click but for forms: without preventDefault the
      // browser would do a full-page navigation BEFORE the live handler
      // mounts. Capture the form element so we can re-dispatch `submit`
      // post-hydrate against the live form (which now has the user's
      // listeners bound).
      event.stopImmediatePropagation()
      event.preventDefault()
      const target = event.target as HTMLElement | null
      // `submit` only fires on form elements, but type-narrow defensively.
      if (target instanceof HTMLFormElement) {
        const path = captureReplayPath(el, target)
        if (path) captured = { type: 'submit', path }
      }
    }
    startHydration()
  }

  // `passive: false` because the click handler may need preventDefault on
  // the original event in the replay path. `capture: true` so we run
  // BEFORE the live event-delegation handler that hydrateRoot installs
  // on the container (otherwise the click would already have propagated
  // past us by the time we react to non-click events firing first).
  for (const ev of events) {
    el.addEventListener(ev, dispatch, INTERACTION_LISTENER_OPTS)
  }
  return () => {
    if (hydrated) return
    el.removeAttribute('data-island-state')
    for (const ev of events) {
      el.removeEventListener(ev, dispatch, INTERACTION_LISTENER_OPTS)
    }
  }
}

const INTERACTION_LISTENER_OPTS: AddEventListenerOptions = {
  passive: false,
  capture: true,
}

/**
 * A locator path for replaying a click after hydration MAY have replaced the
 * original DOM node. Two strategies:
 *   - `testid`: re-query the live tree by `[data-testid="..."]`. Stable,
 *     semantic, survives DOM swap.
 *   - `path`: a tag-name + child-index walk from the island root. Fallback
 *     for elements without a test id. Less stable (assumes the live tree
 *     mirrors the SSR tree's shape) but covers the no-testid case.
 */
type ReplayPath =
  | { kind: 'testid'; value: string }
  | { kind: 'path'; steps: { tag: string; index: number }[] }

function captureReplayPath(el: Element, target: Element): ReplayPath | null {
  const testid = target.getAttribute?.('data-testid')
  if (testid) return { kind: 'testid', value: testid }
  // Walk up from target to el, collecting (tag, child-index) at each step.
  // `node` is non-null on every iteration because we early-return when
  // `parent` is null (the only path that could leave node nullable). The
  // `Element | null` type is preserved for the post-loop `node === el` check
  // so the path-not-found case still returns null cleanly.
  const steps: { tag: string; index: number }[] = []
  let node: Element | null = target
  while (node !== el) {
    const parent: Element | null = node.parentElement
    if (!parent) return null
    const siblings = Array.from(parent.children)
    const index = siblings.indexOf(node)
    if (index < 0) return null
    steps.unshift({ tag: node.tagName, index })
    node = parent
  }
  return { kind: 'path', steps }
}

function resolveReplayPath(el: Element, path: ReplayPath): HTMLElement | null {
  if (path.kind === 'testid') {
    return el.querySelector<HTMLElement>(`[data-testid="${path.value}"]`)
  }
  let node: Element | null = el
  for (const { tag, index } of path.steps) {
    const child: Element | undefined = node?.children[index]
    if (!child || child.tagName !== tag) return null
    node = child
  }
  return node as HTMLElement | null
}

async function hydrateIsland(
  el: HTMLElement,
  loader: IslandLoader,
  propsJson: string,
  owner?: EffectScope | null,
): Promise<void> {
  const name = el.getAttribute('data-component') ?? 'unknown'
  try {
    let props: Record<string, unknown>
    try {
      const raw = JSON.parse(propsJson)
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new TypeError('Expected object')
      }
      // Inverse of `encodeIslandProps` — restores Date / Map / Set /
      // RegExp / BigInt the SSR codec tagged with `__pyreon_t`. Plain
      // objects without markers round-trip unchanged.
      const decoded = decodeIslandProps(raw) as Record<string, unknown>
      props = decoded
    } catch (parseErr) {
      console.error(`Invalid island props JSON for "${name}"`, parseErr)
      el.setAttribute('data-island-error', 'invalid-props')
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('island.error')
      return
    }

    const mod = await loader()
    const Comp = typeof mod === 'function' ? mod : mod.default
    // Re-establish the marker's captured owner so the island's hydration root
    // parents to it (hydrate.ts sets `scope._parent = getContextOwner()`),
    // letting the component's `useContext()` reach ancestor providers
    // (PyreonUI theme, etc.). `null` owner → detached root (static islands).
    runWithContextOwner(owner ?? null, () => hydrateRoot(el, h(Comp, props)))
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('island.hydrated')
  } catch (err) {
    console.error(`Failed to hydrate island "${name}"`, err)
    el.setAttribute('data-island-error', 'hydration-failed')
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('island.error')
  }
}

function observeVisibility(el: HTMLElement, callback: () => void): (() => void) | null {
  /* v8 ignore next */
  if (isServer) return null
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

// ─── Server islands — client activation (Phase 4) ───────────────────────────
import { activateServerIslandElement } from './server-island'

/**
 * Scan the document for `<pyreon-server-island>` markers and fetch each
 * one's per-request fragment from the auto-mounted endpoint
 * (`GET /_pyreon/fragment/<name>?props=<encoded>`), swapping the returned
 * HTML into the marker. The page around the markers stays fully
 * CDN/ISR/prerender-cacheable — personalization arrives per request here.
 *
 * This is the MANUAL document-scan path for static / no-full-hydrate hosts.
 * In a zero app you do NOT need it — each marker self-activates via its own
 * `ref` on mount (see `serverIsland`), which is robust across lazy-route /
 * SPA-navigation timing that a one-shot scan can't win. Idempotent per
 * marker (`data-pyreon-si` stamped on activation, by both paths). Fetch
 * failures leave the fallback content in place and flag the marker
 * (`data-island-error="fragment-failed"`) — a personalized hole degrading
 * to its structural fallback is the designed failure mode, never a broken
 * page. In-flight fetches are not aborted on teardown — a swap to a
 * detached node is skipped via the `el.isConnected` guard in
 * `activateServerIslandElement`.
 */
export function activateServerIslands(base = ''): () => void {
  if (isServer) return () => {}
  const markers = document.querySelectorAll<HTMLElement>(
    'pyreon-server-island[data-name]:not([data-pyreon-si])',
  )
  for (const el of markers) activateServerIslandElement(el, base)
  // No teardown needed — activation is one-shot per marker; in-flight
  // fetches are dropped via the `isConnected` guard, not aborted.
  return () => {}
}

export { activateServerIslandElement, serverIsland } from './server-island'
export type { ServerIslandOptions } from './server-island'
