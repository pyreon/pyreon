import type { Adapter, AdapterBuildOptions } from '../types'
import { validateBuildInputs } from './validate'

/**
 * Vercel adapter — generates output for Vercel's Build Output API v3.
 *
 * Produces a `.vercel/output` directory with:
 * - `static/` — client-side assets (JS, CSS, images)
 * - `functions/ssr.func/` — serverless function for SSR
 * - `config.json` — routing configuration
 *
 * @example
 * ```ts
 * // zero.config.ts
 * import { defineConfig } from "@pyreon/zero"
 *
 * export default defineConfig({
 *   adapter: "vercel",
 * })
 * ```
 */
export function vercelAdapter(): Adapter {
  return {
    name: 'vercel',
    async build(options: AdapterBuildOptions) {
      await validateBuildInputs(options)
      const { writeFile, cp, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const vercelDir = join(options.outDir, '.vercel', 'output')
      const staticDir = join(vercelDir, 'static')
      const funcDir = join(vercelDir, 'functions', 'ssr.func')

      await mkdir(staticDir, { recursive: true })
      await mkdir(funcDir, { recursive: true })

      // Copy client assets to static/
      await cp(options.clientOutDir, staticDir, { recursive: true })

      // Copy server build to function directory
      await cp(join(options.serverEntry, '..'), funcDir, { recursive: true })

      // Generate serverless function entry
      const funcEntry = `
export default async function handler(req) {
  const handler = (await import("./entry-server.js")).default
  return handler(req)
}
`.trimStart()

      await writeFile(join(funcDir, 'index.js'), funcEntry)

      // Function config
      await writeFile(
        join(funcDir, '.vc-config.json'),
        JSON.stringify(
          {
            runtime: 'nodejs20.x',
            handler: 'index.js',
            launcherType: 'Nodejs',
          },
          null,
          2,
        ),
      )

      // Vercel Build Output config
      const config = {
        version: 3,
        routes: [
          // Serve static assets directly
          {
            src: '/assets/(.*)',
            headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
          },
          // Favicon and manifest
          { src: '/(favicon\\..*|site\\.webmanifest|robots\\.txt|sitemap\\.xml)', dest: '/$1' },
          // All other routes → SSR function
          { src: '/(.*)', dest: '/ssr' },
        ],
      }

      await writeFile(join(vercelDir, 'config.json'), JSON.stringify(config, null, 2))
    },
  }
}
