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
import { parseFileRoutes, scanRouteFiles } from './fs-router'
import type { ZeroConfig } from './types'

// Marker env var used to skip the SSG hook on the recursive SSR sub-build —
// the SSR pass loads the same vite config + same plugin chain, so without
// this guard the SSG hook would re-trigger an infinite build loop.
const SSG_BUILD_FLAG = 'PYREON_ZERO_SSG_INNER_BUILD'

// Synthetic SSR entry source. Imports the user's route tree via the virtual
// module that zero's main plugin already registers, then exports a default
// `(path: string) => Promise<string>` renderer that returns the full HTML
// for a single path.
//
// The entry is materialized to disk (not registered as a virtual module)
// because Rolldown's `rollupOptions.input` phase doesn't reliably resolve
// `\0`-prefixed virtual ids when used as build entries — a virtual id
// returned from `resolveId` works fine for downstream imports but fails
// the entry-resolution stage with `Cannot resolve entry module`.
//
// We do NOT use zero's `createServer` because it wraps the user's App with
// a router whose URL is baked in at App-creation time. SSG needs a fresh
// router per path, so we mirror the dev SSR pipeline (`renderSsr` in
// vite-plugin.ts): per request → new createApp({ url: path }) → preload
// loaders → renderWithHead → serialize loader data → done.
const SSR_ENTRY_SOURCE = `
import { routes } from "virtual:zero/routes"
import { h } from "@pyreon/core"
import { renderWithHead } from "@pyreon/head/ssr"
import { serializeLoaderData } from "@pyreon/router"
import { runWithRequestContext } from "@pyreon/runtime-server"
import { createApp } from "@pyreon/zero/server"

export default async function renderPath(path) {
  const { App, router } = createApp({
    routes,
    routerMode: "history",
    url: path,
  })

  await router.preload(path)

  return runWithRequestContext(async () => {
    const app = h(App, null)
    const { html: appHtml, head } = await renderWithHead(app)
    const loaderData = serializeLoaderData(router)
    const hasData = loaderData && Object.keys(loaderData).length > 0
    const loaderScript = hasData
      ? \`<script>window.__PYREON_LOADER_DATA__=\${JSON.stringify(loaderData).replace(/<\\//g, "<\\\\/")}</script>\`
      : ""
    return { appHtml, head, loaderScript }
  })
}
`.trimStart()

