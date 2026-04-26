/**
 * SSG (Static Site Generation) build hook for `@pyreon/zero`.
 *
 * Activates when `mode: "ssg"` is set in zero's config. After Vite's client
 * build finishes, this plugin:
 *
 *   1. Triggers a programmatic SSR build via Vite's `build()` API, producing
 *      a server bundle in `dist/.zero-ssg-server/` from a synthetic entry
 *      that imports `virtual:zero/routes` and `createServer`.
 *   2. Loads the built handler with dynamic `import()`.
 *   3. Resolves the path list from `config.ssg.paths` (string[], async fn,
 *      or auto-detected from the static-only routes in the route tree).
 *   4. Calls `prerender()` from `@pyreon/server` to render each path.
 *   5. Cleans up the temporary SSR build directory.
 *
 * Before this PR, `mode: "ssg"` and `ssg.paths` were typed in
 * `types.ts` but had no runtime implementation — the plugin file had zero
 * Rollup build hooks. Apps configured for SSG silently shipped a bare SPA
 * shell with no per-route HTML files, which broke direct-URL deploys to
 * static hosts (no `dist/<path>/index.html`, every URL falls back to the
 * SPA index).
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Plugin } from 'vite'
import { resolveConfig } from './config'
import { scanRouteFiles, parseFileRoutes } from './fs-router'
import type { ZeroConfig } from './types'

// Marker env var used to skip the SSG hook on the recursive SSR sub-build —
// the SSR pass loads the same vite config + same plugin chain, so without
// this guard the SSG hook would re-trigger an infinite build loop.
const SSG_BUILD_FLAG = 'PYREON_ZERO_SSG_INNER_BUILD'

// Synthetic SSR entry source. Imports the user's route tree via the virtual
// module that zero's main plugin already registers, then exports a default
// `(req: Request) => Promise<Response>` handler — the shape `prerender`
// expects. Kept inline so the plugin is fully self-contained; no template
// file to ship.
const SSR_ENTRY_SOURCE = `
import { routes } from "virtual:zero/routes"
import { routeMiddleware } from "virtual:zero/route-middleware"
import { apiRoutes } from "virtual:zero/api-routes"
import { createServer } from "@pyreon/zero/server"

export default createServer({
  routes,
  routeMiddleware,
  apiRoutes,
})
`.trimStart()

const SYNTHETIC_SSR_ID = '\0pyreon-zero-ssg-entry.js'

/**
 * Auto-detect static paths from the route tree. A "static" path is one with
 * NO dynamic segments (`[id]`, `[...rest]`). Dynamic routes are skipped
 * because we can't enumerate their values at build time without a
 * `getStaticPaths`-style API.
 */
async function autoDetectStaticPaths(routesDir: string): Promise<string[]> {
  // Routes dir missing → fall back to "/" anyway. A project that doesn't
  // expose routes via fs-routing (custom routes module, single-page app
  // shell, etc.) still needs at least an index.html so static hosts have
  // a default response. The user can always set explicit `ssg.paths` to
  // override this floor.
  if (!existsSync(routesDir)) return ['/']
  const files = await scanRouteFiles(routesDir)
  const fileRoutes = parseFileRoutes(files)

  // FileRoute is a FLAT list (no nested children) keyed by `urlPath`.
  // Dynamic segments compile to `:param` (e.g. `[id]` → `:id`) and
  // catch-alls to `*`. Skip any urlPath containing those — they need a
  // `getStaticPaths`-style API to enumerate concrete values, which Pyreon
  // doesn't ship yet.
  const out: string[] = []
  for (const r of fileRoutes) {
    if (r.isLayout || r.isError || r.isLoading || r.isNotFound) continue
    const path = r.urlPath
    if (!path) continue
    if (/[:*]/.test(path)) continue
    out.push(path)
  }

  // Always include "/" as a fallback if no static routes were found —
  // a project with only dynamic routes still needs an index.html for the
  // host to know where to send unmatched URLs.
  return out.length > 0 ? out : ['/']
}

async function resolvePaths(
  config: ZeroConfig,
  routesDir: string,
): Promise<string[]> {
  const explicit = config.ssg?.paths
  if (typeof explicit === 'function') {
    const result = await explicit()
    return Array.isArray(result) ? result : []
  }
  if (Array.isArray(explicit)) return explicit
  return autoDetectStaticPaths(routesDir)
}

function resolveOutputPath(distDir: string, path: string): string {
  if (path === '/') return join(distDir, 'index.html')
  if (path.endsWith('.html')) return join(distDir, path)
  return join(distDir, path, 'index.html')
}

/**
 * Plugin that performs SSG when `mode: "ssg"` is configured. Wires into
 * Vite's `closeBundle` hook so it runs once after the main client build
 * completes. The recursive SSR sub-build is gated by an env flag.
 */
