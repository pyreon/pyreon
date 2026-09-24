/**
 * The platform wrapper every EDGE deploy (Vercel Edge, Netlify Edge, Deno)
 * puts in front of the edge server bundle.
 *
 * Two files, because ES modules evaluate their imports in order, depth-first:
 * `init` runs to completion before the server bundle's module body — so the
 * globals it sets are in place when `createServer → readBuiltTemplate` runs
 * at module-eval, with no top-level `await` and no dynamic `import()` (both
 * of which some edge runtimes restrict).
 *
 *  - `globalThis.AsyncLocalStorage` — the edge bundle's `node:async_hooks`
 *    stub bridges to it (see `edgeNodeBuiltinsPlugin`). It is the ONE Node
 *    API imported here, and every supported edge runtime provides it.
 *  - `globalThis.__PYREON_SSR_TEMPLATE__` — edge runtimes have no
 *    filesystem, so the built template (hashed client entry + CSS) is
 *    inlined, exactly as the Cloudflare adapter does.
 */
export function renderEdgeInit(templateHtml: string): string {
  return `import { AsyncLocalStorage } from "node:async_hooks"

globalThis.AsyncLocalStorage ??= AsyncLocalStorage
globalThis.__PYREON_SSR_TEMPLATE__ = ${JSON.stringify(templateHtml)}
`
}

/** Name of the init module the wrapper imports first. */
export const EDGE_INIT_FILE = '_pyreon-edge-init.js'

/**
 * The handler body shared by every edge wrapper: forward the Web `Request`,
 * log a failure under a greppable prefix, answer 500.
 */
export const EDGE_HANDLER_BODY = `  try {
    return await handler(request)
  } catch (err) {
    console.error("[Pyreon SSR] handler failed:", err)
    return new Response("Internal Server Error", { status: 500 })
  }`
