/**
 * SSR request handler.
 *
 * Creates a Web-standard `(Request) => Promise<Response>` handler that:
 *   1. Runs middleware (auth, redirects, headers, etc.)
 *   2. Creates a per-request router with the matched URL
 *   3. Prefetches loader data for matched routes
 *   4. Renders the app to HTML with head tag collection
 *   5. Injects everything into an HTML template
 *   6. Returns a Response
 *
 * Compatible with Bun.serve, Deno.serve, Cloudflare Workers,
 * Express (via adapter), and any Web-standard server.
 *
 * @example
 * import { createHandler } from "@pyreon/server"
 *
 * const handler = createHandler({
 *   App,
 *   routes,
 *   template: await Bun.file("index.html").text(),
 * })
 *
 * Bun.serve({ fetch: handler })
 */

import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { renderWithHead } from '@pyreon/head/ssr'
import {
  createRouter,
  getRedirectInfo,
  prefetchLoaderData,
  type RouteRecord,
  RouterProvider,
  serializeLoaderData,
} from '@pyreon/router'
import { renderToStream, runWithRequestContext } from '@pyreon/runtime-server'
import {
  buildClientEntryTag,
  buildScriptsFast,
  type CompiledTemplate,
  compileTemplate,
  DEFAULT_TEMPLATE,
  processCompiledTemplate,
} from './html'
import type { Middleware, MiddlewareContext } from './middleware'
import { provideRequestLocals } from './middleware'

const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

export interface HandlerOptions {
  /** Root application component */
  App: ComponentFn
  /** Route definitions */
  routes: RouteRecord[]
  /**
   * HTML template with placeholders:
   *   <!--pyreon-head-->     — head tags (title, meta, link, etc.)
   *   <!--pyreon-app-->      — rendered app HTML
   *   <!--pyreon-scripts-->  — client entry + loader data
   *
   * Defaults to a minimal HTML5 template.
   */
  template?: string
  /** Path to the client entry module (default: "/src/entry-client.ts") */
  clientEntry?: string
  /** Middleware chain — runs before rendering */
  middleware?: Middleware[]
  /**
   * Rendering mode:
   *   "string" (default) — full renderToString, complete HTML in one response
   *   "stream" — progressive streaming via renderToStream (Suspense out-of-order)
   */
  mode?: 'string' | 'stream'
  /**
   * Collect CSS styles after rendering. Called after renderToString/renderWithHead.
   * Return a `<style>` tag string to inject into `<head>`.
   * Used by @pyreon/styler's sheet.getStyleTag() to prevent FOUC in SSG.
   *
   * @example
   * import { sheet } from '@pyreon/styler'
   * createHandler({
   *   collectStyles: () => {
   *     const tag = sheet.getStyleTag()
   *     sheet.reset()
   *     return tag
   *   },
   * })
   */
  collectStyles?: () => string
  /**
   * Per-boundary Suspense timeout in milliseconds, forwarded to
   * `renderToStream` for `mode: 'stream'` deploys. Defaults to 30_000
   * (30s). Set lower (5_000–10_000) for tight-SLA user-facing apps
   * where the fallback is preferable to a delayed render; set to
   * `Infinity` to disable the timeout entirely for renders that
   * legitimately need long async work (exports / reports / scheduled
   * jobs). Ignored in `mode: 'string'` (no Suspense streaming).
   *
   * Values ≤0 or `NaN` fall back to the default.
   */
  suspenseTimeoutMs?: number
}

