/**
 * `renderPage` — the ONE string-mode page-render pipeline shared by every
 * SSR-shaped consumer:
 *
 *   1. `createHandler` (production runtime SSR, `mode: 'string'`)
 *   2. `@pyreon/zero`'s SSG prerender entry (build-time, per path)
 *   3. `@pyreon/zero`'s dev-server SSR middleware (`renderSsr`)
 *
 * Before this module, each consumer carried its own copy of the same
 * sequence (preload → redirect catch → render → styler collect → loader
 * serialization → status) and the copies DRIFTED — the styler `<style>` tag
 * was present in handler SSR but missing from SSG output for months, the
 * noindex injection had to be added at two call sites, and the loader-data
 * serializer was unified only after a third drift (M2.2). Centralizing the
 * sequence makes that bug class structurally impossible: a per-page concern
 * added here reaches all three consumers at once.
 *
 * What is deliberately NOT here:
 *   - **Template composition.** The three consumers compose differently on
 *     purpose: the handler pre-compiles its template once per process
 *     (`compileTemplate`), SSG uses `injectIntoTemplate` (placeholder
 *     fallbacks + `<div id="app">` handling for user templates), and dev
 *     injects into the Vite-transformed `index.html`. Each keeps its own
 *     composition; this module returns PARTS.
 *   - **Streaming.** `renderToStream` is a structurally different pipeline
 *     (shell flush + per-boundary emission); the handler's stream branch
 *     keeps its own flow.
 *
 * Module-graph note: every consumer must load this module through ITS OWN
 * module graph — the handler via a normal import, the SSG synthetic entry
 * via the SSR sub-build's bundling, and the dev middleware via
 * `ssrLoadModule("@pyreon/server")` — so the `@pyreon/core` / `@pyreon/router`
 * instances this module imports are the SAME instances the user's route
 * components see (context identity; the documented dual-instance hazard).
 */

import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { renderWithHead } from '@pyreon/head/ssr'
import {
  getRedirectInfo,
  RouterProvider,
  serializeLoaderData,
  stringifyLoaderData,
} from '@pyreon/router'
import { runWithRequestContext } from '@pyreon/runtime-server'
import { provideRequestLocals } from './middleware'

/**
 * Structural minimum of the router surface `renderPage` touches. Both
 * `createRouter(...)`'s concrete instance and zero's `createApp(...).router`
 * satisfy it; using the structural shape avoids coupling to the `Router<T>`
 * generic at this layer.
 */
export interface RenderablePageRouter {
  preload(
    path: string,
    request?: Request,
    options?: { skipLoaders?: boolean },
  ): Promise<void>
  currentRoute(): {
    matched?: ReadonlyArray<{ component?: unknown }>
    isNotFound?: boolean
  }
}

export interface RenderPageOptions {
  /**
   * The incoming request (runtime SSR). Forwarded to `router.preload` so
   * loaders can read cookies / auth headers and `throw redirect()` BEFORE
   * the layout renders. Omit for build-time (SSG) renders.
   */
  request?: Request
  /**
   * Skip running route loaders during preload (lazy components still
   * resolve). Used by the SSG 404 build — layout loaders that touch auth
   * resources must not fire without a real request context.
   */
  skipLoaders?: boolean
  /**
   * Collect CSS-in-JS styles after the render (e.g. `@pyreon/styler`'s
   * `sheet.getStyleTag()`). A returned tag is prepended to the head —
   * UNLESS it is empty (`...></style>` with no rules), which is skipped so
   * styler-less pages don't carry a useless empty `<style>` element.
   */
  collectStyles?: (() => string) | undefined
  /**
   * Middleware locals to bridge into the component tree (runtime SSR —
   * CSP nonce, auth user, etc.). Provided inside the request context so
   * `useRequestLocals()` resolves during the render.
   */
  locals?: Record<string, unknown>
  /**
   * Return `{ kind: 'unmatched' }` instead of rendering when the router
   * matched nothing for `path`. The dev middleware uses this to fall
   * through to its static-404 handling; the production handler and SSG
   * render regardless (their not-found story is the router's synthetic
   * `notFoundComponent` chain, which DOES match).
   */
  bailOnUnmatched?: boolean
}