export function ssgPlugin(userConfig: ZeroConfig = {}): Plugin {
  const config = resolveConfig(userConfig)
  let root = ''
  let distDir = ''
  // Track whether this plugin instance is running inside the inner SSR
  // sub-build (where it must be a no-op) vs. the outer client build.
  const isInnerBuild = process.env[SSG_BUILD_FLAG] === '1'

  return {
    name: 'pyreon-zero-ssg',
    apply: 'build',
    enforce: 'post',

    configResolved(resolved) {
      root = resolved.root
      distDir = resolve(root, resolved.build.outDir)
    },

    // Synthetic SSR entry — only resolved during the inner SSR build. The
    // outer client build never imports this id.
    resolveId(id) {
      if (id === SYNTHETIC_SSR_ID) return SYNTHETIC_SSR_ID
      return null
    },

    load(id) {
      if (id === SYNTHETIC_SSR_ID) return SSR_ENTRY_SOURCE
      return null
    },

    async closeBundle() {
      if (config.mode !== 'ssg') return
      if (isInnerBuild) return

      const ssrOutDir = join(distDir, '.zero-ssg-server')
      const indexHtmlPath = join(distDir, 'index.html')

      if (!existsSync(indexHtmlPath)) {
        // Client build hasn't produced index.html — nothing we can wrap.
        // Most likely: user is running `vite build --ssr` directly, in
        // which case this plugin shouldn't be active anyway.
        // oxlint-disable-next-line no-console
        console.warn(
          `[zero:ssg] Skipping SSG — ${indexHtmlPath} not found. Did the client build complete?`,
        )
        return
      }

      // Vite's programmatic build API. Loaded lazily so the plugin doesn't
      // pull `vite` into the runtime dep graph at module-evaluation time.
      const { build } = await import('vite')

      // Inner SSR sub-build. Uses the SAME zero plugin chain (so virtual
      // modules resolve identically), guarded by the env flag.
      process.env[SSG_BUILD_FLAG] = '1'
      try {
        // We import zero's vite-plugin lazily so the SSG plugin file
        // doesn't bring in the whole plugin module unless SSG actually runs.
        const { zeroPlugin } = await import('./vite-plugin')

        await build({
          root,
          mode: 'production',
          logLevel: 'error',
          configFile: false,
          publicDir: false,
          plugins: [zeroPlugin(userConfig)],
          resolve: { conditions: ['bun'] },
          build: {
            ssr: SYNTHETIC_SSR_ID,
            outDir: ssrOutDir,
            emptyOutDir: true,
            target: 'esnext',
            rollupOptions: {
              input: SYNTHETIC_SSR_ID,
              output: {
                format: 'es',
                entryFileNames: 'entry-server.mjs',
              },
              external: [
                /^node:/,
              ],
            },
          },
        })
      } finally {
        delete process.env[SSG_BUILD_FLAG]
      }

      // Load the built handler. Use a file:// URL to avoid Node import
      // cache collisions across multiple builds within the same process.
      const handlerPath = join(ssrOutDir, 'entry-server.mjs')
      if (!existsSync(handlerPath)) {
        // oxlint-disable-next-line no-console
        console.warn(`[zero:ssg] SSR build did not produce ${handlerPath} — skipping prerender`)
        return
      }
      const handlerMod = (await import(pathToFileURL(handlerPath).href)) as {
        default: (req: Request) => Promise<Response>
      }
      const handler = handlerMod.default

      // Read the client index.html template — used as the shell for any
      // path the handler returns as raw HTML body. Currently the zero
      // handler produces a complete document, so we just write it.
      // (Reserved for future template-merging if handler shape changes.)
      const _template = await readFile(indexHtmlPath, 'utf-8')

      // Resolve paths and render.
      const routesDir = join(root, 'src', 'routes')
      const paths = await resolvePaths(config, routesDir)

      if (paths.length === 0) {
        // oxlint-disable-next-line no-console
        console.warn('[zero:ssg] No static paths to prerender — set ssg.paths in zero config')
        await rm(ssrOutDir, { recursive: true, force: true })
        return
      }

      // Inline a minimal prerender — we can't import @pyreon/server here
      // without making zero depend on it as a runtime dep. Pyreon's `prerender`
      // is open-coded below to keep the dep graph clean.
      let pages = 0
      const errors: { path: string; error: unknown }[] = []
      const start = Date.now()

      for (const p of paths) {
        try {
          const url = new URL(p, 'http://localhost')
          const req = new Request(url.href)
          const res = await Promise.race([
            handler(req),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Prerender timeout for "${p}" (30s)`)), 30_000),
            ),
          ])

          if (!res.ok) {
            errors.push({ path: p, error: new Error(`HTTP ${res.status}`) })
            continue
          }

          const html = await res.text()
          const filePath = resolveOutputPath(distDir, p)

          // Path-traversal guard — same as @pyreon/server's prerender.
          const resolvedOut = resolve(distDir)
          if (!resolve(filePath).startsWith(resolvedOut)) {
            errors.push({ path: p, error: new Error(`Path traversal detected: "${p}"`) })
            continue
          }

          await mkdir(dirname(filePath), { recursive: true })
          await writeFile(filePath, html, 'utf-8')
          pages++
        } catch (error) {
          errors.push({ path: p, error })
        }
      }

      // Cleanup the SSR build artifacts — they're an implementation detail
      // and shouldn't ship to the static host.
      await rm(ssrOutDir, { recursive: true, force: true })

      const elapsed = Date.now() - start
      // oxlint-disable-next-line no-console
      console.log(
        `[zero:ssg] Prerendered ${pages} page(s) in ${elapsed}ms` +
          (errors.length > 0 ? ` (${errors.length} error(s))` : ''),
      )
      for (const { path: errPath, error } of errors) {
        // oxlint-disable-next-line no-console
        console.error(`[zero:ssg] Failed to prerender "${errPath}":`, error)
      }
    },
  } satisfies Plugin
}

// ─── Test exports ─────────────────────────────────────────────────────────────
//
// Internal helpers exposed for unit tests. Not part of the public API.

export const _internal = {
  resolvePaths,
  autoDetectStaticPaths,
  resolveOutputPath,
  SSR_ENTRY_SOURCE,
  SYNTHETIC_SSR_ID,
}
