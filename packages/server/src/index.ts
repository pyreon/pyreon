/**
 * @pyreon/server — SSR, SSG, and island architecture for Nova.
 *
 * Server-side:
 *   import { createHandler, prerender, island } from "@pyreon/server"
 *
 * Client-side (tree-shakeable, separate entry):
 *   import { startClient, hydrateIslands } from "@pyreon/server/client"
 *
 * ## Quick start — SSR
 *
 * ```ts
 * // server.ts
 * import { createHandler } from "@pyreon/server"
 * import { App } from "./App"
 * import { routes } from "./routes"
 *
 * const handler = createHandler({
 *   App,
 *   routes,
 *   template: await Bun.file("index.html").text(),
 * })
 *
 * Bun.serve({ fetch: handler, port: 3000 })
 * ```
 *
 * ## Quick start — SSG
 *
 * ```ts
 * // build.ts
 * import { createHandler, prerender } from "@pyreon/server"
 *
 * const handler = createHandler({ App, routes })
 * const result = await prerender({
 *   handler,
 *   paths: ["/", "/about", "/blog"],
 *   outDir: "dist",
 * })
 * console.log(`Generated ${result.pages} pages in ${result.elapsed}ms`)
 * ```
 *
 * ## Quick start — Islands
 *
 * ```tsx
 * // Server
 * import { island } from "@pyreon/server"
 * const Counter = island(() => import("./Counter"), { name: "Counter" })
 *
 * // Client (entry-client.ts)
 * import { hydrateIslands } from "@pyreon/server/client"
 * hydrateIslands({ Counter: () => import("./Counter") })
 * ```
 */

// SSR handler
export { createHandler } from "./handler"
export type { HandlerOptions } from "./handler"

// SSG
export { prerender } from "./ssg"
export type { PrerenderOptions, PrerenderResult } from "./ssg"

// Islands
export { island } from "./island"
export type { IslandOptions, IslandMeta, HydrationStrategy } from "./island"

// Middleware
export type { Middleware, MiddlewareContext } from "./middleware"

// HTML template
export { processTemplate, buildScripts, DEFAULT_TEMPLATE } from "./html"
export type { TemplateData } from "./html"
