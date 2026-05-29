import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'
import { validateBuildInputs } from './validate'
import { warnMissingEnv } from './warn-missing-env'

/**
 * Cloudflare Pages adapter — generates output for Cloudflare Pages with Functions.
 *
 * Produces:
 * - Client assets in the output directory root (served as static)
 * - `_worker.js` — Cloudflare Pages Function for SSR
 *
 * Note: Cloudflare Pages Functions have a ~1MB module size limit.
 * For large apps, configure Vite's SSR build to bundle server code:
 * `ssr: { noExternal: true }` in vite.config.ts.
 *
 * Deploy with: `npx wrangler pages deploy ./dist`
 *
 * @example
 * ```ts
 * // zero.config.ts
 * import { defineConfig } from "@pyreon/zero"
 *
 * export default defineConfig({
 *   adapter: "cloudflare",
 * })
 * ```
 */
export function cloudflareAdapter(): Adapter {
  return {
    name: 'cloudflare',
    async build(options: AdapterBuildOptions) {
      if (options.kind === 'ssg') {
        // PR J — SSG branch. Emit Cloudflare Pages `_routes.json` with
        // `include: []` + `exclude: ['/*']` — i.e. "every URL is a
        // static asset, never invoke a Pages Function". Without this
        // file, Pages defaults to running the worker on every request,
        // which is wasteful for prerendered SSG output (and incurs
        // function-invocation costs on paid plans).
        //
        // Reference: https://developers.cloudflare.com/pages/functions/routing/
        // — `version: 1`, `include` lists URL globs that DO invoke the
        // function, `exclude` lists globs that bypass it. Setting
        // `include: []` makes the function unreachable; the result is
        // a pure-static deploy.
        //
        // Deploy with: `npx wrangler pages deploy ./dist`
        const { writeFile } = await import('node:fs/promises')
        const { join } = await import('node:path')
        const routesConfig = {
          version: 1,
          include: [] as string[],
          exclude: ['/*'],
        }
        await writeFile(join(options.outDir, '_routes.json'), JSON.stringify(routesConfig, null, 2))
        return
      }
      await validateBuildInputs(options)
      const { writeFile, cp, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const outDir = options.outDir
      await mkdir(outDir, { recursive: true })

      // Copy client assets to root (Cloudflare serves static files from root)
      await cp(options.clientOutDir, outDir, { recursive: true })

      // Copy server build
      await cp(join(options.serverEntry, '..'), join(outDir, '_server'), {
        recursive: true,
      })

      // Generate Cloudflare Pages _worker.js (ES module format).
      //
      // Static assets are handled by Cloudflare Pages itself via the
      // asset binding (Cloudflare's CDN serves files from the dist
      // root before invoking the worker). The pre-fix harness had an
      // \`if (ext && ...) { /* comment */ }\` block here computing an
      // \`ext\` variable and checking a condition with an EMPTY body —
      // pure dead code that did nothing at runtime. Removed for
      // clarity.
      const workerEntry = `
import handler from "./_server/entry-server.js"

export default {
  async fetch(request, env, ctx) {
    try {
      return await handler(request)
    } catch (err) {
      // Surface the error to Cloudflare Tail logs so production
      // crashes give real diagnostic info — pre-fix the catch
      // swallowed \`err\` entirely and the operator saw only a
      // bare "Internal Server Error" with no stack, no message,
      // no path. Logging via \`console.error\` is the standard
      // Workers logging surface (lands in \`wrangler tail\` + the
      // Cloudflare dashboard log stream).
      console.error("[Pyreon SSR] handler failed:", err)
      return new Response("Internal Server Error", { status: 500 })
    }
  },
}
`.trimStart()

      await writeFile(join(outDir, '_worker.js'), workerEntry)

      // Cloudflare Pages config — _routes.json for routing
      const routesConfig = {
        version: 1,
        include: ['/*'],
        exclude: ['/assets/*', '/favicon.*', '/site.webmanifest', '/robots.txt', '/sitemap.xml'],
      }

      await writeFile(join(outDir, '_routes.json'), JSON.stringify(routesConfig, null, 2))
    },
    async revalidate(path: string): Promise<AdapterRevalidateResult> {
      // Cloudflare Pages ISR via Cache API delete + zone purge.
      // Reads `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` from env
      // (set in Workers / Pages dashboard → Variables). The zone
      // purge endpoint accepts a list of URLs and removes them from
      // every PoP's edge cache; the next visitor triggers a fresh
      // origin fetch which rebuilds the prerendered page.
      //
      // Reference: https://developers.cloudflare.com/api/operations/zone-purge
      const zoneId = process.env.CLOUDFLARE_ZONE_ID
      const apiToken = process.env.CLOUDFLARE_API_TOKEN
      const siteUrl = process.env.CLOUDFLARE_SITE_URL
      if (!zoneId || !apiToken || !siteUrl) {
        // M2.4 — warn even in production (dedupe per process). See vercel.ts
        // for the rationale.
        const missing: string[] = []
        if (!zoneId) missing.push('CLOUDFLARE_ZONE_ID')
        if (!apiToken) missing.push('CLOUDFLARE_API_TOKEN')
        if (!siteUrl) missing.push('CLOUDFLARE_SITE_URL')
        return warnMissingEnv(
          'cloudflare',
          missing,
          'Set them in Cloudflare Pages dashboard → Settings → Environment Variables. Note: Cloudflare imposes a 1000-purge-per-24h rate limit per zone — high-frequency revalidation will hit it.',
        )
      }
      const fullUrl = `${siteUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
      try {
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ files: [fullUrl] }),
          },
        )
        return { regenerated: res.ok }
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[Pyreon] cloudflareAdapter.revalidate(${path}) failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        return { regenerated: false }
      }
    },
  }
}
