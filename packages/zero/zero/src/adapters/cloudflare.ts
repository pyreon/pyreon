import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'
import { validateBuildInputs } from './validate'

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

      // Generate Cloudflare Pages _worker.js (ES module format)
      const workerEntry = `
import handler from "./_server/entry-server.js"

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // Let Cloudflare serve static assets (files with extensions)
    // This check is a fallback — Pages routes static files automatically
    const ext = url.pathname.split(".").pop()
    if (ext && ext !== url.pathname && !url.pathname.endsWith("/")) {
      // Cloudflare Pages handles static assets automatically via its asset binding
      // Only reach here if the file doesn't exist — fall through to SSR
    }

    // SSR handler
    try {
      return await handler(request)
    } catch (err) {
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
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[Pyreon] cloudflareAdapter.revalidate() needs CLOUDFLARE_ZONE_ID + CLOUDFLARE_API_TOKEN + CLOUDFLARE_SITE_URL env vars. Set them in Cloudflare Pages dashboard → Settings → Environment Variables.',
          )
        }
        return { regenerated: false }
      }
      const fullUrl = `${siteUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
      try {
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
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
