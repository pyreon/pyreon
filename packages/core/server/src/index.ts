/**
 * @pyreon/server — SSR, SSG, and island architecture for Pyreon.
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

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/server
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export type { HandlerOptions } from './handler'
// SSR handler
export { createHandler } from './handler'
export type { CompiledTemplate, TemplateData } from './html'
// HTML template
export {
  buildScripts,
  compileTemplate,
  DEFAULT_TEMPLATE,
  processCompiledTemplate,
  processTemplate,
} from './html'
export type { HydrationStrategy, IslandMeta, IslandOptions } from './island'
// Islands
export { island } from './island'

// Middleware
export type { Middleware, MiddlewareContext } from './middleware'
export { provideRequestLocals, useRequestLocals } from './middleware'
// Shared string-mode page renderer (handler + zero SSG + zero dev SSR)
export type {
  RenderablePageRouter,
  RenderPageOptions,
  RenderPageResult,
} from './render-page'
export { renderPage } from './render-page'
// Server islands (Phase 4) — marker component + client activation are on
// the client-safe `/client` subentry; the fragment RENDERER is server-only.
export type { FragmentResult } from './server-island-render'
export { renderServerIslandFragment } from './server-island-render'
export type { RegisteredServerIsland, ServerIslandOptions } from './server-island'
export { getRegisteredServerIslands, serverIsland, _resetServerIslands } from './server-island'
export type { PrerenderOptions, PrerenderResult } from './ssg'
// SSG
export { prerender } from './ssg'