export function createHandler(options: HandlerOptions): (req: Request) => Promise<Response> {
  const {
    App,
    routes,
    template = DEFAULT_TEMPLATE,
    clientEntry = '/src/entry-client.ts',
    middleware = [],
    mode = 'string',
    collectStyles,
    suspenseTimeoutMs,
  } = options

  // Pre-compile once at handler creation — avoids 3x string scan per request
  const compiled = compileTemplate(template)
  const clientEntryTag = buildClientEntryTag(clientEntry)

  return async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname + url.search

    // ── Middleware pipeline ────────────────────────────────────────────────────
    const ctx: MiddlewareContext = {
      req,
      url,
      path,
      headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }),
      locals: {},
    }

    for (const mw of middleware) {
      const result = await mw(ctx)
      if (result instanceof Response) return result
    }

    // ── PR-S6: HTTP method gating ───────────────────────────────────────────
    // Middleware (API routes, server actions, user middleware) gets first
    // crack at any method — middleware that handles its own POST / PUT /
    // DELETE / OPTIONS preflight short-circuits above. Anything that
    // FALLS THROUGH to this point is bound for the SSR render pipeline,
    // which only renders HTML for GET / HEAD. The gate here rejects
    // other methods with HTTP 405 + `Allow` (so misconfigured POST /
    // PUT clients get a useful response — instead of pre-PR-S6 where
    // loaders fired on POST and produced confusing 500s on side-effect
    // expectations), AND handles bare OPTIONS with 204 + `Allow` so
    // generic OPTIONS probes don't fall through to render.
    //
    // HEAD is allowed through — the renderer runs normally and the
    // response is body-stripped at the bottom. Loaders still fire so
    // preflight cache-warming works. Standard HTTP semantic.
    const method = req.method
    if (method !== 'GET' && method !== 'HEAD') {
      if (method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: { Allow: 'GET, HEAD, OPTIONS' },
        })
      }
      return new Response(null, {
        status: 405,
        headers: { Allow: 'GET, HEAD, OPTIONS' },
      })
    }

    // ── Per-request router ────────────────────────────────────────────────────
    const router = createRouter({ routes, mode: 'history', url: path })

    return runWithRequestContext(async () => {
      try {
        // Bridge middleware locals → Pyreon context system so components
        // can access per-request data (CSP nonce, auth user, etc.)
        provideRequestLocals(ctx.locals)

        // Pre-run loaders so data is available during render. Forward the
        // incoming request so loaders can read cookies / auth headers and
        // `throw redirect('/login')` BEFORE the layout renders. A thrown
        // redirect propagates here and is converted to a 302/307 in the
        // catch below.
        await prefetchLoaderData(router as never, path, req)

        // Build the VNode tree
        const app = h(RouterProvider, { router }, h(App, null))

        if (mode === 'stream') {
          // Pass through `req.signal` so an upstream abort (client disconnect,
          // request timeout, parent AbortController) propagates into the
          // streaming render: pending Suspense boundaries are cancelled and
          // their post-resolve enqueues are skipped instead of buffering work
          // for a consumer that already hung up. Closes the AbortSignal wire
          // end-to-end (renderToStream gained `{ signal }` in #745).
          // PR-S6: read `isNotFound` synchronously here (before streaming
          // starts) so the stream response carries the right HTTP status.
          // The flag is set by router.resolve in the per-request createRouter
          // above, so it's authoritative by this point — pre-PR-S6 streaming
          // always emitted status 200, defeating the L5 router-driven 404
          // path for streaming consumers.
          const streamResolved = router.currentRoute() as { isNotFound?: boolean }
          const streamStatus = streamResolved?.isNotFound === true ? 404 : 200
          return renderStreamResponse(
            app,
            router,
            compiled,
            clientEntryTag,
            ctx.headers,
            req.signal,
            suspenseTimeoutMs,
            streamStatus,
            method === 'HEAD',
          )
        }

        // ── String mode (default) ─────────────────────────────────────────────
        const { html: appHtml, head } = await renderWithHead(app)

        // Collect CSS-in-JS styles if a collector was provided.
        // The consumer passes collectStyles (e.g. sheet.getStyleTag from @pyreon/styler)
        // to inject scoped CSS into <head> and prevent FOUC in SSG pages.
        const styleTag = collectStyles ? collectStyles() : ''

        const loaderData = serializeLoaderData(router as never)
        const scripts = buildScriptsFast(clientEntryTag, loaderData)
        const headWithStyles = styleTag ? `${styleTag}\n${head}` : head
        const fullHtml = processCompiledTemplate(compiled, { head: headWithStyles, app: appHtml, scripts })

        // M1.2 — Status 404 when the matched chain resolved via the
        // `notFoundComponent` fallback (PR L5). The router's
        // `resolveRoute` sets `isNotFound: true` when no leaf matched
        // and a parent layout's `notFoundComponent` was used as a
        // synthetic leaf. Reading the flag after render lets the
        // handler emit a real HTTP 404 while still serving the
        // chrome-wrapped 404 HTML.
        const resolved = router.currentRoute() as { isNotFound?: boolean }
        const status = resolved?.isNotFound === true ? 404 : 200
        // PR-S6: HEAD requests must return the same headers + status
        // as the corresponding GET but with NO body. The renderer ran
        // (loaders fire, head/scripts compute, status decided) and the
        // body is stripped here. Matches the standard HTTP semantic.
        if (method === 'HEAD') {
          return new Response(null, { status, headers: ctx.headers })
        }
        return new Response(fullHtml, { status, headers: ctx.headers })
      } catch (err) {
        // `redirect()` thrown from a loader — convert to a real HTTP redirect
        // before the SSR error path runs. Done inside the runWithRequestContext
        // try so per-request locals (CSP nonce, auth state) flush correctly.
        const info = getRedirectInfo(err)
        if (info) {
          return new Response(null, {
            status: info.status,
            headers: { Location: info.url },
          })
        }
        if (__DEV__) {
          console.error('[Pyreon Server] SSR render failed:', err)
        }
        return new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        })
      }
    })
  }
}

