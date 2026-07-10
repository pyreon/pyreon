import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'
import { assetUrlPrefix } from './cache-headers'
import { NETLIFY_ADAPTER_OUTPUT } from './contract'
import { stageClientThenServer } from './stage'
import { validateBuildInputs } from './validate'
import { warnMissingEnv } from './warn-missing-env'

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
 * import { defineConfig } from "@pyreon/zero/config"
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
      if (options.kind === 'ssg') {
        // PR J — SSG branch. Emit `netlify.toml` with `publish = "."`
        // (the dist root) and asset-cache headers — no functions. Tells
        // Netlify "this dist directory IS the publishable output, serve
        // it as a static site". Without this file, Netlify falls back
        // to whatever the user has at the repo root (might miss the
        // dist/ direct-upload shape).
        //
        // PR B's `dist/_redirects` (loader-redirect manifest) is
        // emitted by ssgPlugin BEFORE the adapter runs, so this branch
        // doesn't need to write it. The two files coexist cleanly —
        // Netlify reads both.
        const { writeFile } = await import('node:fs/promises')
        const { join } = await import('node:path')
        const toml = `[build]
  publish = "."

[[headers]]
  for = "${assetUrlPrefix(options.config.base, options.assetsDir)}/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
`
        await writeFile(join(options.outDir, 'netlify.toml'), toml)
        return
      }
      await validateBuildInputs(options)
      const { writeFile, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const outDir = options.outDir
      const publishDir = join(outDir, NETLIFY_ADAPTER_OUTPUT.publishDir)
      const functionsDir = join(outDir, ...NETLIFY_ADAPTER_OUTPUT.functionsDir.split('/'))

      await mkdir(publishDir, { recursive: true })
      await mkdir(functionsDir, { recursive: true })

      // Stage client → publish/ and server → netlify/functions/_server.
      // clientOutDir === outDir, so publish/ is a subtree of the client source;
      // `stageClientThenServer` per-entry-copies the client in (auto-preserving
      // the server bundle) to avoid a copy-into-self EINVAL. We also preserve
      // the sibling `netlify` functions dir so it isn't swept into publish/.
      await stageClientThenServer(options, {
        clientDest: publishDir,
        serverDest: join(functionsDir, NETLIFY_ADAPTER_OUTPUT.serverDir),
        preserve: ['netlify'],
      })

      // Generate Netlify Function (v2 format — ESM, Web-standard Request/Response).
      const funcEntry = `
import handler from "./${NETLIFY_ADAPTER_OUTPUT.serverDir}/entry-server.js"

export default async function(req, context) {
  try {
    return await handler(req)
  } catch (err) {
    // Surface the error to Netlify Function logs so production
    // crashes give real diagnostic info — pre-fix the catch
    // swallowed \`err\` entirely and the operator saw only a
    // bare "Internal Server Error". \`console.error\` lands in
    // Netlify's function runtime logs panel + \`netlify functions:log\`.
    console.error("[Pyreon SSR] handler failed:", err)
    return new Response("Internal Server Error", { status: 500 })
  }
}

export const config = {
  path: "/*",
  preferStatic: true,
}
`.trimStart()

      await writeFile(
        join(functionsDir, `${NETLIFY_ADAPTER_OUTPUT.functionName}.mjs`),
        funcEntry,
      )

      // Generate netlify.toml (relative to outDir — informational for
      // direct `netlify deploy --dir=dist` flows; a scaffolded repo's
      // ROOT netlify.toml is what Netlify's builds actually read, and
      // `@pyreon/create-zero` generates it from the same
      // NETLIFY_ADAPTER_OUTPUT contract, dist-prefixed).
      const toml = `
[build]
  publish = "${NETLIFY_ADAPTER_OUTPUT.publishDir}"
  functions = "${NETLIFY_ADAPTER_OUTPUT.functionsDir}"

[[headers]]
  for = "${assetUrlPrefix(options.config.base, options.assetsDir)}/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[redirects]]
  from = "/*"
  to = "/.netlify/functions/${NETLIFY_ADAPTER_OUTPUT.functionName}"
  status = 200
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
        // M2.4 — warn even in production (dedupe per process). See vercel.ts
        // for the rationale.
        return warnMissingEnv(
          'netlify',
          ['NETLIFY_BUILD_HOOK_URL'],
          'Create a build hook in Site settings → Build & deploy → Build hooks → Add build hook. Note: Netlify Build Hooks trigger a FULL site rebuild — the path arg is recorded as `trigger_title` for audit traceability but Netlify doesn\'t support per-page ISR natively.',
        )
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
