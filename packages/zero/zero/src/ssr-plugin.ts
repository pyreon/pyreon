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
// Per-mode flag namespaces (shared module — single source of truth for
// both plugins + `buildSsrBundle`; historically each plugin kept the
// other's literal in sync BY COMMENT). The SSR plugin's recursive
// sub-build must NOT trigger the SSG plugin's hook, and vice-versa.
// In `mode: 'ssr'|'isr'` the SSG plugin runs a nested prerender
// sub-build to `<dist>/.zero-ssg-server` (for static routes) — that
// sub-build's `closeBundle` must not trigger the SSR post-step either,
// so this plugin honors BOTH flags (symmetric with ssg-plugin.ts).
import {
  SSG_BUILD_FLAG,
  SSR_BUILD_FLAG,
  innerBuildActiveInProcess,
  innerBuildFlagSet,
} from './build-flags'
import { resolveConfig } from './config'
import { collectFileRouteModes } from './fs-router'
import { formatRouteModeTable } from './route-modes'
import { buildSsrBundle, materializeEntry, renderSsrEntrySource } from './ssr-build-shared'
import type { ZeroConfig } from './types'

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
  // True when Vite is running a SERVER-target build (`build.ssr` set) rather
  // than the client build. A server build has NO client assets — no
  // `index.html`, no manifest — so this plugin (whose whole job runs AFTER
  // the CLIENT build) must not fire. This covers a user-invoked
  // `vite build --ssr <entry>` against a config carrying the zero plugin
  // (custom server-bundle pipelines) AND every genuine inner sub-build
  // (which always sets `build.ssr` — see `buildInnerBuildOptions`).
  let isSsrTargetBuild = false
  // Captured from the OUTER build's resolved config so the inner SSR
  // sub-build (which runs `configFile: false`) emits assets identically.
  // See `buildInnerBuildOptions` / `ssg-plugin.ts`.
  let assetsInlineLimit: BuildOptions['assetsInlineLimit']
  let assetsDir: string | undefined
  let resolvedBase: string = '/'
  // USER plugins captured for forwarding into the inner SSR sub-build.
  // See `ssg-plugin.ts` userPlugins doc + `buildSsrBundle`'s userPlugins
  // option for the filtering rules. Same propagation pattern keeps SSR
  // and SSG modes consistent.
  let userPlugins: readonly Plugin[] = []
  // Capture inner-build state once at plugin instantiation. The inner
  // build re-loads zero's plugin chain (same as SSG); without this gate
  // the inner plugin instance would re-enter its own closeBundle.
  // Mirrors `ssg-plugin.ts`. Honors BOTH flags: skip our own recursive
  // build AND the SSG prerender sub-build (mode:'ssr'|'isr' runs it) —
  // its outDir is `.zero-ssg-server` with no client index.html, so the
  // SSR post-step would spuriously warn "Skipping SSR build" even
  // though the outer SSR build succeeds.
  const isInnerBuild = innerBuildFlagSet()
  // Flag set but no `buildSsrBundle` active in THIS process ⇒ the env
  // flag leaked in from OUTSIDE (a parent process / CI shell exporting
  // PYREON_ZERO_*_INNER_BUILD). Still skip (safe), but say so — a
  // leaked flag silently disabling the whole SSR post-step of a
  // top-level build is otherwise undiagnosable. See build-flags.ts.
  const leakedInnerFlag = isInnerBuild && !innerBuildActiveInProcess()

  /**
   * ONE predicate for every way this closeBundle must no-op — the
   * post-step runs ONLY on the OUTER CLIENT build pass of an SSR/ISR
   * app. Three layered gates, unified (each was historically a
   * separate patched-in early-return):
   *
   *   1. `mode` — SPA needs no bundle; SSG has its own plugin.
   *   2. `server-target` — `build.ssr` set ⇒ no client assets exist to
   *      post-process. This structurally covers every genuine inner
   *      sub-build too (they all set `build.ssr`).
   *   3. `inner-build` — env-flag belt-and-braces under gate 2. Kept
   *      even though `server-target` subsumes it for genuine inner
   *      builds: it is the documented recursion contract
   *      (`buildSsrBundle` gates on the FLAG, not on build.ssr), and
   *      reaching this arm on a NON-server-target build is precisely
   *      the leaked-flag case worth a notice.
   */
  function postStepSkipReason(): 'mode' | 'server-target' | 'inner-build' | null {
    if (config.mode !== 'ssr' && config.mode !== 'isr') return 'mode'
    if (isSsrTargetBuild) return 'server-target'
    if (isInnerBuild) return 'inner-build'
    return null
  }

  return {
    name: 'pyreon-zero-ssr',
    apply: 'build',
    enforce: 'post',

    configResolved(resolved) {
      root = resolved.root
      distDir = resolve(root, resolved.build.outDir)
      isSsrTargetBuild = Boolean(resolved.build.ssr)
      assetsInlineLimit = resolved.build.assetsInlineLimit
      assetsDir = resolved.build.assetsDir
      resolvedBase = resolved.base
      userPlugins = resolved.plugins as readonly Plugin[]
    },

    async closeBundle() {
      // See `postStepSkipReason` for the full gate catalog. All skips
      // are silent EXCEPT a leaked inner-build env flag on what is
      // otherwise the client build pass we own — that one silently
      // disables the entire SSR post-step (no server bundle, no
      // template, no adapter) with zero output, so name it.
      const skip = postStepSkipReason()
      if (skip !== null) {
        if (skip === 'inner-build' && leakedInnerFlag) {
          // oxlint-disable-next-line no-console
          console.warn(
            `[zero:ssr] Skipping the SSR post-step: an inner-build env flag (${SSR_BUILD_FLAG} / ${SSG_BUILD_FLAG}) is set but no zero sub-build is running in this process — the flag leaked in from the environment. Unset it to restore the SSR bundle + adapter steps.`,
          )
        }
        return
      }
      // Past the `mode` gate inside `postStepSkipReason` the mode is
      // 'ssr' | 'isr' — TS can't narrow through the predicate call, so
      // re-state it for the entry-kind + route-table consumers below.
      const mode = config.mode as 'ssr' | 'isr'

      // Sanity check — without a client build there's no asset
      // manifest for the adapter to wrap. Reaching this point means the
      // CLIENT build ran but produced no `index.html`, which is a genuine
      // failure worth flagging (keep the warning for that case).
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
        await materializeEntry(entryPath, renderSsrEntrySource({ kind: mode, locales: [] }))
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
          base: resolvedBase,
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
          // Vite's resolved project root (parent of distDir). The vercel
          // adapter writes its `.vercel/output` Build Output API tree here —
          // Vercel only auto-detects it at the project root, not under dist.
          projectRoot: root,
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
        // EXPLICITLY-configured adapter (`zero({ adapter })`) → the user
        // asked for that deploy artifact; a green build without it is a
        // lie — fail the build (the repo's "silent-filter" anti-pattern:
        // a swallowed adapter error here shipped green builds with no
        // deployable output). AUTO-selected adapter (config.adapter
        // unset → node / platform-detected) → non-fatal: the user never
        // asked for adapter output, and the SSR bundle landed
        // successfully and is usable by hand-deploys.
        if (userConfig.adapter !== undefined) {
          throw adapterError
        }
      }

      // oxlint-disable-next-line no-console
      console.log(
        `[zero:ssr] Built ${serverEntry} [adapter: ${adapter.name}]${userEntryExists ? ' (using src/entry-server.ts)' : ' (synthetic entry)'}`,
      )

      // Per-route mode table (Tier-1 DX): which route ships in which mode,
      // at a glance, on every build. Informational — never fails the build.
      try {
        const tableMode = config._autoMode ? ('auto' as const) : mode
        const modeEntries = await collectFileRouteModes(join(root, 'src', 'routes'), tableMode, config.routeRules)
        for (const line of formatRouteModeTable(modeEntries, tableMode)) {
          // oxlint-disable-next-line no-console
          console.log(line)
        }
      } catch {
        /* table is informational only */
      }
    },
  } satisfies Plugin
}

// ─── Test exports ─────────────────────────────────────────────────────────────
//
// Internal helpers exposed for unit tests. Not part of the public API.

export const _internal = {
  SSR_BUILD_FLAG,
  SSG_BUILD_FLAG,
  SSR_ENTRY_FILENAME,
  SSR_OUTPUT_FILENAME,
  SSR_OUT_SUBDIR,
}