/**
 * Streaming mode: shell is emitted immediately, app content streams progressively.
 *
 * Head tags from the initial synchronous render are included in the shell.
 * Suspense boundaries resolve out-of-order via inline <template> + swap scripts.
 */
async function renderStreamResponse(
  app: ReturnType<typeof h>,
  router: ReturnType<typeof createRouter>,
  compiled: CompiledTemplate,
  clientEntryTag: string,
  extraHeaders: Headers,
  signal?: AbortSignal,
  suspenseTimeoutMs?: number,
  // PR-S6: status decided by the caller (`router.currentRoute().isNotFound`
  // resolved synchronously at handler time, before streaming starts). Defaults
  // to 200 for source-compatible callers. Pre-PR-S6 the stream response
  // hard-coded `status: 200`, defeating the L5 router-driven 404 path.
  status: number = 200,
  // PR-S6: HEAD requests must NOT have a body. The render still runs
  // (loaders fire, head/scripts compute) but the stream isn't connected
  // to the response. Returning `new Response(null, …)` short-circuits
  // body production entirely — saves the body-buffering cost and matches
  // the standard HTTP semantic.
  isHead: boolean = false,
): Promise<Response> {
  const loaderData = serializeLoaderData(router as never)
  const scripts = buildScriptsFast(clientEntryTag, loaderData)

  // Use pre-split parts: [before-head, between-head-app, between-app-scripts, after-scripts]
  const [p0, p1, p2, p3] = compiled.parts
  const shellHead = p0 + p1
  const shellTail = p2 + scripts + p3

  // Forward the upstream request's abort signal AND the Suspense
  // timeout config so renderToStream can (a) skip post-resolve
  // Suspense enqueues when the consumer disconnects, (b) honor the
  // ops-controlled per-boundary timeout. Both options are only
  // included when defined, so unconfigured deploys land on
  // renderToStream's defaults byte-identically.
  const streamOptions: { signal?: AbortSignal; suspenseTimeoutMs?: number } = {}
  if (signal !== undefined) streamOptions.signal = signal
  if (suspenseTimeoutMs !== undefined) streamOptions.suspenseTimeoutMs = suspenseTimeoutMs
  const appStream
    = Object.keys(streamOptions).length > 0
      ? renderToStream(app, streamOptions)
      : renderToStream(app)
  const reader = appStream.getReader()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const push = (s: string) => controller.enqueue(encoder.encode(s))

      try {
        push(shellHead)

        // Stream app content
        let done = false
        while (!done) {
          const result = await reader.read()
          done = result.done
          if (result.value) push(result.value)
        }

        push(shellTail)
      } catch (err) {
        // Defensive: catastrophic stream-level failure (rare; the SSR pipeline
        // emits its own error markup for component-level errors). Status code
        // is already 200 by the time we get here so we can only emit an
        // inline error script and close the body. Branch is intentionally
        // hard to exercise from tests without mocking `reader.read()`.
        /* v8 ignore start */
        if (__DEV__) {
          console.error('[Pyreon Server] Stream render failed:', err)
        }
        push(`<script>console.error("[pyreon/server] Stream render failed")</script>`)
        push(shellTail)
        /* v8 ignore stop */
      } finally {
        controller.close()
      }
    },
  })

  // PR-S6: HEAD short-circuits body production — the stream wasn't
  // attached, the response carries headers + status only.
  if (isHead) {
    return new Response(null, {
      status,
      headers: extraHeaders,
    })
  }

  return new Response(stream, {
    status,
    headers: extraHeaders,
  })
}
