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

import { h } from "@pyreon/core"
import type { ComponentFn } from "@pyreon/core"
import { renderToString, renderToStream, runWithRequestContext } from "@pyreon/runtime-server"
import {
  createRouter,
  RouterProvider,
  type RouteRecord,
  prefetchLoaderData,
  serializeLoaderData,
} from "@pyreon/router"
import { renderWithHead } from "@pyreon/head"
import type { Middleware, MiddlewareContext } from "./middleware"
import { processTemplate, buildScripts, DEFAULT_TEMPLATE } from "./html"

export interface HandlerOptions {
  /** Root application component */
  App: ComponentFn
  /** Route definitions */
  routes: RouteRecord[]
  /**
   * HTML template with placeholders:
   *   <!--nova-head-->     — head tags (title, meta, link, etc.)
   *   <!--nova-app-->      — rendered app HTML
   *   <!--nova-scripts-->  — client entry + loader data
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

  // Split template around <!--nova-app-->
  const [beforeApp, afterApp] = template.split("<!--nova-app-->")
  if (!beforeApp || afterApp === undefined) {
    throw new Error("[nova/server] Template must contain <!--nova-app--> placeholder")
  }

  // Replace other placeholders in shell parts
  const shellHead = beforeApp.replace("<!--nova-head-->", "")
  const shellTail = afterApp.replace("<!--nova-scripts-->", scripts)

  const appStream = renderToStream(app)
  const reader = appStream.getReader()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const push = (s: string) => controller.enqueue(encoder.encode(s))

      push(shellHead)

      // Stream app content
      let done = false
      while (!done) {
        const result = await reader.read()
        done = result.done
        if (result.value) push(result.value)
      }

      push(shellTail)
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: extraHeaders,
  })
}
