import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'
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
    async revalidate(path: string): Promise<AdapterRevalidateResult> {
      // Netlify ISR via Build Hook trigger. Reads
      // `NETLIFY_BUILD_HOOK_URL` from env (created in Site settings →
      // Build hooks). Posting to the hook triggers a partial rebuild
      // — Netlify rebuilds only the pages whose source has changed
      // since last deploy. The path arg is included as a `trigger_title`
      // for audit traceability in the Netlify deploy log; Netlify
      // doesn't accept per-path revalidation natively (the hook
      // re-runs the full build).
      //
      // Reference: https://docs.netlify.com/configure-builds/build-hooks/
      const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL
      if (!hookUrl) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[Pyreon] netlifyAdapter.revalidate() needs NETLIFY_BUILD_HOOK_URL env var. Create a build hook in Site settings → Build & deploy → Build hooks → Add build hook.',
          )
        }
        return { regenerated: false }
      }
      try {
        const triggerTitle = `revalidate:${path}`
        const res = await fetch(`${hookUrl}?trigger_title=${encodeURIComponent(triggerTitle)}`, {
          method: 'POST',
        })
        return { regenerated: res.ok }
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[Pyreon] netlifyAdapter.revalidate(${path}) failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        return { regenerated: false }
      }
    },
  }
}
