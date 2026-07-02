/**
 * Tree-shake regression lock for runtime-server's dev gates.
 *
 * Pre-fix, this package aliased its dev gate into a module const —
 * `const __DEV__ = typeof process !== 'undefined' && NODE_ENV !== 'production'`
 * — which is non-constant under a bundler's define (`typeof process` stays
 * dynamic, and the alias doesn't fold through Bun.build / esbuild anyway).
 * Result: every perf counter + dev warning (9 counters, the Suspense-timeout
 * warning, the tag-name validator) shipped in minified SSR bundles — exactly
 * what edge/workerd deploys produce. The fix is the repo-standard BARE INLINE
 * `process.env.NODE_ENV !== 'production'` at every site.
 *
 * This bundles the real entry with the prod define (what an edge bundler
 * does) and asserts the dev surface is gone — then dev-mode and asserts it IS
 * present, so the test can't pass for the wrong reason (PR #200 lesson).
 */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.ts')
// The dev-only fingerprints: the perf-counter sink property + the two
// dev-warning strings the pre-fix bundle shipped.
const MARKERS = /__pyreon_count__|Suspense boundary timed out|could break HTML structure/

async function bundle(env: 'production' | 'development') {
  const r = await build({
    entryPoints: [ENTRY],
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    // 'browser', NOT 'node' — this simulates the edge/workerd bundle (wrangler
    // bundles for a non-Node platform); on platform:'node' esbuild folds
    // `typeof process` to `"object"`, masking gate problems entirely.
    // Bisect nuance (verified): an INLINE `typeof process && NODE_ENV` gate
    // still folds even on 'browser' (the typeof is pure, so `pure && false`
    // simplifies) — the shape that actually leaks is the module-level ALIAS
    // (`const __DEV__ = typeof process… && NODE_ENV…` + `if (__DEV__)`),
    // which esbuild does not constant-propagate. Reintroducing that alias at
    // one counter site makes the prod spec below fail; the inline-bare-gate
    // fix keeps it green.
    platform: 'browser',
    packages: 'external',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify(env) },
    plugins: [
      {
        // esbuild 0.28 can't named-import from a `with { type: 'json' }`
        // package.json module — stub the registerSingleton identity import
        // (irrelevant to the dev-gate assertion).
        name: 'stub-package-json',
        setup(b) {
          b.onResolve({ filter: /package\.json$/ }, (args) => ({
            path: args.path,
            namespace: 'pkg-stub',
          }))
          b.onLoad({ filter: /.*/, namespace: 'pkg-stub' }, () => ({
            contents: 'export const name = "@pyreon/runtime-server"; export const version = "0.0.0";',
            loader: 'js',
          }))
        },
      },
    ],
  })
  return r.outputFiles[0]!.text
}

describe('runtime-server — dev gates fold out of production bundles', () => {
  it('prod bundle contains NO perf counters or dev-warning strings', async () => {
    const prod = await bundle('production')
    expect(prod).not.toMatch(MARKERS)
  })

  it('dev bundle DOES contain them (anti-false-pass)', async () => {
    const dev = await bundle('development')
    expect(dev).toMatch(/__pyreon_count__/)
    expect(dev).toMatch(/Suspense boundary timed out/)
  })
})
