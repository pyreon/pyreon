/**
 * Build-time per-route performance advisor — the Vite `closeBundle` reporter.
 *
 * Reads the Vite `build.manifest` after the client build and prints, per
 * route (each entry / dynamic-entry chunk), the perf opportunities the
 * pure `perf-advisor/checks` core detects — so the build TELLS the
 * developer what they left on the table instead of them having to know to
 * turn `collapse` on / run Lighthouse / grep the dist CSS.
 *
 * This increment wires the two checks computable purely from the manifest +
 * dist: **route-js-budget** (static-closure JS bytes per route) and
 * **cls-footgun** (`content-visibility: auto` without `contain-intrinsic-size`
 * in the route's emitted CSS). The `collapse-off` + `hero-not-avif` checks
 * (which need source scanning + HTML-preload parsing) are the next
 * increment — their check functions already ship in `checks.ts`.
 *
 * Advisory only — never fails the build; emits nothing on a clean build.
 *
 * Manifest ownership: this plugin enables `build.manifest` and runs at
 * `enforce: 'post'`. When co-used with the SSG plugin (which ALSO reads +
 * deletes the manifest for per-route modulepreload), this plugin is
 * ordered BEFORE it and defers cleanup (`cleanupManifest: false`) so the
 * SSG plugin still reads it and owns the delete. Standalone, this plugin
 * deletes the manifest itself (unless the user enabled it).
 */
import { existsSync } from 'node:fs'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { runAdvisor } from './perf-advisor/checks'
import { collectRouteInputsFromManifest } from './perf-advisor/manifest-inputs'
import { buildAdvisorArtifact, formatAdvisorReport } from './perf-advisor/report'
import type { ViteManifest } from './ssg-modulepreload'

export interface PerfAdvisorConfig {
  /** Per-route static-JS-closure byte budget. A `route-js-budget` finding fires above it. Default 150 KB. */
  jsBudget?: number
  /**
   * Whether this plugin deletes `dist/.vite/manifest.json` after reading it.
   * Default true (standalone). `zeroPlugin` sets this false in SSG mode so
   * the SSG plugin (which also reads it) owns the delete.
   * @internal
   */
  cleanupManifest?: boolean
}

const DEFAULT_JS_BUDGET = 150 * 1024

export function perfAdvisorPlugin(opts: PerfAdvisorConfig | boolean = true): Plugin {
  const config: PerfAdvisorConfig = typeof opts === 'object' ? opts : {}
  const jsBudget = config.jsBudget ?? DEFAULT_JS_BUDGET
  const cleanupManifest = config.cleanupManifest ?? true
  let distDir = ''
  let userEnabledManifest = false
  let enabled = true

  return {
    name: 'pyreon-zero-perf-advisor',
    apply: 'build',
    enforce: 'post',

    config(userViteConfig, env) {
      // The advisor inspects the CLIENT build. Skip SSR sub-builds.
      if (env.isSsrBuild) {
        enabled = false
        return null
      }
      const m = userViteConfig.build?.manifest
      userEnabledManifest = m === true || typeof m === 'string'
      return { build: { manifest: true } }
    },

    configResolved(resolved) {
      distDir = resolve(resolved.root, resolved.build.outDir)
    },

    async closeBundle() {
      if (!enabled) return
      // Don't run inside the SSG/SSR plugins' inner sub-builds.
      if (
        process.env.PYREON_ZERO_SSR_INNER_BUILD === '1' ||
        process.env.PYREON_ZERO_SSG_INNER_BUILD === '1'
      ) {
        return
      }
      const manifestPath = join(distDir, '.vite', 'manifest.json')
      if (!existsSync(manifestPath)) return
      let manifest: ViteManifest
      try {
        manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ViteManifest
      } catch {
        return
      }

      // Pre-read dist file sizes + CSS text (async) so the collector stays pure/sync.
      const sizeCache = new Map<string, number>()
      const cssCache = new Map<string, string>()
      const wantFiles = new Set<string>()
      const wantCss = new Set<string>()
      for (const chunk of Object.values(manifest)) {
        if (chunk.file?.endsWith('.js')) wantFiles.add(chunk.file)
        for (const c of chunk.css ?? []) wantCss.add(c)
      }
      await Promise.all(
        [...wantFiles].map(async (f) => {
          try {
            sizeCache.set(f, (await stat(join(distDir, f))).size)
          } catch {
            sizeCache.set(f, 0)
          }
        }),
      )
      await Promise.all(
        [...wantCss].map(async (c) => {
          try {
            cssCache.set(c, await readFile(join(distDir, c), 'utf8'))
          } catch {
            cssCache.set(c, '')
          }
        }),
      )

      const inputs = collectRouteInputsFromManifest({
        manifest,
        fileSize: (f) => sizeCache.get(f) ?? 0,
        readCss: (files) => files.map((f) => cssCache.get(f) ?? '').join('\n'),
        jsBudget,
      })
      const results = runAdvisor(inputs)

      if (results.length > 0) {
        const report = formatAdvisorReport(results)
        // oxlint-disable-next-line no-console
        console.log(`\n${report}\n`)
        await writeFile(
          join(distDir, '_pyreon-perf-advisor.json'),
          `${JSON.stringify(buildAdvisorArtifact(results), null, 2)}\n`,
          'utf8',
        ).catch(() => {})
      }

      if (cleanupManifest && !userEnabledManifest) {
        await rm(manifestPath, { force: true }).catch(() => {})
      }
    },
  }
}
