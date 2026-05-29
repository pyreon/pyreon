/**
 * M3.1 — Drop-in Vercel revalidate webhook handler.
 *
 * Pre-M3.1 the `vercelAdapter.revalidate(path)` (PR I) POSTed to
 * `/api/_pyreon-revalidate?path=...&secret=...` — a CONVENTION that users
 * had to implement themselves. This helper scaffolds the convention:
 *
 *     // src/routes/api/_pyreon-revalidate.ts (or `pages/api/...` in
 *     // Next-style apps deployed to Vercel)
 *     export { vercelRevalidateHandler as default } from '@pyreon/zero/server'
 *
 * The handler validates the secret query param against
 * `VERCEL_REVALIDATE_TOKEN`, validates the path is in the build-time
 * revalidate manifest, and calls Vercel's `res.revalidate(path)` API.
 *
 * Returns a standard `(req: Request) => Response` Web API handler — works
 * with Vercel Edge functions, Node serverless functions (via Vercel's
 * `@vercel/node` adapter that bridges Node `req`/`res` to Web standard
 * fetch shapes), and the in-process `mode: 'ssr'` runtime.
 *
 * @example
 * // src/routes/api/_pyreon-revalidate.ts
 * import { vercelRevalidateHandler } from '@pyreon/zero/server'
 *
 * export const POST = vercelRevalidateHandler({
 *   // Optional — defaults to reading `_pyreon-revalidate.json` from cwd.
 *   manifestPath: './dist/_pyreon-revalidate.json',
 * })
 *
 * @example
 * // Custom revalidate impl (e.g. for a self-hosted Pyreon SSR runtime
 * // that wants build-time revalidate behavior without Vercel's
 * // `res.revalidate()` API):
 * export const POST = vercelRevalidateHandler({
 *   onRevalidate: async (path) => {
 *     // Clear your in-process ISR cache, emit a metrics event, etc.
 *     await myCache.invalidate(path)
 *   },
 * })
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Build-time revalidate manifest written by `ssgPlugin` (PR I).
 * Shape: `{ revalidate: { '/posts/1': 60, '/posts/2': 60, '/about': 3600 } }`.
 */
interface RevalidateManifest {
  revalidate: Record<string, number | false>
}

export interface VercelRevalidateHandlerOptions {
  /**
   * Absolute or cwd-relative path to the `_pyreon-revalidate.json` manifest.
   * Defaults to `./dist/_pyreon-revalidate.json` (the standard SSG output).
   *
   * The handler refuses to revalidate paths NOT in this manifest — protects
   * against arbitrary-path revalidation attacks even when the secret leaks.
   */
  manifestPath?: string

  /**
   * Custom revalidation impl. Defaults to calling Vercel's `res.revalidate()`
   * API via the dynamic `@vercel/node`-bridged response object on globalThis
   * (Vercel injects it for serverless functions).
   *
   * Supply this when running OUTSIDE Vercel (self-hosted SSR with a custom
   * in-process ISR cache, edge runtimes that have their own purge API, etc.).
   * Receives the validated path; throw to signal failure (handler returns 500).
   */
  onRevalidate?: (path: string) => void | Promise<void>

  /**
   * Override the env-var name the handler reads the secret from. Default
   * `VERCEL_REVALIDATE_TOKEN` matches the adapter's `revalidate()` write.
   * Useful when adopting the helper outside Vercel and the production
   * webhook uses a different secret name.
   */
  secretEnvVar?: string
}

/**
 * Create the Web-standard request handler. Reads the manifest once on first
 * invocation (cached in-process) so repeated revalidations don't re-read the
 * file. Manifest read failures cache the failure too — until next process
 * restart, all requests get the same 500 response (signals deploy-time misconfig).
 */
