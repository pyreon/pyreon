import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { hydrateLoaderData } from '@pyreon/router'
import { hydrateRoot, mount } from '@pyreon/runtime-dom'
import { createApp } from './app'

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
  if (typeof document === 'undefined') {
    throw new Error('[Pyreon] startClient() can only be called in the browser.')
  }
  const container = document.getElementById('app')
  if (!container) throw new Error('[Pyreon] Missing #app container element')

  const { App, router } = createApp({
    routes: options.routes,
    routerMode: 'history',
    ...(options.layout ? { layout: options.layout } : {}),
  })

  // ── Loader data hydration (SSR path) ───────────────────────────────────────
  // If the server embedded loader data, hydrate it BEFORE mounting so the
  // initial render sees the same data the SSR pass produced. This avoids
  // hydration mismatches and eliminates the flash-of-fallback.
  const ssrLoaderData = (window as unknown as Record<string, unknown>)
    .__PYREON_LOADER_DATA__
  const hasSSRLoaderData =
    ssrLoaderData !== undefined &&
    typeof ssrLoaderData === 'object' &&
    ssrLoaderData !== null
  if (hasSSRLoaderData) {
    // `router` is the public Router<> type; hydrateLoaderData uses the
    // internal RouterInstance shape. The cast is safe because they're
    // the same object at runtime — just narrower/wider type views.
    hydrateLoaderData(router as never, ssrLoaderData as Record<string, unknown>)
  }

  const vnode = h(App, null)

  // ── Mount vs hydrate ───────────────────────────────────────────────────────
  const hasSSRContent = container.childNodes.length > 0
  const cleanup = hasSSRContent ? hydrateRoot(container, vnode) : mount(vnode, container)

  // ── Loader run (SPA cold-start path) ───────────────────────────────────────
  // If we had no SSR loader data AND no SSR content, this is a true SPA
  // cold start. Trigger the router's loader pipeline for the current route
  // via `replace()` with the same path — doesn't change the URL, just kicks
  // off the loader batch. Guards, middleware, and redirects run too, which
  // matches what any other route navigation would do.
  //
  // If we DID have SSR content but NO loader data — that's an unusual case
  // (SSR disabled for this route but loader defined). Run loaders anyway so
  // the client catches up.
  if (!hasSSRLoaderData) {
    const currentPath = router.currentRoute().path
    router.replace(currentPath).catch((err: unknown) => {
      // Loader failures are already reported via the route's error handling
      // pipeline. We swallow the promise rejection here to prevent unhandled
      // rejection warnings — the route's `errorComponent` (if any) already
      // handled the display.
      // @ts-ignore — `import.meta.env.DEV` is provided by Vite/Rolldown at build time
      if (import.meta.env?.DEV === true) {
        // oxlint-disable-next-line no-console
        console.warn(
          '[Pyreon] Initial loader run failed for route:',
          currentPath,
          err,
        )
      }
    })
  }

  return cleanup
}