const SSR_ENTRY_FILENAME = '__pyreon-zero-ssg-entry.js'

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

      // Materialize the SSR entry to disk inside the routes directory so
      // its imports resolve relative to the user's source tree. Doing this
      // INSIDE node_modules-equivalent paths breaks Vite's plugin-resolution
      // semantics; placing it next to the user's routes lets zero's main
      // plugin pick it up identically to user code. Cleaned up after the
      // build.
      const entryPath = join(root, SSR_ENTRY_FILENAME)
      await writeFile(entryPath, SSR_ENTRY_SOURCE, 'utf-8')

      // Vite's programmatic build API. Loaded lazily so the plugin doesn't
      // pull `vite` into the runtime dep graph at module-evaluation time.
      const { build } = await import('vite')

      // Inner SSR sub-build. Re-assembles zero's plugin chain plus
      // `@pyreon/vite-plugin` (JSX compiler) — every Pyreon app already
      // has both because zero is built on top of pyreon. Loading both
      // lazily keeps the SSG plugin off the module-eval critical path.
      // Env-flag gate prevents the inner ssgPlugin instance from
      // re-triggering itself.
      process.env[SSG_BUILD_FLAG] = '1'
      try {
        const [{ zeroPlugin }, pyreonModule] = await Promise.all([
          import('./vite-plugin'),
          import('@pyreon/vite-plugin'),
        ])
        const pyreon = (pyreonModule as { default: () => unknown }).default

        await build({
          root,
          mode: 'production',
          logLevel: 'error',
          configFile: false,
          publicDir: false,
          plugins: [pyreon(), zeroPlugin(userConfig)] as Plugin[],
          resolve: { conditions: ['bun'] },
          build: {
            ssr: entryPath,
            outDir: ssrOutDir,
            emptyOutDir: true,
            target: 'esnext',
            rollupOptions: {
              input: entryPath,
              output: {
                format: 'es',
                entryFileNames: 'entry-server.mjs',
              },
              external: [/^node:/],
            },
          },
        })
      } finally {
        delete process.env[SSG_BUILD_FLAG]
        // Remove the synthetic entry file so it never lands in user's
        // working tree.
        try {
          await rm(entryPath, { force: true })
        } catch {
          // best-effort cleanup
        }
      }

      // Load the built renderer. Use a file:// URL to avoid Node import
      // cache collisions across multiple builds within the same process.
      const handlerPath = join(ssrOutDir, 'entry-server.mjs')
      if (!existsSync(handlerPath)) {
        // oxlint-disable-next-line no-console
        console.warn(`[zero:ssg] SSR build did not produce ${handlerPath} — skipping prerender`)
        return
      }
      // The path is computed at runtime from a freshly-built SSR artifact
      // — Vite's `dynamic-import-vars` plugin can't statically analyze the
      // import. Without the `@vite-ignore` hint, Vite emits a console
      // warning on every consumer's dev server boot ("The above dynamic
      // import cannot be analyzed by Vite"), which looks alarming but is
      // expected here. Suppress per Vite's own recommendation.
      const handlerMod = (await import(/* @vite-ignore */ pathToFileURL(handlerPath).href)) as {
        default: (path: string) => Promise<{ appHtml: string; head: string; loaderScript: string }>
      }
      const renderPath = handlerMod.default

      // Read the user's built index.html template. Vite has just produced it
      // with hashed asset URLs (`/assets/index-XYZ.js`), preload links, etc.
      // We inject the rendered head/body/loader-data into placeholder
      // comments — same convention as zero's dev SSR. If the template lacks
      // the placeholders, we fall back to inserting before `</head>` and
      // `</body>` respectively so a bare `index.html` still works.
      const template = await readFile(indexHtmlPath, 'utf-8')

      // Resolve paths and render.
      const routesDir = join(root, 'src', 'routes')
      const paths = await resolvePaths(config, routesDir)

      if (paths.length === 0) {
        // oxlint-disable-next-line no-console
        console.warn('[zero:ssg] No static paths to prerender — set ssg.paths in zero config')
        await rm(ssrOutDir, { recursive: true, force: true })
        return
      }

      let pages = 0
      const errors: { path: string; error: unknown }[] = []
      const start = Date.now()

      for (const p of paths) {
        try {
          const result = await Promise.race([
            renderPath(p),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Prerender timeout for "${p}" (30s)`)), 30_000),
            ),
          ])

          // Inject into the index.html template. Prefer Pyreon's standard
          // placeholders; fall back to <head>/<body>/<#app> insertion
          // points so apps with a minimal `<div id="app"></div>` template
          // still render content.
          let html = template
          if (html.includes('<!--pyreon-head-->')) {
            html = html.replace('<!--pyreon-head-->', result.head)
          } else if (result.head) {
            html = html.replace('</head>', `${result.head}</head>`)
          }
          if (html.includes('<!--pyreon-app-->')) {
            html = html.replace('<!--pyreon-app-->', result.appHtml)
          } else if (result.appHtml) {
            // Drop the rendered HTML inside #app; if not found, append to body.
            const appDivMatch = html.match(/<div\s+id=["']app["']\s*>([\s\S]*?)<\/div>/)
            if (appDivMatch) {
              html = html.replace(appDivMatch[0], `<div id="app">${result.appHtml}</div>`)
            } else {
              html = html.replace('</body>', `<div id="app">${result.appHtml}</div></body>`)
            }
          }
          if (html.includes('<!--pyreon-scripts-->')) {
            html = html.replace('<!--pyreon-scripts-->', result.loaderScript)
          } else if (result.loaderScript) {
            html = html.replace('</body>', `${result.loaderScript}</body>`)
          }

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
  SSR_ENTRY_FILENAME,
}
