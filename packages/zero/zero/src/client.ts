import type { ComponentFn } from '@pyreon/core'
import { h, isServer } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { hydrateLoaderData, RouterProvider } from '@pyreon/router'
import { hydrateRoot, mount } from '@pyreon/runtime-dom'
import { createApp } from './app'

// Vite-injected build-time constant. Defined in `vite-plugin.ts`'s
// `config()` hook from `zero({ base })`. Falls back to `'/'` for
// non-Vite builds (test environments, etc.) so the read is always
// safe. The fallback is documented intent — there's no Pyreon
// deployment outside Vite that consumes this.
declare const __ZERO_BASE__: string

// ─── Client entry factory ───────────────────────────────────────────────────

export interface StartClientOptions {
  /** Route definitions. */
  routes: RouteRecord[]
  /** Root layout component. */
  layout?: ComponentFn
}

/**
 * Start the client-side app — hydrates SSR content or mounts fresh for SPA.
 *
 * ## Loader data flow
 *
 * Direct navigation to a route with a `loader` function needs data to be
 * available on the VERY FIRST render. This is handled in two modes:
 *
 * - **SSR mode (zero's default)**: the server pre-runs loaders, renders the
 *   HTML with loader data already applied, and embeds a JSON blob in the
 *   HTML as `window.__PYREON_LOADER_DATA__`. On the client we read that
 *   blob and call `hydrateLoaderData(router, data)` BEFORE hydrating — so
 *   the hydration pass sees the same data the SSR render produced
 *   (avoids hydration mismatches and the flash of "not found" fallback).
 *
 * - **SPA cold start (no SSR content)**: no `__PYREON_LOADER_DATA__` was
 *   embedded, so we call `router.replace(currentPath)` after mount to
 *   trigger the loader pipeline for the initial route. The first render
 *   shows whatever the component displays for `useLoaderData() === undefined`
 *   (typically a loading state or fallback); once loaders resolve, the
 *   reactive `useLoaderData` re-renders with the data. This matches
 *   standard SPA loading behavior.
 *
 * Without this wiring, direct URL navigation to a loader-backed route
 * (e.g. `/posts/3`) showed the "Post not found" fallback indefinitely
 * because `useLoaderData()` returned `undefined` forever. The router
 * only ran loaders on in-app navigation (push/replace), not on initial
 * mount.
 *
 * @example
 * import { routes } from "virtual:zero/routes"
 * import { startClient } from "@pyreon/zero/client"
 *
 * startClient({ routes })
 */
