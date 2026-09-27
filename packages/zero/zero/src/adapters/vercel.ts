import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'
import { assetUrlPrefix } from './cache-headers'
import { VERCEL_ADAPTER_OUTPUT } from './contract'
import { patternToRegex } from './deploy-targets'
import { EDGE_HANDLER_BODY, EDGE_INIT_FILE, renderEdgeInit } from './edge-wrapper'
import { materialize, stageClientThenServer } from './stage'
import { validateBuildInputs } from './validate'
import { warnMissingEnv } from './warn-missing-env'

/**
 * Vercel adapter — generates output for Vercel's Build Output API v3.
 *
 * Produces a `.vercel/output` directory AT THE PROJECT ROOT
 * (`options.projectRoot`, NOT inside `outDir`) — Vercel only auto-detects
 * the Build Output API tree at `<projectRoot>/.vercel/output`, so staging
 * it under `dist/` (the pre-fix behaviour) left the SSR function
 * undiscoverable and dynamic routes 404'd in production. The tree holds:
 * - `static/` — client-side assets (JS, CSS, images); for SSG this is a
 *   copy of the prerendered dist.
 * - `functions/ssr.func/` — serverless function for SSR (SSR mode only).
 * - `config.json` — routing configuration (`version: 3`).
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import zero, { vercelAdapter } from "@pyreon/zero/server"
 *
 * export default {
 *   plugins: [pyreon(), zero({ adapter: vercelAdapter({ runtime: "nodejs22.x" }) })],
 * }
 * ```
 */
export interface VercelAdapterOptions {
  /**
   * Node.js runtime for the SSR function. Default: `'nodejs22.x'`.
   *
   * Was hardcoded to `nodejs20.x`; Node 20 reached end of life in April 2026,
   * and Vercel deprecates end-of-life runtimes. Set it explicitly to pin a
   * version your dependencies support.
   */
  runtime?: `nodejs${number}.x` | 'edge'
  /**
   * Node.js runtime for functions split out by `export const runtime =
   * 'nodejs'` when `runtime: 'edge'` is the default. Default: `'nodejs22.x'`.
   */
  nodeRuntime?: `nodejs${number}.x`
}

/**
 * The Build Output API `.vc-config.json` for an edge function. Vercel reads
 * `entrypoint` (NOT `handler`) for `runtime: 'edge'`.
 */
function edgeVcConfig(): string {
  return JSON.stringify({ runtime: 'edge', entrypoint: 'index.js' }, null, 2)
}

