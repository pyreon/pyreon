/**
 * SSR / ISR build hook for `@pyreon/zero`.
 *
 * Activates when `mode: "ssr"` or `mode: "isr"` is set in zero's config.
 * After Vite's client build finishes, this plugin:
 *
 *   1. Detects an existing user-authored `src/entry-server.ts`. If
 *      present, the user owns the SSR entry (their custom middleware
 *      `securityHeaders()` / `cacheMiddleware()` / `varyEncoding()` etc.
 *      reaches the runtime) — the plugin uses that file as the entry.
 *   2. Otherwise materializes a synthetic SSR entry to disk that wires
 *      `createServer({ routes, routeMiddleware, apiRoutes })` from
 *      zero's `virtual:zero/*` modules — the canonical 6-line shape
 *      most consumers hand-write.
 *   3. Triggers a programmatic Vite SSR sub-build producing
 *      `dist/server/entry-server.js`. The recursive build is gated by
 *      its own per-mode env flag (`PYREON_ZERO_SSR_INNER_BUILD`) so it
 *      can never collide with SSG's flag (`PYREON_ZERO_SSG_INNER_BUILD`).
 *   4. Invokes the configured adapter's `build()` with `kind: 'ssr'`,
 *      handing it `serverEntry` + `clientOutDir` + `outDir` so platform
 *      adapters (vercel/cloudflare/netlify) can wrap the server bundle
 *      into a deployable serverless function.
 *
 * Before this plugin, SSR/ISR builds produced ONLY the client bundle.
 * The user's `src/entry-server.ts` was never compiled to a deployable
 * `dist/server/entry-server.js`, and `Adapter.build({ kind: 'ssr' })`
 * was implemented for all 6 adapters but never invoked from any
 * production code path. Same typed-but-unimplemented bug class the
 * SSG plugin closed in PR-J for SSG mode.
 *
 * **Build-only.** Declares `apply: 'build'` so it's never instantiated
 * during `vite dev` — runtime SSR (dev mode) is handled by the main
 * plugin's `configureServer` middleware, which doesn't need a bundle.
 *
 * **No-op for SSG / SPA.** `closeBundle` early-returns when
 * `config.mode !== 'ssr' && config.mode !== 'isr'`. SSG has its own
 * plugin (`ssg-plugin.ts`); SPA needs no SSR bundle.
 *
 * **Synthetic-vs-user-entry contract.** The synthetic entry mirrors
 * `examples/ssr-showcase/src/entry-server.ts`:
 *
 *     import { routes } from "virtual:zero/routes"
 *     import { routeMiddleware } from "virtual:zero/route-middleware"
 *     import { apiRoutes } from "virtual:zero/api-routes"
 *     import { createServer } from "@pyreon/zero/server"
 *     export default createServer({ routes, routeMiddleware, apiRoutes })
 *
 * It does NOT carry user-authored middleware, custom `ssr.mode`
 * overrides, or `actions: { corsOrigins }` config — those require
 * a hand-written `src/entry-server.ts`. The plugin's `existsSync`
 * check picks that file up automatically so the user pays the synthetic
 * cost only when they haven't authored one.
 */