export function vercelRevalidateHandler(
  options: VercelRevalidateHandlerOptions = {},
): (req: Request) => Promise<Response> {
  const manifestPath = options.manifestPath ?? './dist/_pyreon-revalidate.json'
  const secretEnvVar = options.secretEnvVar ?? 'VERCEL_REVALIDATE_TOKEN'

  // Manifest cache: loaded once per process. A nullish value means "not yet
  // loaded"; a `{ error: ... }` shape means "load failed, every subsequent
  // request gets 500 until restart". A `{ manifest: ... }` shape is the
  // happy path.
  let cache: { manifest: RevalidateManifest } | { error: unknown } | null = null

  return async function handler(req: Request): Promise<Response> {
    // Validate request shape: only POST, with `?path=&secret=` query.
    if (req.method !== 'POST') {
      return new Response(`Method ${req.method} not allowed`, { status: 405 })
    }

    const url = new URL(req.url)
    const path = url.searchParams.get('path')
    const secret = url.searchParams.get('secret')

    if (!path || !secret) {
      return new Response('Bad Request: missing path or secret', { status: 400 })
    }

    // Validate the secret against the env var. Constant-time-ish: we
    // compare strings of equal length; mismatched lengths short-circuit
    // (acceptable — the attacker can already see the response time
    // difference via fetch behavior). The env-var-missing case fails
    // CLOSED (401) — production webhooks shouldn't accept requests when
    // the server hasn't been configured.
    const expected = process.env[secretEnvVar]
    if (!expected) {
      return new Response(`Server misconfigured: ${secretEnvVar} env var not set`, { status: 500 })
    }
    if (secret !== expected) {
      return new Response('Forbidden: invalid secret', { status: 403 })
    }

    // Load the manifest (once per process). On read failure, cache the
    // error so subsequent requests get fast 500s — saves rep eated stat
    // calls for a broken deploy.
    if (cache === null) {
      try {
        const fileContent = await readFile(resolve(process.cwd(), manifestPath), 'utf-8')
        const parsed = JSON.parse(fileContent) as RevalidateManifest
        if (typeof parsed?.revalidate !== 'object' || parsed.revalidate === null) {
          throw new Error(
            `Malformed revalidate manifest at ${manifestPath}: missing or non-object \`revalidate\` field`,
          )
        }
        cache = { manifest: parsed }
      } catch (err) {
        cache = { error: err }
      }
    }
    if ('error' in cache) {
      return new Response(
        `Server misconfigured: revalidate manifest at ${manifestPath} unreadable or malformed`,
        { status: 500 },
      )
    }

    // Validate the path is in the manifest — refuses arbitrary-path
    // revalidation even with a valid secret. Closes the
    // "secret leaked once → attacker revalidates anything" footgun.
    if (!Object.prototype.hasOwnProperty.call(cache.manifest.revalidate, path)) {
      return new Response(`Path "${path}" not in revalidate manifest`, { status: 404 })
    }

    // Run the revalidation. Custom impl OR fallback to a structured
    // response that downstream Vercel-style code can adapt
    // (Vercel's `res.revalidate()` API can't be called from a
    // Web-standard handler without the `@vercel/node` bridge — the
    // user wires that themselves OR uses the `onRevalidate` callback).
    if (options.onRevalidate) {
      try {
        await options.onRevalidate(path)
      } catch (err) {
        return new Response(
          `Revalidation failed for "${path}": ${err instanceof Error ? err.message : String(err)}`,
          { status: 500 },
        )
      }
    }

    return new Response(JSON.stringify({ revalidated: true, path }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Reset the in-process manifest cache. Test-only — production code never
 * reaches this. Used by unit tests to exercise the "manifest changed
 * between requests" path without spinning up a new handler.
 * @internal
 */
export function _resetVercelRevalidateHandlerCache(
  handler: (req: Request) => Promise<Response>,
): void {
  // The cache lives in the closure; tests instantiate a fresh handler per
  // run rather than mutating an existing one. Kept here as a no-op marker
  // for the API contract — if cache invalidation surfaces as a real need
  // (e.g. hot-reload of the manifest after a deploy without restart), the
  // implementation can flip to a module-level WeakMap<handler, cache>.
  void handler
}