export function startClient(options: StartClientOptions) {
  // `startClient` is the browser entry point — only ever called from a
  // user's `client.ts` mounted in the browser. Explicit guard documents
  // that contract and gives a clearer error than `document is not defined`.
  if (isServer) {
    throw new Error('[Pyreon] startClient() can only be called in the browser.')
  }
  const container = document.getElementById('app')
  if (!container) throw new Error('[Pyreon] Missing #app container element')

  // Read the Vite-injected base so `createRouter({ base })` matches the
  // value Vite used to rewrite asset URLs. `typeof` guard covers the
  // edge case where the constant isn't defined (non-Vite test contexts);
  // missing the constant in a real Vite build is impossible because the
  // plugin's `config()` hook always declares it via `define`.
  const base =
    typeof __ZERO_BASE__ !== 'undefined' && __ZERO_BASE__ !== '/' ? __ZERO_BASE__ : undefined

  const { App, router } = createApp({
    routes: options.routes,
    routerMode: 'history',
    ...(options.layout ? { layout: options.layout } : {}),
    ...(base ? { base } : {}),
  })

  // ── Loader data hydration (SSR path) ───────────────────────────────────────
  // If the server embedded loader data, hydrate it BEFORE mounting so the
  // initial render sees the same data the SSR pass produced. This avoids
  // hydration mismatches and eliminates the flash-of-fallback.
  const ssrLoaderData = (window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__
  const hasSSRLoaderData =
    ssrLoaderData !== undefined && typeof ssrLoaderData === 'object' && ssrLoaderData !== null
  if (hasSSRLoaderData) {
    // `router` is the public Router<> type; hydrateLoaderData uses the
    // internal RouterInstance shape. The cast is safe because they're
    // the same object at runtime — just narrower/wider type views.
    hydrateLoaderData(router as never, ssrLoaderData as Record<string, unknown>)
  }

  // ── Store-state hydration (SSR path) ───────────────────────────────────────
  // Seed @pyreon/store stores from the server snapshot BEFORE mounting so the
  // initial render (and any island sharing a store) reads server values, not
  // defaults. Decoupled bridge — `__PYREON_HYDRATE_STORES__` is set by
  // @pyreon/store on import; undefined (one null check) when the app uses no
  // stores. This is what makes cross-island shared state hydrate ONCE.
  const hydrateStores = (
    globalThis as {
      __PYREON_HYDRATE_STORES__?: (d: Record<string, Record<string, unknown>>) => void
    }
  ).__PYREON_HYDRATE_STORES__
  if (hydrateStores) {
    const ssrStoreState = (window as unknown as Record<string, unknown>).__PYREON_STORE_STATE__
    if (ssrStoreState && typeof ssrStoreState === 'object') {
      hydrateStores(ssrStoreState as Record<string, Record<string, unknown>>)
    }
  }

  // PR-S1: App is router-AGNOSTIC; supply the RouterProvider at this call
  // site (mirrors server createHandler / dev renderSsr / SSG renderPath).
  // See app.ts:createApp for the full rationale.
  const vnode = h(RouterProvider, { router }, h(App, null))

  // ── Mount vs hydrate ───────────────────────────────────────────────────────
  // Ignore comment nodes (Vite injects <!--app-html-->) — only real DOM
  // elements or text nodes count as SSR content worth hydrating.
  const hasSSRContent = Array.from(container.childNodes).some(
    (n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent!.trim().length > 0),
  )

  // The base-stripped pathname + search the router considers current. Shared by
  // the route pre-resolution below AND the SPA cold-start loader run.
  //
  // PATH + query string + hash — `router.currentRoute().path` is JUST the
  // pathname (search/hash stripped by `resolveRoute`). Passing only the
  // pathname makes `router.replace` write the bare URL via
  // `history.replaceState`, silently dropping query params present on the
  // initial-load URL. Any `useUrlState` / `useTypedSearchParams` consumer
  // reading `window.location.search` later sees an empty string and falls back
  // to defaults — direct-link sharing of `/search?q=react` was structurally
  // broken on cold-start (W13 from #942 follow-up audit).
  //
  // We use the router's internal `_currentPath` signal because it already holds
  // the BASE-STRIPPED pathname + search assembled by `getInitialLocation()`.
  // Reading `window.location.pathname` directly would include the base prefix
  // (e.g. `/blog/` for a subpath deploy), which `router.replace` then
  // re-prepends inside `syncBrowserUrl` — producing a double-prefix URL like
  // `/blog//blog/about`. Using `_currentPath` keeps base handling centralised
  // in the router.
  const internalCurrentPath = (router as unknown as { _currentPath?: () => string })._currentPath
  const currentPath =
    typeof internalCurrentPath === 'function' ? internalCurrentPath() : router.currentRoute().path

  // ── Loader run (SPA cold-start path) ───────────────────────────────────────
  // If we had no SSR loader data AND no SSR content, this is a true SPA cold
  // start. Trigger the router's loader pipeline for the current route via
  // `replace()` with the same path — doesn't change the URL, just kicks off the
  // loader batch. Guards, middleware, and redirects run too, which matches what
  // any other route navigation would do.
  //
  // If we DID have SSR content but NO loader data — that's an unusual case (SSR
  // disabled for this route but loader defined). Run loaders anyway so the
  // client catches up.
  //
  // Runs immediately AFTER the mount/hydrate, exactly as before — it is invoked
  // from `hydrateOrMount` so that ordering survives the pre-resolution await.
  const runInitialLoadersIfNeeded = (): void => {
    if (hasSSRLoaderData) return
    router.replace(currentPath).catch((err: unknown) => {
      // Loader failures are already reported via the route's error handling
      // pipeline. We swallow the promise rejection here to prevent unhandled
      // rejection warnings — the route's `errorComponent` (if any) already
      // handled the display.
      // @ts-ignore — `import.meta.env.DEV` is provided by Vite/Rolldown at build time
      if (import.meta.env?.DEV === true) {
        // oxlint-disable-next-line no-console
        console.warn('[Pyreon] Initial loader run failed for route:', currentPath, err)
      }
    })
  }

  let disposed = false
  let innerCleanup: (() => void) | null = null

  const hydrateOrMount = (): void => {
    // `startClient`'s returned cleanup may be called before pre-resolution
    // settles; do not mount into a container the caller has abandoned.
    if (disposed) return
    innerCleanup = hasSSRContent ? hydrateRoot(container, vnode) : mount(vnode, container)
    runInitialLoadersIfNeeded()

    // ── Hydration barrier ────────────────────────────────────────────────────
    // Announce that the client has taken ownership of `container`, so a caller
    // can wait for INTERACTIVITY rather than for pixels.
    //
    // This lives INSIDE `hydrateOrMount`, not at the old call site, and that
    // placement is the whole point of it here. Before the pre-resolution above,
    // hydration ran synchronously and the lazy route's first render DELETED the
    // server range — the page blanked and refilled when the chunk landed.
    // Nothing clickable existed in between, so anything a caller could reach was
    // necessarily already hydrated. That was an accidental barrier, and this
    // change removes it by keeping the server DOM.
    //
    // So between `startClient()` returning and this line, the page is now
    // fully rendered, visible, and DEAD: a click lands on a control with no
    // handler and is swallowed. Measured at ~48ms locally, unbounded on a cold
    // transform or slow network. Set AFTER mount/hydrate returns, so presence
    // means handlers are attached rather than that markup arrived.
    if (container instanceof HTMLElement) container.dataset.pyreonHydrated = ''
  }

  if (hasSSRContent) {
    // ── Route pre-resolution (hydration path only) ───────────────────────────
    // fs-router emits every route as `lazy()`, so at this point NONE of the
    // matched components are in the router's cache. `RouterView` renders its
    // route through a REACTIVE CHILD, so that child's first render would be the
    // lazy fallback — `null` for a route without a `loadingComponent`. Hydration
    // compares that against the server's fully-rendered subtree, finds nothing
    // to adopt, and rebuilds the whole page. Measured on the docs production
    // build before this: 10 of 11,514 `<body>` nodes retained (0.1%).
    //
    // Resolving the matched chain FIRST makes the initial render the REAL
    // component, so hydration adopts the server's nodes — which is the entire
    // point of hydrating: node identity (focus, typed input, scroll position,
    // listeners attached by non-Pyreon code) survives, and the client skips DOM
    // construction the server already paid for.
    //
    // `skipLoaders` because loader data was already seeded from
    // `__PYREON_LOADER_DATA__` above; this step is purely about code.
    //
    // Cost: the route chunks are emitted with `<link rel="modulepreload">` by
    // the SSG/SSR build, so this normally resolves from cache. While it does,
    // the server's DOM stays visible and untouched — strictly better than the
    // previous behaviour, which blanked the route immediately on hydrate and
    // refilled it only once the chunk landed.
    //
    // A rejection must NOT leave the app dead: fall through and hydrate anyway,
    // which reproduces exactly the pre-change behaviour for that route.
    //
    // An ABSENT `preload` is the stronger version of that same case and was
    // unhandled: calling it would throw synchronously out of `startClient`, so
    // the app never mounts at all — strictly worse than the rejection this
    // block already defends against. Guarded the way `_currentPath` is guarded
    // a few lines above, for the same reason: the router is reached through a
    // structural type here, so its shape is an assumption rather than a
    // guarantee.
    const preload = (router as unknown as { preload?: typeof router.preload }).preload
    if (typeof preload !== 'function') {
      hydrateOrMount()
    } else {
      preload
        .call(router, currentPath, undefined, { skipLoaders: true })
        .then(hydrateOrMount, (err) => {
          // @ts-ignore — `import.meta.env.DEV` is provided by Vite/Rolldown at build time
          if (import.meta.env?.DEV === true) {
            // oxlint-disable-next-line no-console
            console.warn(
              '[Pyreon] Route pre-resolution failed; hydrating anyway:',
              currentPath,
              err,
            )
          }
          hydrateOrMount()
        })
    }
  } else {
    hydrateOrMount()
  }

  const cleanup = (): void => {
    disposed = true
    innerCleanup?.()
  }

  return cleanup
}
