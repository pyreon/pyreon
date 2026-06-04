import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'
import { stageClientThenServer } from './stage'
import { validateBuildInputs } from './validate'
import { warnMissingEnv } from './warn-missing-env'

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
      if (options.kind === 'ssg') {
        // PR J — SSG branch. Emit Vercel Build Output API v3 STATIC
        // variant: `.vercel/output/config.json` listing routes config
        // for the prerendered dist; no functions (every page is
        // already static). Vercel's deployer reads this config + the
        // built dist content as the static asset root — no runtime SSR.
        //
        // We do NOT copy files into `.vercel/output/static/` — the
        // standard Vercel CLI deploy flow detects the dist root
        // automatically. Adapters that move files break user-side
        // post-build steps (sourcemap upload, perf scripts, custom
        // asset handling). Writing config.json alone is the
        // minimum-impact signal "this is a prerendered site".
        const { writeFile, mkdir } = await import('node:fs/promises')
        const { join } = await import('node:path')
        const vercelDir = join(options.outDir, '.vercel', 'output')
        await mkdir(vercelDir, { recursive: true })
        const config = {
          version: 3,
          routes: [
            // Long-cache hashed assets; mirrors the SSR config above.
            {
              src: `/${options.assetsDir ?? 'assets'}/(.*)`,
              headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
            },
          ],
        }
        await writeFile(join(vercelDir, 'config.json'), JSON.stringify(config, null, 2))
        return
      }
      await validateBuildInputs(options)
      const { writeFile, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const vercelDir = join(options.outDir, '.vercel', 'output')
      const staticDir = join(vercelDir, 'static')
      const funcDir = join(vercelDir, 'functions', 'ssr.func')

      await mkdir(staticDir, { recursive: true })
      await mkdir(funcDir, { recursive: true })

      // Stage client → .vercel/output/static and server → the function dir.
      // clientOutDir === outDir, so static/ is a subtree of the client source;
      // `stageClientThenServer` per-entry-copies the client in (auto-preserving
      // the server bundle) to avoid a copy-into-self EINVAL. See stage.ts.
      await stageClientThenServer(options, { clientDest: staticDir, serverDest: funcDir })

      // Generate serverless function entry.
      //
      // Pre-fix the handler dynamically imported \`./entry-server.js\` on
      // EVERY invocation. Node's module cache makes calls after the
      // first one near-free, but the FIRST request on every fresh
      // serverless instance (i.e. every cold start) paid the full
      // module evaluation cost inside the request budget — observable
      // as a TTFB spike on cold starts. Hoisting the import to module
      // scope evaluates the SSR module once at function-init time,
      // before the first request lands.
      //
      // Also surface SSR errors to Vercel function logs via
      // \`console.error\` (mirrors the cloudflare + netlify fix). Pre-fix
      // an unhandled SSR throw propagated to Vercel's launcher (which
      // logs it generically); adding our own prefix makes the cause
      // trivially greppable in the dashboard log stream.
      const funcEntry = `
import handler from "./entry-server.js"

export default async function vercelHandler(req) {
  try {
    return await handler(req)
  } catch (err) {
    console.error("[Pyreon SSR] handler failed:", err)
    return new Response("Internal Server Error", { status: 500 })
  }
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
            src: `/${options.assetsDir ?? 'assets'}/(.*)`,
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
    async revalidate(path: string): Promise<AdapterRevalidateResult> {
      // Vercel ISR API — POST to a deployment-relative
      // revalidation endpoint with a secret token. Reads
      // `VERCEL_DEPLOYMENT_URL` (auto-injected by Vercel runtime) and
      // `VERCEL_REVALIDATE_TOKEN` (user-set in dashboard) from env.
      // Mirrors Next.js's `res.revalidate()` shape — a HEAD request
      // with the path + token, Vercel rebuilds the page in the
      // background and serves stale-while-revalidate to subsequent
      // visitors until the rebuild lands.
      //
      // No `regenerated: true` until Vercel acks 200 — partial-purge
      // behaviour (the platform queues the regenerate but doesn't
      // confirm it landed) is documented as a "false-positive
      // possible" caveat in the Adapter.revalidate JSDoc.
      const deploymentUrl = process.env.VERCEL_DEPLOYMENT_URL ?? process.env.VERCEL_URL
      const token = process.env.VERCEL_REVALIDATE_TOKEN
      if (!deploymentUrl || !token) {
        // M2.4 — warn even in production (dedupe per process). Pre-fix the
        // warn was DEV-gated, but production is exactly where missing env
        // vars surface — CMS triggers revalidate, nothing happens, no
        // signal. Now the FIRST call always warns; subsequent calls dedupe.
        const missing: string[] = []
        if (!deploymentUrl) missing.push('VERCEL_DEPLOYMENT_URL (or VERCEL_URL)')
        if (!token) missing.push('VERCEL_REVALIDATE_TOKEN')
        return warnMissingEnv(
          'vercel',
          missing,
          'Set the token in Vercel project settings → Environment Variables. VERCEL_DEPLOYMENT_URL / VERCEL_URL is auto-injected by the Vercel runtime.',
        )
      }
      const protocol = deploymentUrl.startsWith('http') ? '' : 'https://'
      const url = `${protocol}${deploymentUrl}/api/_pyreon-revalidate?path=${encodeURIComponent(path)}&secret=${encodeURIComponent(token)}`
      try {
        const res = await fetch(url, { method: 'POST' })
        return { regenerated: res.ok }
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[Pyreon] vercelAdapter.revalidate(${path}) failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        return { regenerated: false }
      }
    },
  }
}