export type RenderPageResult =
  /** A loader threw `redirect()` during preload — emit an HTTP redirect. */
  | { kind: 'redirect'; from: string; to: string; status: number }
  /** Nothing matched and `bailOnUnmatched` was set — caller falls through. */
  | { kind: 'unmatched' }
  /** Rendered parts for the caller to compose into its template. */
  | {
      kind: 'html'
      /** Rendered app markup (the `<!--pyreon-app-->` slot). */
      appHtml: string
      /** Head tags, with the styler tag already prepended when non-empty. */
      head: string
      /** `<script>window.__PYREON_LOADER_DATA__=…</script>` or `''`. */
      loaderScript: string
      /** 404 when the router resolved via the `notFoundComponent` fallback. */
      status: 200 | 404
      /**
       * Source-module ids (`component._hmrId`) of the matched chain's lazy
       * components — the SSG plugin maps these onto the client manifest for
       * per-route `<link rel=modulepreload>`. Empty for non-lazy chains.
       */
      routeModules: string[]
    }

/**
 * Render one page to composable parts. See the module docstring for what
 * belongs here vs in the callers.
 *
 * Runs the WHOLE sequence — including `router.preload` — inside
 * `runWithRequestContext`, matching the production handler's semantic
 * (loaders observe per-request context/store isolation). A preload
 * rejection that is not a `redirect()` rethrows to the caller's error
 * handling (handler → 500, SSG → `errors[]`, dev → Vite error overlay).
 */
export async function renderPage(
  App: ComponentFn,
  router: RenderablePageRouter,
  path: string,
  options: RenderPageOptions = {},
): Promise<RenderPageResult> {
  return runWithRequestContext(async () => {
    if (options.locals) provideRequestLocals(options.locals)

    try {
      await router.preload(
        path,
        options.request,
        options.skipLoaders === true ? { skipLoaders: true } : undefined,
      )
    } catch (err) {
      const info = getRedirectInfo(err)
      if (info) {
        return { kind: 'redirect' as const, from: path, to: info.url, status: info.status }
      }
      throw err
    }

    const resolved = router.currentRoute()
    if (
      options.bailOnUnmatched === true
      && (!resolved?.matched || resolved.matched.length === 0)
    ) {
      return { kind: 'unmatched' as const }
    }
    const status: 200 | 404 = resolved?.isNotFound === true ? 404 : 200

    const app = h(
      RouterProvider as unknown as ComponentFn,
      { router } as never,
      h(App, null),
    )
    const { html: appHtml, head } = await renderWithHead(app)

    // Styler (or any CSS-in-JS) tag goes BEFORE @pyreon/head's tags so the
    // cascade orders correctly against user-added <style>/<link> tags. An
    // empty tag (`...></style>`) is skipped — no styler in use.
    const styleTag = options.collectStyles ? options.collectStyles() : ''
    const styleIsEmpty = !styleTag || styleTag.indexOf('></style>') !== -1
    const finalHead = styleIsEmpty ? head : `${styleTag}\n${head}`

    const loaderData = serializeLoaderData(router as never)
    const loaderScript
      = loaderData && Object.keys(loaderData).length > 0
        ? `<script>window.__PYREON_LOADER_DATA__=${stringifyLoaderData(loaderData)}</script>`
        : ''

    const routeModules = (resolved?.matched ?? [])
      .map((r) => (r.component as { _hmrId?: unknown } | undefined)?._hmrId)
      .filter((id): id is string => typeof id === 'string')

    return {
      kind: 'html' as const,
      appHtml,
      head: finalHead,
      loaderScript,
      status,
      routeModules,
    }
  })
}