export function vercelAdapter(adapterOptions: VercelAdapterOptions = {}): Adapter {
  const runtime = adapterOptions.runtime ?? 'nodejs22.x'
  const nodeRuntime = runtime === 'edge' ? (adapterOptions.nodeRuntime ?? 'nodejs22.x') : runtime
  const defaultEdge = runtime === 'edge'
  return {
    name: 'vercel',
    capabilities: { edgeRoutes: true, edgeOnly: defaultEdge, nodeRoutes: true, schedules: true },
    async build(options: AdapterBuildOptions) {
      if (options.kind === 'ssg') {
        // PR J — SSG branch. Emit a Vercel Build Output API v3 STATIC
        // deploy at the PROJECT ROOT: `.vercel/output/config.json` +
        // `.vercel/output/static/` (a copy of the prerendered dist); no
        // functions (every page is already static). Vercel auto-detects
        // this tree only at `<projectRoot>` and serves `static/` as the
        // web root, applying `config.json`'s cache-header routes.
        //
        // We COPY the prerendered dist into `static/` (materialize copies,
        // never moves — the original `outDir` is preserved intact, so
        // `vite preview` and user-side post-build steps still work). The
        // pre-fix "write config.json alone, inside outDir" shape produced a
        // DEAD config (Vercel never reads `dist/.vercel/output`, only the
        // root), so its cache-header routes never applied.
        const { writeFile, mkdir } = await import('node:fs/promises')
        const { join } = await import('node:path')
        const vercelDir = join(options.projectRoot, ...VERCEL_ADAPTER_OUTPUT.outputDir.split('/'))
        const staticDir = join(vercelDir, 'static')
        await mkdir(staticDir, { recursive: true })
        // Stage the prerendered dist into static/. `ssgPlugin` removes its
        // internal SSR build (`.zero-ssg-server`) BEFORE calling the adapter,
        // so the copied tree holds only publishable output.
        await materialize(options.outDir, staticDir)
        const config = {
          version: 3,
          routes: [
            // Long-cache hashed assets; mirrors the SSR config above. Scoped to
            // `<base><assetsDir>` so subpath / custom-assetsDir deploys match.
            {
              src: `${assetUrlPrefix(options.config.base, options.assetsDir)}/(.*)`,
              headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
            },
          ],
        }
        await writeFile(join(vercelDir, 'config.json'), JSON.stringify(config, null, 2))
        return
      }
      await validateBuildInputs(options)
      const { writeFile, mkdir, readFile } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const vercelDir = join(options.projectRoot, ...VERCEL_ADAPTER_OUTPUT.outputDir.split('/'))
      const staticDir = join(vercelDir, 'static')
      const functionsDir = join(vercelDir, 'functions')
      const funcDir = join(functionsDir, `${VERCEL_ADAPTER_OUTPUT.functionName}.func`)
      const deploy = options.deploy

      await mkdir(staticDir, { recursive: true })
      await mkdir(funcDir, { recursive: true })

      // Stage client → <projectRoot>/.vercel/output/static and server → the
      // function dir. `.vercel/output` lives at the project root (a SIBLING of
      // `outDir`/`clientOutDir`), so the client stage is a disjoint copy;
      // `stageClientThenServer` preserves the `dist/server` subdir (now honored
      // in materialize's disjoint branch too) so the server bundle isn't swept
      // into the public static/ dir.
      await stageClientThenServer(options, { clientDest: staticDir, serverDest: funcDir })

      const edgeFunction = async (dir: string): Promise<void> => {
        if (options.edgeServerEntry === undefined) {
          throw new Error('[Pyreon] vercelAdapter: an edge function was requested but no edge server bundle was built.')
        }
        const edgeSrc = join(options.edgeServerEntry, '..')
        await materialize(edgeSrc, dir)
        const template = await readFile(join(edgeSrc, 'template.html'), 'utf-8').catch(() => '')
        await writeFile(join(dir, EDGE_INIT_FILE), renderEdgeInit(template))
        await writeFile(
          join(dir, 'index.js'),
          `import "./${EDGE_INIT_FILE}"
import handler from "./entry-server.js"

export default async function vercelEdgeHandler(request) {
${EDGE_HANDLER_BODY}
}
`,
        )
        await writeFile(join(dir, '.vc-config.json'), edgeVcConfig())
      }

      const nodeFunction = async (dir: string): Promise<void> => {
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
        // \`console.error\` (mirrors the cloudflare + netlify fix).
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
        await writeFile(join(dir, 'index.js'), funcEntry)
        await writeFile(
          join(dir, '.vc-config.json'),
          JSON.stringify({ runtime: nodeRuntime, handler: 'index.js', launcherType: 'Nodejs' }, null, 2),
        )
      }

      // The default function serves every route; routes that declare the
      // OTHER runtime get their own function, routed before the catch-all.
      const splitRoutes: { pattern: string }[] = []
      let splitName: string | undefined
      if (defaultEdge) {
        // The server bundle staged above is the NODE build — the edge
        // function replaces it with the edge build.
        const { rm } = await import('node:fs/promises')
        await rm(funcDir, { recursive: true, force: true })
        await edgeFunction(funcDir)
        if (deploy && deploy.nodeRoutes.length > 0) {
          splitName = VERCEL_ADAPTER_OUTPUT.nodeFunctionName
          const nodeDir = join(functionsDir, `${splitName}.func`)
          await materialize(join(options.serverEntry, '..'), nodeDir)
          await nodeFunction(nodeDir)
          splitRoutes.push(...deploy.nodeRoutes)
        }
      } else {
        await nodeFunction(funcDir)
        if (deploy && deploy.edgeRoutes.length > 0) {
          splitName = VERCEL_ADAPTER_OUTPUT.edgeFunctionName
          await edgeFunction(join(functionsDir, `${splitName}.func`))
          splitRoutes.push(...deploy.edgeRoutes)
        }
      }

      // Vercel Build Output config
      const config: {
        version: 3
        routes: Record<string, unknown>[]
        crons?: { path: string; schedule: string }[]
      } = {
        version: 3,
        routes: [
          // Serve static assets directly (scoped to `<base><assetsDir>`).
          {
            src: `${assetUrlPrefix(options.config.base, options.assetsDir)}/(.*)`,
            headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
          },
          // Favicon and manifest
          { src: '/(favicon\\..*|site\\.webmanifest|robots\\.txt|sitemap\\.xml)', dest: '/$1' },
          // Routes declaring the non-default runtime → their own function.
          ...splitRoutes.map((r) => ({ src: patternToRegex(r.pattern), dest: `/${splitName}` })),
          // All other routes → SSR function
          { src: '/(.*)', dest: `/${VERCEL_ADAPTER_OUTPUT.functionName}` },
        ],
      }
      // `export const schedule` on API routes → Vercel Cron Jobs. Vercel
      // calls each `path` with GET on the UTC schedule.
      if (deploy && deploy.schedules.length > 0) {
        config.crons = deploy.schedules.map((c) => ({ path: c.path, schedule: c.schedule }))
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
