/**
 * Tree-shake regression lock for the reactive-devtools instrumentation.
 *
 * `signal()` / `computed()` / `effect()` gained `_rdRegister` /
 * `_rdRecordFire` calls on their hot paths, each inside the existing
 * `process.env.NODE_ENV !== 'production'` gate. The framework's perf
 * claims rest on those calls compiling to NOTHING in production builds
 * (benchmarks run prod bundles). This test bundles each instrumented
 * module through esbuild with the prod define + minify (what every
 * modern bundler does for a release build) and asserts every trace of
 * the devtools bridge is gone — then bundles it dev-mode and asserts
 * the instrumentation IS present, so the test can't pass for the wrong
 * reason (the PR #200 bisect lesson).
 */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const MARKERS = /RecordFire|RdRegister|pxRdId|reactive-devtools/

async function bundle(entry: string, env: 'production' | 'development') {
  const r = await build({
    entryPoints: [join(SRC, entry)],
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify(env) },
  })
  return r.outputFiles[0]!.text
}

describe('reactive-devtools — prod tree-shake', () => {
  for (const entry of ['signal.ts', 'computed.ts', 'effect.ts']) {
    it(`${entry}: instrumentation is fully eliminated in production`, async () => {
      const prod = await bundle(entry, 'production')
      expect(prod).not.toMatch(MARKERS)
    })

    it(`${entry}: instrumentation IS present in development (anti-false-pass)`, async () => {
      const dev = await bundle(entry, 'development')
      expect(dev).toMatch(MARKERS)
    })
  }
})
