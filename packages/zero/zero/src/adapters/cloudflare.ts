import type { Adapter, AdapterBuildOptions } from '../types'
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
  }
}
