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

describe('reactive-devtools — public-API readers do not pin the machinery in prod', () => {
  // The subtle failure mode this locks: the READERS (getReactiveGraph /
  // getFireSummaries / getUpdateCause / describeReactiveGraph) are public
  // exports, so bundling the package entry RETAINS them. An early
  // `if (prod) return empty` inside them leaves the rest of the body dead
  // only at MINIFY time — which runs AFTER tree-shaking's symbol-usage
  // analysis, so the registry/stack-parse machinery the tail references
  // (`_resolveLoc`, `_parseStackLine`, `preview`, the FinalizationRegistry)
  // still ships. The fix wraps the body in a DEV-block
  // (`if (NODE_ENV !== 'production') { ...body... }`) which the bundler
  // drops at PARSE time, references included. These markers are the
  // machinery's fingerprints.
  const ENTRY = 'tests/fixtures/devtools-public-api-entry.ts'
  const MACHINERY = /pxRdId|skipFrames|pendingErr|FinalizationRegistry|orphan-signal/

  it('prod bundle of the full reader surface contains NO registry machinery', async () => {
    const prod = await bundle(ENTRY, 'production')
    expect(prod).not.toMatch(MACHINERY)
  })

  it('dev bundle of the same entry DOES contain the machinery (anti-false-pass)', async () => {
    const dev = await bundle(ENTRY, 'development')
    expect(dev).toMatch(/pxRdId/)
    expect(dev).toMatch(/skipFrames/)
    expect(dev).toMatch(/FinalizationRegistry/)
    expect(dev).toMatch(/orphan-signal/)
  })

  it('prod readers still return the documented empty results', async () => {
    // Behavior lock (not just bytes): the gated readers must return the
    // SAME vacuous values the dev path returns for an empty registry.
    const mod = await import('../reactive-devtools')
    const desc = await import('../reactive-describe')
    // NODE_ENV in vitest is dev — assert the CONTRACT shape on an inactive
    // registry, which is what prod permanently observes.
    expect(mod.getReactiveGraph()).toEqual({ nodes: [], edges: [] })
    expect(mod.getFireSummaries()).toEqual([])
    expect(mod.getReactiveFires()).toEqual([])
    expect(mod.getUpdateCause(1)).toBeNull()
    expect(desc.describeReactiveGraph({ nodes: [], edges: [] }).summary).toEqual({
      signals: 0,
      derived: 0,
      effects: 0,
      edges: 0,
    })
  })
})
