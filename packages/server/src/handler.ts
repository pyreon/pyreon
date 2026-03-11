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

import type { ComponentFn } from "@pyreon/core"
import { h } from "@pyreon/core"
import { renderWithHead } from "@pyreon/head"
import {
  createRouter,
  prefetchLoaderData,
  type RouteRecord,
  RouterProvider,
  serializeLoaderData,
} from "@pyreon/router"
import { renderToStream, runWithRequestContext } from "@pyreon/runtime-server"
import { buildScripts, DEFAULT_TEMPLATE, processTemplate } from "./html"
import type { Middleware, MiddlewareContext } from "./middleware"

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
  mode?: "string" | "stream"
}

export function createHandler(options: HandlerOptions): (req: Request) => Promise<Response> {
  const {
    App,
    routes,
    template = DEFAULT_TEMPLATE,
    clientEntry = "/src/entry-client.ts",
    middleware = [],
    mode = "string",
  } = options

  return async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname + url.search

    // ── Middleware pipeline ────────────────────────────────────────────────────
    const ctx: MiddlewareContext = {
      req,
      url,
      path,
      headers: new Headers({ "Content-Type": "text/html; charset=utf-8" }),
      locals: {},
    }

    for (const mw of middleware) {
      const result = await mw(ctx)
      if (result instanceof Response) return result
    }

    // ── Per-request router ────────────────────────────────────────────────────
    const router = createRouter({ routes, mode: "history", url: path })

    return runWithRequestContext(async () => {
      try {
        // Pre-run loaders so data is available during render
        await prefetchLoaderData(router as never, path)

        // Build the VNode tree
        const app = h(RouterProvider, { router }, h(App, null))

        if (mode === "stream") {
          return renderStreamResponse(app, router, template, clientEntry, ctx.headers)
        }

        // ── String mode (default) ─────────────────────────────────────────────
        const { html: appHtml, head } = await renderWithHead(app)
        const loaderData = serializeLoaderData(router as never)
        const scripts = buildScripts(clientEntry, loaderData)
        const fullHtml = processTemplate(template, { head, app: appHtml, scripts })

        return new Response(fullHtml, { status: 200, headers: ctx.headers })
      } catch (err) {
        console.error("[pyreon/server] Render error:", err)
        return new Response("Internal Server Error", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
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
  template: string,
  clientEntry: string,
  extraHeaders: Headers,
): Promise<Response> {
  const loaderData = serializeLoaderData(router as never)
  const scripts = buildScripts(clientEntry, loaderData)

  // Split template around <!--pyreon-app-->
  const [beforeApp, afterApp] = template.split("<!--pyreon-app-->")
  if (!beforeApp || afterApp === undefined) {
    throw new Error("[pyreon/server] Template must contain <!--pyreon-app--> placeholder")
  }

  // Replace other placeholders in shell parts
  const shellHead = beforeApp.replace("<!--pyreon-head-->", "")
  const shellTail = afterApp.replace("<!--pyreon-scripts-->", scripts)

  const appStream = renderToStream(app)
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
        console.error("[pyreon/server] Stream render error:", err)
        // Emit an inline error indicator — status code is already sent (200)
        push(`<script>console.error("[pyreon/server] Stream render failed")</script>`)
        push(shellTail)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: extraHeaders,
  })
}
