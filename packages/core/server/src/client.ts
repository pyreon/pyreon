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
import { _IslandIds } from '@pyreon/core/internal'
import {
  createRouter,
  hydrateLoaderData,
  type NavigationGuard,
  type RouteRecord,
  RouterProvider,
  stringifyQuery,
} from '@pyreon/router'
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
// Perf-counter sink — read `globalThis` lazily via a HOISTED helper, NOT a
// module-level `const`. A `const` snapshot participates in the temporal dead
// zone: `hydrateIsland` (a hoisted async fn) can be invoked by a deferred /
// concurrently-raced module evaluation BEFORE the const line runs, throwing
// `ReferenceError: Cannot access '_countSink' before initialization` (an
// intermittent `test (core)` failure). A function declaration hoists with its
// body and reads the always-present `globalThis` at call time, so it is
// TDZ-immune. Still tree-shaken in production — every call site stays behind
// the `process.env.NODE_ENV !== 'production'` gate, which folds to `if (false)`.
function _count(name: string): void {
  const sink = globalThis as { __pyreon_count__?: (n: string, c?: number) => void }
  sink.__pyreon_count__?.(name)
}

// Dev: the box-less `visible` island warning is reported once per page (see
// `visibilityTargets`). Declared up here, before any function that reads it can
// run (the TDZ note above).
let _warnedBoxless = false

// ─── Full app hydration ──────────────────────────────────────────────────────

export interface StartClientOptions {
  /** Root application component */
  App: ComponentFn
  /** Route definitions (same as server) */
  routes: RouteRecord[]
  /** CSS selector or element for the app container (default: "#app") */
  container?: string | Element
  /**
   * Islands-only pages (route `meta: { hydrate: 'islands' }`), built with
   * {@link islandsOnlyPages}: on a page the server marked islands-only, run
   * your islands start INSTEAD of the app (no router, no tree hydration), and
   * make a client-side navigation to an islands-only route a full page load.
   *
   * @example
   * import * as registry from 'virtual:pyreon/islands-registry'
   * startClient({ App, routes, islandsOnly: islandsOnlyPages(() => hydrateIslandsAuto(registry)) })
   */
  islandsOnly?: IslandsOnlyPages
}

/** What {@link islandsOnlyPages} builds for `startClient({ islandsOnly })`. */
export interface IslandsOnlyPages {
  /** On a page the server marked islands-only: run the start and return its cleanup. Otherwise null. */
  startIfMarked(): (() => void) | null
  /** Turns a navigation TO an islands-only route into a full page load. */
  guard: NavigationGuard
}

/**
 * Islands-only page support for `@pyreon/server`'s own {@link startClient}
 * (apps without `@pyreon/zero`, whose client entry does this itself). `start`
 * runs instead of the app on a page the server marked islands-only, usually
 * `() => hydrateIslandsAuto(registry, { root })`; its return is the cleanup.
 *
 * A separate function on purpose: `startClient` only calls what this returns,
 * so the marker check, the navigation guard and the islands runtime enter a
 * bundle only when the app imports this. An app that never uses islands-only
 * pages ships none of it.
 *
 * The navigation guard never reloads the current path (a cold start that
 * re-runs loaders for this URL), so a static host's fallback cannot loop.
 */