import { existsSync } from 'node:fs'
import { copyFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { BuildOptions, Plugin } from 'vite'
import { resolveAdapter } from './adapters'
import { resolveConfig } from './config'
import { buildSsrBundle, materializeEntry, renderSsrEntrySource } from './ssr-build-shared'
import type { ZeroConfig } from './types'

/**
 * Per-mode flag namespace eliminates the cross-mode flag-leak failure
 * class — the SSR plugin's recursive sub-build must NOT trigger the
 * SSG plugin's hook, and vice-versa. Each plugin owns its own gate.
 */
const SSR_BUILD_FLAG = 'PYREON_ZERO_SSR_INNER_BUILD'

/**
 * Filename for the synthetic entry materialized at the project root.
 * Double-underscore prefix avoids any chance of colliding with user
 * route files (which never start with `__`).
 */
const SSR_ENTRY_FILENAME = '__pyreon-zero-ssr-entry.js'

/**
 * Canonical output path for the SSR bundle. Matches the contract
 * `adapters/validate.ts` expects when called with `kind: 'ssr'` —
 * `validateBuildInputs` verifies `serverEntry` exists, so the filename
 * must agree with what adapters look for.
 *
 * `entry-server.js` (NOT `.mjs`) because `@pyreon/zero`'s
 * `package.json` declares `"type": "module"` — Pyreon convention is
 * that `.js` IS ESM. The SSG plugin uses `.mjs` for its private
 * intermediate bundle (loaded via dynamic `import()` from the
 * outer-process file URL — the `.mjs` extension is informational
 * there, not contractual). Adapters consume the SSR bundle externally
 * so the user-facing convention wins.
 */
const SSR_OUTPUT_FILENAME = 'entry-server.js'

/**
 * Output subdirectory under `dist/` where the SSR bundle lands.
 * Sibling of the client assets so deploy adapters can pick both up
 * from one tree.
 */
const SSR_OUT_SUBDIR = 'server'

/**
 * Plugin that builds the production SSR/ISR bundle when
 * `mode: "ssr" | "isr"` is configured. Wires into Vite's `closeBundle`
 * hook so it runs once after the main client build completes. The
 * recursive SSR sub-build is gated by a per-mode env flag so it can
 * never re-trigger inside itself or collide with the SSG flag.
 */
export function ssrPlugin(userConfig: ZeroConfig = {}): Plugin {
  const config = resolveConfig(userConfig)
  let root = ''
  let distDir = ''
  // Captured from the OUTER build's resolved config so the inner SSR
  // sub-build (which runs `configFile: false`) emits assets identically.
  // See `buildInnerBuildOptions` / `ssg-plugin.ts`.
  let assetsInlineLimit: BuildOptions['assetsInlineLimit']
  let assetsDir: string | undefined
  // USER plugins captured for forwarding into the inner SSR sub-build.
  // See `ssg-plugin.ts` userPlugins doc + `buildSsrBundle`'s userPlugins
  // option for the filtering rules. Same propagation pattern keeps SSR
  // and SSG modes consistent.
  let userPlugins: readonly Plugin[] = []
  // Capture inner-build state once at plugin instantiation. The inner
  // build re-loads zero's plugin chain (same as SSG); without this gate
  // the inner plugin instance would re-enter its own closeBundle.
  // Mirrors `ssg-plugin.ts:1028`.
  const isInnerBuild = process.env[SSR_BUILD_FLAG] === '1'

  return {
    name: 'pyreon-zero-ssr',
    apply: 'build',
    enforce: 'post',

    configResolved(resolved) {
      root = resolved.root
      distDir = resolve(root, resolved.build.outDir)
      assetsInlineLimit = resolved.build.assetsInlineLimit
      assetsDir = resolved.build.assetsDir
      userPlugins = resolved.plugins as readonly Plugin[]
    },

    async closeBundle() {
      // SSR/ISR-only. SPA / SSG fall through to no-op (SPA needs no
      // bundle; SSG has its own plugin).
      if (config.mode !== 'ssr' && config.mode !== 'isr') return
      if (isInnerBuild) return

      // Sanity check — without a client build there's no asset
      // manifest for the adapter to wrap. Most likely cause: user is
      // running `vite build --ssr` directly, in which case this plugin
      // shouldn't be active anyway.
      const clientOutDir = distDir
      const indexHtmlPath = join(clientOutDir, 'index.html')
      if (!existsSync(indexHtmlPath)) {
        // oxlint-disable-next-line no-console
        console.warn(
          `[zero:ssr] Skipping SSR build — ${indexHtmlPath} not found. Did the client build complete?`,
        )
        return
      }

      const ssrOutDir = join(distDir, SSR_OUT_SUBDIR)
      const serverEntry = join(ssrOutDir, SSR_OUTPUT_FILENAME)

      // User-authored `src/entry-server.ts` precondition. When the user
      // ships their own SSR entry (with custom middleware,
      // `ssr.mode: 'stream'` overrides, action `corsOrigins` config),
      // the plugin uses THAT file as the build entry. The synthetic
      // version only fires when no user file exists — keeping the
      // zero-config path frictionless without overwriting consumer
      // intent.
      const userEntryPath = join(root, 'src', 'entry-server.ts')
      const userEntryExists = existsSync(userEntryPath)
      const entryPath = userEntryExists
        ? userEntryPath
        : join(root, SSR_ENTRY_FILENAME)

      // Materialize the synthetic entry only when the user hasn't
      // authored one. The synthetic delegates to `createServer({
      // routes, routeMiddleware, apiRoutes })` via the shared
      // dispatcher — locale-baking is SSG-only (the SSR entry's
      // mode dispatch via `wireRenderMode` doesn't need it).
      if (!userEntryExists) {
        await materializeEntry(entryPath, renderSsrEntrySource({ kind: config.mode, locales: [] }))
      }

      try {
        await buildSsrBundle({
          root,
          entryPath,
          outDir: ssrOutDir,
          outputFilename: SSR_OUTPUT_FILENAME,
          envFlag: SSR_BUILD_FLAG,
          userConfig,
          assetsInlineLimit,
          assetsDir,
          userPlugins,
        })
      } catch (buildError) {
        // Surface with structured context — mode + entry + output +
        // cause — so failures are diagnosable without diffing build
        // logs against the plugin source.
        const cause = buildError instanceof Error ? buildError.message : String(buildError)
        // oxlint-disable-next-line no-console
        console.error(
          `[zero:ssr] SSR bundle build failed (mode: "${config.mode}", entry: "${entryPath}", out: "${serverEntry}"): ${cause}`,
        )
        throw buildError
      } finally {
        // Clean up the synthetic entry — ONLY if WE created it. A
        // user-authored `src/entry-server.ts` must never be removed.
        if (!userEntryExists) {
          try {
            await rm(entryPath, { force: true })
          } catch {
            // best-effort cleanup
          }
        }
      }

      // Verify the SSR bundle actually landed. Vite's `build()` will
      // throw on failure (caught above) but a misconfigured Rolldown
      // pipeline can theoretically resolve without emitting the
      // requested entry — fail loud with the expected path so the
      // diagnosis points at the build config, not at the adapter.
      if (!existsSync(serverEntry)) {
        // oxlint-disable-next-line no-console
        console.warn(
          `[zero:ssr] SSR build did not produce ${serverEntry} — skipping adapter.build()`,
        )
        return
      }

      // Production SSR template: copy the built client index.html (which
      // carries the hashed `<script>` + CSS `<link>` + injection
      // placeholders) next to the server bundle as `template.html`.
      // `createServer` reads it at runtime as the production template +
      // suppresses the dev client-entry injection (see entry-server.ts:
      // readBuiltTemplate). Every deploy adapter copies the whole server
      // dir, so it travels to node/bun/vercel/netlify/cloudflare alike.
      // Without it the handler ships DEFAULT_TEMPLATE + "/src/entry-client.ts"
      // → the page server-renders but 404s on hydration. Done BEFORE
      // adapter.build so the staging copies it along. Non-fatal on failure
      // (the handler falls back to its defaults).
      try {
        await copyFile(indexHtmlPath, join(ssrOutDir, 'template.html'))
      } catch (templateError) {
        // oxlint-disable-next-line no-console
        console.warn(
          `[zero:ssr] Could not stage production template (${
            templateError instanceof Error ? templateError.message : String(templateError)
          }) — SSR will fall back to the default template + dev client entry.`,
        )
      }

      // Invoke the configured adapter with the canonical SSR shape.
      // `validateBuildInputs` (called by each adapter's `build()`)
      // verifies the paths exist before copying — see
      // `adapters/validate.ts`. Adapter throws are caught + reported
      // so a buggy adapter can't hide the successful SSR bundle from
      // CI; the bundle is still on disk at `serverEntry`.
      const adapter = resolveAdapter(config)
      try {
        await adapter.build({
          kind: 'ssr',
          serverEntry,
          clientOutDir,
          outDir: distDir,
          config,
          assetsDir,
        })
      } catch (adapterError) {
        const cause
          = adapterError instanceof Error ? adapterError.message : String(adapterError)
        // oxlint-disable-next-line no-console
        console.error(
          `[zero:ssr] Adapter "${adapter.name}" failed: ${cause}`,
        )
        // Do NOT rethrow — the SSR bundle landed successfully and is
        // usable by hand-deploys / alternate pipelines. An adapter
        // bug shouldn't block the bundle.
      }

      // oxlint-disable-next-line no-console
      console.log(
        `[zero:ssr] Built ${serverEntry} [adapter: ${adapter.name}]${userEntryExists ? ' (using src/entry-server.ts)' : ' (synthetic entry)'}`,
      )
    },
  } satisfies Plugin
}

// ─── Test exports ─────────────────────────────────────────────────────────────
//
// Internal helpers exposed for unit tests. Not part of the public API.

export const _internal = {
  SSR_BUILD_FLAG,
  SSR_ENTRY_FILENAME,
  SSR_OUTPUT_FILENAME,
  SSR_OUT_SUBDIR,
}
