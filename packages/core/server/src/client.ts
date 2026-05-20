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

// Dev-time counter sink — see packages/internals/perf-harness for contract.
// Same pattern as @pyreon/runtime-dom: bare process.env.NODE_ENV gate (the
// bundler-agnostic library standard) so counter strings tree-shake out under
// every modern bundler (Vite, Webpack/Next.js, Rolldown, esbuild, Rollup,
// Parcel, Bun) when consumers ship a production bundle. The optional-chain
// short-circuits in dev when no consumer has called perfHarness.install().
const __DEV__ = process.env.NODE_ENV !== 'production'
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
  /* v8 ignore next */
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
      if (__DEV__) _countSink.__pyreon_count__?.('island.skipped.nested')
      continue
    }

    const strategy = (el.getAttribute('data-hydrate') ?? 'load') as HydrationStrategy

    // `hydrate: 'never'` deliberately ships zero client JS for the island —
    // no loader is registered because the loader's whole purpose is to be
    // imported. Skip the missing-loader warning for never-strategy islands;
    // any other strategy without a loader IS a real misconfiguration.
    if (strategy === 'never') {
      if (__DEV__) _countSink.__pyreon_count__?.('island.skipped.never')
      continue
    }

    const loader = registry[componentId]
    if (!loader) {
      console.warn(`No loader registered for island "${componentId}"`)
      el.setAttribute('data-island-error', 'no-loader')
      if (__DEV__) _countSink.__pyreon_count__?.('island.skipped.no-loader')
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

    if (__DEV__) _countSink.__pyreon_count__?.('island.scheduled')
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
  /* v8 ignore next */
  if (typeof window === 'undefined') return null
  let cancelled = false
  // Fire and forget — we don't await; the dynamic import warms the module
  // cache and the hydration path will await its OWN loader() call (which
  // resolves to the same module via JS's import-promise dedup).
  const prime = () => {
    if (cancelled) return
    if (__DEV__) _countSink.__pyreon_count__?.('island.prefetch')
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
  /* v8 ignore next */
  if (typeof window === 'undefined') return null
  let cancelled = false
  const hydrate = (): Promise<void> => {
    if (cancelled) return Promise.resolve()
    return hydrateIsland(el, loader, propsJson)
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
      if (__DEV__) _countSink.__pyreon_count__?.('island.error')
      return
    }

    const mod = await loader()
    const Comp = typeof mod === 'function' ? mod : mod.default
    hydrateRoot(el, h(Comp, props))
    if (__DEV__) _countSink.__pyreon_count__?.('island.hydrated')
  } catch (err) {
    console.error(`Failed to hydrate island "${name}"`, err)
    el.setAttribute('data-island-error', 'hydration-failed')
    if (__DEV__) _countSink.__pyreon_count__?.('island.error')
  }
}

function observeVisibility(el: HTMLElement, callback: () => void): (() => void) | null {
  /* v8 ignore next */
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
