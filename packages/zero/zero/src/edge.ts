/**
 * `@pyreon/zero/edge` — the request-time server runtime WITHOUT the build
 * tooling `@pyreon/zero/server` also exports (Vite plugins, the route-file
 * parser, image/font/icon pipelines, TLS helpers).
 *
 * Edge runtimes (Vercel Edge, Netlify Edge, Deno) get a fully-bundled server:
 * every module the entry reaches must resolve and ship, so importing the
 * `/server` barrel would drag a native parser binding and `vite` itself into
 * the function. The edge sub-build therefore resolves `@pyreon/zero/server`
 * to THIS module — a `src/entry-server.ts` that imports only what is listed
 * here works unchanged on the edge; one that imports build tooling fails the
 * edge build with a missing-export error naming the symbol.
 *
 * @example
 * // src/entry-server.ts — runs on Node AND on the edge
 * import { routes } from "virtual:zero/routes"
 * import { createServer } from "@pyreon/zero/server"
 * export default createServer({ routes })
 */
export type { CreateAppOptions } from './app'
export { createApp } from './app'
export type { CreateServerOptions } from './entry-server'
export { createServer } from './entry-server'
export type { ISRCacheEntry, ISRStore } from './isr'
export { createISRHandler, createMemoryStore } from './isr'
export { compose, getContext } from './middleware'
export { render404Page } from './not-found'
