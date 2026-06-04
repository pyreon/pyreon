import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'
import { stageClientThenServer } from './stage'
import { validateBuildInputs } from './validate'
import { warnMissingEnv } from './warn-missing-env'

/**
 * Cloudflare Pages adapter — generates output for Cloudflare Pages with Functions.
 *
 * Produces:
 * - Client assets in the output directory root (served as static)
 * - `_worker.js` — Cloudflare Pages Function for SSR
 *
 * **Requires the `nodejs_compat` compatibility flag.** The SSR bundle imports
 * Node builtins (`node:async_hooks` for `runWithRequestContext` — instantiated
 * at module-eval, so without the flag the worker fails to START — and `node:fs`
 * for the template fallback). The create-zero cloudflare scaffold sets it
 * (`wrangler.toml: compatibility_flags = ["nodejs_compat"]`); a hand-rolled
 * deploy MUST set it in the Pages dashboard or wrangler.toml, or pass
 * `--compatibility-flags nodejs_compat` to `wrangler pages dev`.
 *
 * **workerd has no filesystem**, so this adapter inlines the built SSR template
 * (`dist/server/template.html`, with the hashed client entry) into
 * `globalThis.__PYREON_SSR_TEMPLATE__` in `_worker.js` and dynamic-imports the
 * handler — the global is set BEFORE `createServer → readBuiltTemplate` runs.
 * Without this, SSR would render but ship the dev `entry-client.ts` (the
 * `readFileSync` fallback can't reach a sibling on workerd) → no hydration.
 *
 * Note: Cloudflare Pages Functions have a ~1MB module size limit.
 * For large apps, configure Vite's SSR build to bundle server code:
 * `ssr: { noExternal: true }` in vite.config.ts.
 *
 * Deploy with: `npx wrangler pages deploy ./dist` (with `nodejs_compat` set).
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
        await writeFile(
          join(options.outDir, '_routes.json'),
          JSON.stringify(routesConfig, null, 2),
        )
        return
      }
      await validateBuildInputs(options)
      const { writeFile, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const outDir = options.outDir
      await mkdir(outDir, { recursive: true })

      // Cloudflare serves static files from the root, so the client stays where
      // the build left it (clientDest === outDir → the client stage no-ops);
      // the server build is copied into _server/.
      await stageClientThenServer(options, {
        clientDest: outDir,
        serverDest: join(outDir, '_server'),
      })

      // Cloudflare runs in workerd, NOT Node — there is no filesystem, so the
      // server bundle's `readBuiltTemplate()` can't `readFileSync` the staged
      // `_server/template.html`. Without the template, SSR renders but ships
      // the DEV `entry-client.ts` (no hashed script) → the page never
      // hydrates in production. Fix: read the staged template at build time
      // and inline it into a global the worker sets BEFORE importing the
      // handler; `readBuiltTemplate()` reads that global first (see
      // `entry-server.ts`). Empty/missing template → empty global → the
      // server falls back exactly as before (SSG-only builds, etc.).
      const { readFile } = await import('node:fs/promises')
      const builtTemplate = await readFile(
        join(outDir, '_server', 'template.html'),
        'utf-8',
      ).catch(() => '')

      // Generate Cloudflare Pages _worker.js (ES module format).
      //
      // Static assets are handled by Cloudflare Pages itself via the asset
      // binding (Cloudflare's CDN serves files from the dist root before
      // invoking the worker).
      //
      // The handler is DYNAMIC-imported: static `import` is hoisted above the
      // global assignment, so `entry-server.js` would evaluate `createServer`
      // → `readBuiltTemplate()` BEFORE the template global was set. A
      // top-level `await import(...)` after the assignment guarantees the
      // ordering (workerd supports top-level await in module workers).
      const workerEntry = `
globalThis.__PYREON_SSR_TEMPLATE__ = ${JSON.stringify(builtTemplate)}

const { default: handler } = await import("./_server/entry-server.js")

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
