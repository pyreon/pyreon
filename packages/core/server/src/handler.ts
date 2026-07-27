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
import {
  createRouter,
  getRedirectInfo,
  type RouteRecord,
  RouterProvider,
  serializeLoaderData,
} from '@pyreon/router'
import { renderToStream, runWithRequestContext } from '@pyreon/runtime-server'
import { renderPage } from './render-page'
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
  /**
   * Path to the client entry module (default: "/src/entry-client.ts").
   *
   * Pass `false` to suppress the client-entry `<script>` injection entirely —
   * use this when `template` is a BUILT index.html that already carries the
   * production hashed `<script type="module" src="/assets/…">` tag (the
   * production SSR path). Loader-data injection still happens.
   */
  clientEntry?: string | false
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
   * Receives the per-request CSP nonce (or `undefined` at SSG/no-CSP) — forward
   * it to `sheet.getStyleTag(nonce)` so a strict `style-src 'nonce-…'` policy
   * admits the emitted `<style>`.
   *
   * @example
   * import { sheet } from '@pyreon/styler'
   * createHandler({
   *   collectStyles: (nonce) => {
   *     const tag = sheet.getStyleTag(nonce)
   *     sheet.reset()
   *     return tag
   *   },
   * })
   */
  collectStyles?: (nonce?: string) => string
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
  // `clientEntry: false` → no client-entry <script>.
  const clientEntryTag = clientEntry === false ? '' : buildClientEntryTag(clientEntry)

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

    // ── PR-S6: HTTP method gating ─────────────────────────────────────────── Middleware.
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

    if (mode === 'stream') {
      // Streaming keeps its own pipeline.
      return runWithRequestContext(async () => {
        try {
          provideRequestLocals(ctx.locals)
          // Resolve lazy COMPONENTS into the cache AND run loaders before the render.
          await router.preload(path, req)

          const app = h(RouterProvider, { router }, h(App, null))
          // Pass through `req.signal` so an upstream abort (client disconnect, request timeout.
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
        } catch (err) {
          const info = getRedirectInfo(err)
          if (info) {
            return new Response(null, {
              status: info.status,
              headers: { Location: info.url },
            })
          }
          if (process.env.NODE_ENV !== 'production') {
            console.error('[Pyreon Server] SSR render failed:', err)
          }
          return new Response('Internal Server Error', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
          })
        }
      })
    }

    // ── String mode (default).
    try {
      const result = await renderPage(App, router as never, path, {
        request: req,
        ...(collectStyles ? { collectStyles } : {}),
        locals: ctx.locals,
      })

      if (result.kind === 'redirect') {
        return new Response(null, {
          status: result.status,
          headers: { Location: result.to },
        })
      }
      // `bailOnUnmatched` not set → 'unmatched' is unreachable.
      if (result.kind === 'unmatched') {
        return new Response('Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        })
      }

      // Compose: loaderScript + client entry tag joined exactly as `buildScriptsFast` did.
      const scripts = result.loaderScript
        ? `${result.loaderScript}\n  ${clientEntryTag}`
        : clientEntryTag
      const fullHtml = processCompiledTemplate(compiled, {
        head: result.head,
        app: result.appHtml,
        scripts,
      })

      // PR-S6: HEAD requests must return the same headers + status as the corresponding GET.
      if (method === 'HEAD') {
        return new Response(null, { status: result.status, headers: ctx.headers })
      }
      return new Response(fullHtml, { status: result.status, headers: ctx.headers })
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Pyreon Server] SSR render failed:', err)
      }
      return new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      })
    }
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
  // PR-S6: status decided by the caller.
  status: number = 200,
  // PR-S6: HEAD requests must NOT have a body.
  isHead: boolean = false,
): Promise<Response> {
  const loaderData = serializeLoaderData(router as never)
  const scripts = buildScriptsFast(clientEntryTag, loaderData)

  // Use pre-split parts: [before-head, between-head-app, between-app-scripts, after-scripts]
  const [p0, p1, p2, p3] = compiled.parts
  const shellHead = p0 + p1
  const shellTail = p2 + scripts + p3

  // Forward the upstream request's abort signal AND the Suspense timeout config so renderToStream.
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
        // Defensive: catastrophic stream-level failure.
        /* v8 ignore start */
        if (process.env.NODE_ENV !== 'production') {
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

  // PR-S6: HEAD short-circuits body production.
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