export function islandsOnlyPages(start: () => () => void): IslandsOnlyPages {
  return {
    startIfMarked: () => {
      // pyreon-lint-disable-next-line pyreon/no-dom-in-setup -- called by startClient in the browser, never during a render
      if (isServer || document.querySelector(ISLANDS_ONLY_SELECTOR) === null) return null

      return start()
    },
    guard: (to, from) => {
      if (isServer) return undefined
      if ((to.meta as { hydrate?: unknown }).hydrate !== 'islands' || to.path === from.path) return undefined
      location.assign(`${to.path}${stringifyQuery(to.query)}${to.hash ? `#${to.hash}` : ''}`)

      return false
    },
  }
}

/**
 * The marker `renderPage` / `createHandler` put in an islands-only page's
 * head (`ISLANDS_ONLY_MARKER`, render-page.ts; not imported from there: that
 * module is server-only). `island-root.test.tsx` keeps the two in step.
 */
export const ISLANDS_ONLY_SELECTOR = 'meta[name="pyreon-hydrate"][content="islands"]'

/**
 * Whether `value` is what an inline `<script>window.X={…}</script>` evaluates
 * to: an object literal (prototype `Object.prototype`).
 *
 * Truthiness and `typeof === 'object'` are not enough: in a browser, markup
 * with `id="X"` (or `<iframe name="X">`, `<form name>`, `<embed name>`,
 * `<object name>`, `<img name>`) makes the global `X` resolve to that element
 * or frame whenever no script assigned it (named access on Window). A
 * null-prototype object is refused too: a CROSS-ORIGIN frame's WindowProxy
 * reports prototype `null`, and reading any key of it throws SecurityError.
 * `hydrateLoaderData` (router) and `hydrateStores` (store) apply the same rule.
 */
function isObjectLiteral(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  try {
    return Object.getPrototypeOf(value) === Object.prototype
  } catch {
    // A Proxy's `getPrototypeOf` trap can throw; whatever it is, it is not
    // a literal.
    return false
  }
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
  const { App, routes, container = '#app', islandsOnly } = options
  const islandsCleanup = islandsOnly?.startIfMarked()
  if (islandsCleanup) return islandsCleanup
  if (
    process.env.NODE_ENV !== 'production'
    && !islandsOnly
    && document.querySelector(ISLANDS_ONLY_SELECTOR) !== null
  ) {
    // oxlint-disable-next-line no-console
    console.warn(
      "[Pyreon] This page is islands-only (route meta `hydrate: 'islands'`): the server shipped no loader data for it, " +
        'so starting the whole app here re-runs its loaders in the browser. Hydrate only its islands: ' +
        'startClient({ App, routes, islandsOnly: islandsOnlyPages(() => hydrateIslandsAuto(registry)) }), with ' +
        "`import * as registry from 'virtual:pyreon/islands-registry'`.",
    )
  }

  const el = typeof container === 'string' ? document.querySelector(container) : container

  if (!el) {
    throw new Error(`[Pyreon] Container "${container}" not found`)
  }

  // Create client-side router (history mode to match SSR)
  const router = createRouter({ routes, mode: 'history' })
  if (islandsOnly) router.beforeEach(islandsOnly.guard)

  // Hydrate loader data from SSR (avoids re-fetching on initial render). Only
  // an object literal is server data: on a page whose inline script was not
  // written, markup with `id="__PYREON_LOADER_DATA__"` makes the global an
  // element (named access on Window).
  const loaderData = (window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__
  if (isObjectLiteral(loaderData)) hydrateLoaderData(router as never, loaderData)

  // Seed @pyreon/store stores from the SSR snapshot before mount (decoupled
  // bridge set by @pyreon/store on import). Makes cross-island shared state
  // hydrate once with server values. `typeof` and an object literal, not
  // truthiness: without @pyreon/store loaded, markup with that `id` makes the
  // bridge an element, and the same goes for the state.
  const hydrateStores = (globalThis as { __PYREON_HYDRATE_STORES__?: unknown }).__PYREON_HYDRATE_STORES__
  if (typeof hydrateStores === 'function') {
    const storeState = (window as unknown as Record<string, unknown>).__PYREON_STORE_STATE__
    if (isObjectLiteral(storeState)) hydrateStores(storeState)
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

/** Options for {@link hydrateIslands} / {@link hydrateIslandsAuto}. */
export interface HydrateIslandsOptions {
  /**
   * A component that wraps every island these calls hydrate: the place for
   * the providers a standalone island needs (a theme, a UI system's root
   * scope). An island hydrated this way is its own root, with no app around
   * it, so a component inside it that reads context finds nothing unless the
   * root provides it.
   *
   * Loaded once, with the first island that hydrates; a page with no islands
   * never downloads it. It must render ONLY its children (providers, no
   * element), or the island no longer matches its server HTML. Pass the
   * children through as they are (`return props.children`, or
   * `h(Provider, props, props.children)`).
   *
   * @example
   * hydrateIslands(registry, { root: () => import('./IslandRoot') })
   */
  root?: IslandLoader | undefined
}

/** One cached load of the root, per `hydrateIslands` call (never module-level). */
function withRoot(loader: IslandLoader, loadRoot: () => Promise<ComponentFn>): IslandLoader {
  return () =>
    Promise.all([loader(), loadRoot()]).then(([mod, Root]) => {
      const Comp = typeof mod === 'function' ? mod : mod.default
      // The island passed as a plain child argument: the root returns it as
      // it is, so the hydrated tree has exactly the server's shape.
      const Rooted: ComponentFn = (props) => h(Root, null, h(Comp, props))
      return Rooted
    })
}

/**
 * Hydrate all `<pyreon-island>` elements on the page.
 *
 * Only loads JavaScript for components that are actually present in the HTML.
 * Respects hydration strategies (load, idle, visible, media, never).
 *
 * Returns a cleanup that ENDS every island this call scheduled: a trigger that
 * has not fired is cancelled (observer / idle callback / media and interaction
 * listeners), a chunk still loading never mounts, and a hydrated island is
 * unmounted (`onUnmount`, effects and `onMount` cleanups run; its DOM is
 * removed). A static page has no component tree that could notice island DOM
 * leaving, so a host that removes or replaces island DOM itself (an
 * `innerHTML` swap, its own client-side navigation) calls this cleanup; an
 * HMR entry passes it to `import.meta.hot.dispose`. An island that is already
 * live (hydrated by an earlier call that was not cleaned up) is not hydrated
 * a second time.
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
/**
 * The loader registered under `id`, own keys only. `data-component` comes
 * from the page, and an inherited name (`constructor`, `toString`,
 * `__proto__`) must not resolve to a prototype function and be called as a
 * loader (anti-pattern: a DOM attribute never chooses code).
 */
function ownLoader<T>(registry: Record<string, T>, id: string): T | undefined {
  return Object.hasOwn(registry, id) ? registry[id] : undefined
}

export function hydrateIslands(
  registry: Record<string, IslandLoader>,
  options?: HydrateIslandsOptions,
): () => void {
  /* v8 ignore next */
  if (isServer) return () => {}

  // The root loads at most once for every island this call hydrates, and only
  // when one does. Held by this call's closure, so it lives exactly as long as
  // the islands it wraps.
  const rootLoader = options?.root
  let rootPromise: Promise<ComponentFn> | null = null
  const loadRoot = (): Promise<ComponentFn> =>
    (rootPromise ??= (rootLoader as IslandLoader)().then((m) => (typeof m === 'function' ? m : m.default)))

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

  const islands = document.querySelectorAll('pyreon-island:not([data-island-hydrated])')
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
      if (process.env.NODE_ENV !== 'production') _count('island.skipped.nested')
      continue
    }

    const strategy = (el.getAttribute('data-hydrate') ?? 'load') as HydrationStrategy

    // `hydrate: 'never'` deliberately ships zero client JS for the island —
    // no loader is registered because the loader's whole purpose is to be
    // imported. Skip the missing-loader warning for never-strategy islands;
    // any other strategy without a loader IS a real misconfiguration.
    if (strategy === 'never') {
      if (process.env.NODE_ENV !== 'production') _count('island.skipped.never')
      continue
    }

    const registered = ownLoader(registry, componentId)
    if (!registered) {
      console.warn(`No loader registered for island "${componentId}"`)
      el.setAttribute('data-island-error', 'no-loader')
      if (process.env.NODE_ENV !== 'production') _count('island.skipped.no-loader')
      continue
    }

    const loader = rootLoader ? withRoot(registered, loadRoot) : registered
    const propsJson = el.getAttribute('data-props') ?? '{}'

    // Prefetch (if requested) primes the module cache before the hydration
    // trigger fires. Independent of hydration scheduling — the same loader
    // promise is reused, so a `visible` island with `prefetch: 'idle'` will
    // hit a warm cache when the IntersectionObserver finally fires.
    const prefetch = (el.getAttribute('data-prefetch') ?? 'none') as PrefetchStrategy
    const prefetchCleanup = schedulePrefetch(el as HTMLElement, loader, prefetch)
    if (prefetchCleanup) cleanups.push(prefetchCleanup)

    if (process.env.NODE_ENV !== 'production') _count('island.scheduled')
    cleanups.push(scheduleHydration(el as HTMLElement, loader, propsJson, strategy))
  }

  return () => {
    for (const fn of cleanups.splice(0)) fn()
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
    if (process.env.NODE_ENV !== 'production') _count('island.prefetch')
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
  const observer = observeNearViewport(el, prime)

  return () => {
    cancelled = true
    observer?.disconnect()
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
export function hydrateIslandsAuto(
  registry?: AutoIslandRegistry,
  options?: HydrateIslandsOptions,
): () => void {
  /* v8 ignore next */
  if (isServer) return () => {}
  // When there is nothing to auto-hydrate — a missing / malformed registry
  // (the usual culprit: `hydrateIslandsAuto()` called with no argument, or a
  // DEFAULT import of the virtual module which has no default export → its
  // value is `undefined`), OR a registry from `pyreon({ islands: false })` —
  // warn in DEV and no-op. We deliberately do NOT throw: an uncaught exception
  // at page boot pollutes the console + error-tracking (Sentry, etc.) on every
  // view, even though hydration is not actually blocked. Reading
  // `.__pyreonIslandsEnabled` off `undefined`/`null` is also what produced the
  // cryptic "Cannot read properties of undefined" crash this guards against.
  const missing = registry == null || typeof registry !== 'object'
  if (missing || !registry.__pyreonIslandsEnabled) {
    if (process.env.NODE_ENV !== 'production') {
      const why = missing
        ? `was called without the islands registry (received ${registry === undefined ? 'undefined' : registry === null ? 'null' : typeof registry})`
        : 'received a stub registry from `pyreon({ islands: false })`'
      console.warn(
        `[Pyreon] hydrateIslandsAuto() ${why}, so it did nothing. ` +
          `In a @pyreon/zero app you do NOT need to call it — islands declared ` +
          `via \`import { island } from '@pyreon/zero'\` self-hydrate on mount, ` +
          `so \`startClient({ routes })\` alone is enough; remove the ` +
          `hydrateIslandsAuto() call. In a bare @pyreon/vite-plugin app, enable ` +
          `\`pyreon({ islands: true })\` and pass the registry as a NAMESPACE: ` +
          `\`import * as registry from 'virtual:pyreon/islands-registry'; hydrateIslandsAuto(registry)\`.`,
      )
    }

    return () => {}
  }

  return hydrateIslands(registry.__pyreonIslandRegistry, options)
}

/**
 * Schedule one island's hydration and return the ONE function that ends its
 * lifetime, whatever stage it reached:
 *   - trigger pending (IntersectionObserver / idle callback / matchMedia or
 *     interaction listeners) → cancelled;
 *   - chunk in flight → the island never mounts when it lands;
 *   - hydrated → the root is unmounted (`onUnmount`, effects and `onMount`
 *     cleanups run) and `data-island-hydrated` is cleared, so a later
 *     `hydrateIslands()` may hydrate the element afresh.
 * Idempotent. Every removal path calls it: the `island()` marker's unmount
 * (router navigation, the router HMR swap, `<Show>` / `<For>`, a parent
 * re-render, Suspense) and the cleanup `hydrateIslands()` returns.
 */
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
): () => void {
  /* v8 ignore next */
  if (isServer) return () => {}
  let disposed = false
  let unmount: (() => void) | null = null
  const hydrate = (): Promise<void> => {
    if (disposed) return Promise.resolve()
    return hydrateIsland(el, loader, propsJson, owner, () => disposed).then((u) => {
      unmount = u
    })
  }
  const cancel = startTrigger(el, strategy, hydrate)

  return () => {
    if (disposed) return
    disposed = true
    cancel?.()
    if (unmount) {
      unmount()
      unmount = null
      el.removeAttribute('data-island-hydrated')
    }
  }
}

/** Arm the hydration trigger for `strategy`; returns how to disarm it (null: nothing to disarm). */
function startTrigger(
  el: HTMLElement,
  strategy: HydrationStrategy,
  hydrate: () => Promise<void>,
): (() => void) | null {
  /* v8 ignore next */
  if (isServer) return null
  switch (strategy) {
    case 'load':
      hydrate()
      return null

    case 'idle': {
      if ('requestIdleCallback' in window) {
        const id = requestIdleCallback(hydrate)
        return () => cancelIdleCallback(id)
      }
      const id = setTimeout(hydrate, 200)
      return () => clearTimeout(id)
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

        return () => mql.removeEventListener('change', onChange)
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
  // `data-island-state` is removed once hydration finishes; `data-island-hydrated`
  // (set in hydrateIsland) marks the island as live.
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
  owner: EffectScope | null | undefined,
  isDisposed: () => boolean,
): Promise<(() => void) | null> {
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
      if (process.env.NODE_ENV !== 'production') _count('island.error')

      return null
    }

    const mod = await loader()
    // The island left the page while its chunk loaded (or another scheduler
    // already hydrated this element): mounting now would start an instance
    // nothing will ever dispose.
    if (isDisposed() || el.hasAttribute('data-island-hydrated')) return null
    const Comp = typeof mod === 'function' ? mod : mod.default
    // Re-establish the marker's captured owner so the island's hydration root
    // parents to it (hydrate.ts sets `scope._parent = getContextOwner()`),
    // letting the component's `useContext()` reach ancestor providers
    // (PyreonUI theme, etc.). `null` owner → detached root (static islands).
    // The server wrote the island's id namespace to `data-id-prefix`; restoring it around the root makes every
    // `createUniqueId()` inside the island return the id the server rendered (an island is not part of the page's
    // hydration walk, so the page counter cannot reach it). Absent on a marker the client created itself.
    const idPrefix = el.getAttribute('data-id-prefix')
    const tree = idPrefix === null ? h(Comp, props) : h(_IslandIds, { prefix: idPrefix }, h(Comp, props))
    // An empty marker (one the client rendered itself, or one a previous
    // instance's unmount emptied) has nothing to adopt: mount into it.
    const unmount = runWithContextOwner(owner ?? null, () =>
      el.firstChild === null ? mount(tree, el) : hydrateRoot(el, tree),
    )
    // Stamp the "live" marker only after hydrateRoot returns, so tests and
    // devtools can wait for it (a static page never sets data-pyreon-hydrated).
    el.setAttribute('data-island-hydrated', '')
    if (process.env.NODE_ENV !== 'production') _count('island.hydrated')

    return unmount
  } catch (err) {
    console.error(`Failed to hydrate island "${name}"`, err)
    el.setAttribute('data-island-error', 'hydration-failed')
    if (process.env.NODE_ENV !== 'production') _count('island.error')

    return null
  }
}

/**
 * What to observe for an island's `visible` trigger (and `prefetch: 'visible'`).
 *
 * An IntersectionObserver never reports a box-less target as intersecting, and
 * a `display: contents` element generates no box. Islands are often styled that
 * way (the wrapper then adds nothing to flex / grid layouts), and their content
 * often starts under more box-less wrappers (a nested `PyreonUI` scope renders
 * one), so: observe the first elements under the island that are not
 * `display: contents`, at any depth; any of them entering the viewport counts.
 * One hidden right now (`display: none`, inside a closed `<details>`) is
 * observed as it is: it intersects once it gets a box, which is when it can be
 * seen. With no such element at all (a `contents` island holding only text, or
 * nothing), observe the nearest ancestor that has a box, so the island still
 * hydrates when its place on the page does.
 */
function visibilityTargets(el: HTMLElement): Element[] {
  if (typeof getComputedStyle === 'undefined') return [el]
  const out: Element[] = []
  const walk = (e: Element): void => {
    if (getComputedStyle(e).display !== 'contents') out.push(e)
    else for (const c of e.children) walk(c)
  }
  walk(el)
  if (out.length > 0) return out
  let box: Element | null = el.parentElement
  while (box !== null && getComputedStyle(box).display === 'contents') box = box.parentElement
  if (process.env.NODE_ENV !== 'production' && !_warnedBoxless) {
    _warnedBoxless = true
    console.warn(
      `[Pyreon] island "${el.getAttribute('data-component')}" uses hydrate: 'visible' but nothing in it can be ` +
        'observed: the island is `display: contents` and holds no element (only text, or nothing). It will ' +
        'hydrate when its nearest boxed ancestor scrolls into view. Wrap the content in an element, or use ' +
        "hydrate: 'idle' or 'load'. (Reported once per page.)",
    )
  }

  return [box ?? el]
}

function observeVisibility(el: HTMLElement, callback: () => void): (() => void) | null {
  /* v8 ignore next */
  if (isServer) return null
  if (!('IntersectionObserver' in window)) {
    callback()
    return null
  }

  const observer = observeNearViewport(el, callback)

  return () => observer?.disconnect()
}

/**
 * Call `onNear` once, when the island comes within 200px of the viewport.
 *
 * The island element itself is observed first; what to observe instead of a
 * box-less island (`visibilityTargets`) is decided in the observer's FIRST
 * report, not here. Reading computed style here — during hydration startup,
 * before the first paint — forced a synchronous style recalc and a layout of
 * the whole document inside the islands module's evaluation task (measured on
 * pyreon.dev's home page: 10 ms of the task's 17 ms, unthrottled). An
 * IntersectionObserver reports after the browser's own style and layout pass,
 * so by then the same reads cost nothing extra. A boxed island that is in view
 * fires on that first report; a `display: contents` one is swapped to its
 * targets and fires one report later.
 */
function observeNearViewport(el: HTMLElement, onNear: () => void): IntersectionObserver | null {
  // Callers check for IntersectionObserver first; this keeps the helper safe on its own.
  if (typeof IntersectionObserver === 'undefined') {
    onNear()

    return null
  }
  let resolved = false
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect()
          onNear()
          return
        }
      }
      if (resolved) return
      resolved = true
      const targets = visibilityTargets(el)
      if (targets.length === 1 && targets[0] === el) return
      observer.unobserve(el)
      for (const target of targets) observer.observe(target)
    },
    { rootMargin: '200px' },
  )
  observer.observe(el)

  return observer
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
 * page. `base` (`/sub`) is the sub-path the fragment endpoint lives under;
 * without it the base set with `setServerIslandBase` applies. It is never
 * read from the page (see `activateServerIslandElement`). In-flight fetches are not aborted on teardown — a swap to a
 * detached node is skipped via the `el.isConnected` guard in
 * `activateServerIslandElement`.
 */
export function activateServerIslands(base?: string): () => void {
  if (isServer) return () => {}
  const markers = document.querySelectorAll<HTMLElement>(
    'pyreon-server-island[data-name]:not([data-pyreon-si])',
  )
  for (const el of markers) activateServerIslandElement(el, base)
  // No teardown needed — activation is one-shot per marker; in-flight
  // fetches are dropped via the `isConnected` guard, not aborted.
  return () => {}
}

export { activateServerIslandElement, serverIsland, setServerIslandBase } from './server-island'
export { isIslandName, isRoutePath } from './paths'
export type { ServerIslandOptions } from './server-island'
