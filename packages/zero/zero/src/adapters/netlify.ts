import type { Adapter, AdapterBuildOptions } from '../types'
import { validateBuildInputs } from './validate'

/**
 * Netlify adapter — generates output for Netlify Functions (v2).
 *
 * Produces:
 * - Client assets in `publish/` directory
 * - `netlify/functions/ssr.mjs` — Netlify Function for SSR
 * - `netlify.toml` — routing configuration
 *
 * @example
 * ```ts
 * // zero.config.ts
 * import { defineConfig } from "@pyreon/zero"
 *
 * export default defineConfig({
 *   adapter: "netlify",
 * })
 * ```
 */
export function netlifyAdapter(): Adapter {
  return {
    name: 'netlify',
    async build(options: AdapterBuildOptions) {
      await validateBuildInputs(options)
      const { writeFile, cp, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const outDir = options.outDir
      const publishDir = join(outDir, 'publish')
      const functionsDir = join(outDir, 'netlify', 'functions')

      await mkdir(publishDir, { recursive: true })
      await mkdir(functionsDir, { recursive: true })

      // Copy client assets to publish/
      await cp(options.clientOutDir, publishDir, { recursive: true })

      // Copy server build to functions directory
      await cp(join(options.serverEntry, '..'), join(functionsDir, '_server'), {
        recursive: true,
      })

      // Generate Netlify Function (v2 format — ESM, Web-standard Request/Response)
      const funcEntry = `
import handler from "./_server/entry-server.js"

export default async function(req, context) {
  try {
    return await handler(req)
  } catch (err) {
    return new Response("Internal Server Error", { status: 500 })
  }
}

export const config = {
  path: "/*",
  preferStatic: true,
}
`.trimStart()

      await writeFile(join(functionsDir, 'ssr.mjs'), funcEntry)

      // Generate netlify.toml
      const toml = `
[build]
  publish = "publish"
  functions = "netlify/functions"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[redirects]]
  from = "/*"
  to = "/.netlify/functions/ssr"
  status = 200
  conditions = {Role = ["admin", "user", ""]}
`.trimStart()

      await writeFile(join(outDir, 'netlify.toml'), toml)
    },
  }
}
