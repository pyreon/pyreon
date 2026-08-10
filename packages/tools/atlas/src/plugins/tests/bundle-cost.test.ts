import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  bundleCostPlugin,
  canMeasureBundleCost,
  formatBytes,
  measureBundleCost,
} from '../bundle-cost'
import type { ComponentIntelligence } from '../../core'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-cost-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const write = (name: string, source: string): string => {
  const file = join(dir, name)
  writeFileSync(file, source, 'utf8')
  return file
}

const ci = (source?: string): ComponentIntelligence =>
  ({ name: 'X', controls: [], scenarios: [], axes: [], tags: [], ...(source ? { source } : {}) }) as ComponentIntelligence

describe('formatBytes', () => {
  it('reads as bytes below 1 KB and KB above', () => {
    expect(formatBytes(840)).toBe('840 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
  })
})

// Gated at the DESCRIBE level, matching the repo's convention for specs that
// need a capability the host may not have (`describe.runIf(isBrowser)`).
describe.runIf(canMeasureBundleCost())('measureBundleCost — with a bundler', () => {
  it('measures a real file, gzip smaller than raw', async () => {
    const file = write('big.ts', `export const X = ${JSON.stringify('x'.repeat(4000))}\n`)
    const cost = await measureBundleCost(file)

    expect(cost).toBeDefined()
    expect(cost!.raw).toBeGreaterThan(0)
    // A highly-compressible payload must compress. Asserting the RELATION
    // rather than a byte count, which would rot on every bundler upgrade.
    expect(cost!.gzip).toBeLessThan(cost!.raw)
  })

  it('does NOT charge a component for an external dep', async () => {
    // The measurement's whole meaning. If workspace packages were inlined,
    // every component in a library would be charged for the same shared
    // runtime and the numbers could not be compared with each other — which is
    // the only thing they are useful for.
    const bare = write('bare.ts', 'export const A = 1\n')
    const importer = write('importer.ts', "import '@pyreon/core'\nexport const B = 2\n")

    const [a, b] = await Promise.all([measureBundleCost(bare), measureBundleCost(importer)])
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    // The importer carries only an import statement more — not a framework.
    expect(b!.raw - a!.raw).toBeLessThan(500)
  })

})

describe('measureBundleCost — degradation', () => {
  it('leaves no temp directory behind', async () => {
    // One per measured component would otherwise accumulate for the life of
    // the machine — 108 per scan on a real library.
    const { readdirSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith('atlas-cost-')).length
    await measureBundleCost(join(dir, 'nope.ts'))
    const after = readdirSync(tmpdir()).filter((n) => n.startsWith('atlas-cost-')).length
    expect(after).toBe(before)
  })

  it('is UNDEFINED, never zero, for a file that cannot be bundled', async () => {
    // Zero would read as "free" — the most misleading number available.
    expect(await measureBundleCost(join(dir, 'does-not-exist.ts'))).toBeUndefined()
  })
})

describe.runIf(canMeasureBundleCost())('bundleCostPlugin — with a bundler', () => {
  it('attaches the cost when the source measures', async () => {
    const file = write('c.ts', 'export const C = () => null\n')
    const out = await bundleCostPlugin().decorate!(ci(file), { cwd: dir })

    expect(out.bundleCost?.gzip).toBeGreaterThan(0)
  })
})

describe('bundleCostPlugin — without a bundler', () => {
  it('SAYS why, once, rather than silently producing nothing', async () => {
    // The whole point of the announcement. Someone opts in, gets an empty
    // field, and cannot guess that the reason is "you are on node". A
    // capability that quietly does nothing is the same false-quiet as a gate
    // that scans zero files and reports a clean pass.
    if (canMeasureBundleCost()) return // the announcement path is unreachable here
    const said: string[] = []
    const plugin = bundleCostPlugin({ onUnavailable: (r) => said.push(r) })
    await plugin.decorate!(ci(join(dir, 'a.ts')), { cwd: dir })
    await plugin.decorate!(ci(join(dir, 'b.ts')), { cwd: dir })

    expect(said).toHaveLength(1) // once per run, not once per component
    expect(said[0]).toContain('Bun')
  })
})

describe('bundleCostPlugin', () => {
  it('leaves a component with no source untouched', async () => {
    const plugin = bundleCostPlugin()
    const input = ci()
    const out = await plugin.decorate!(input, { cwd: dir })

    expect(out).toBe(input)
    expect((out as { bundleCost?: unknown }).bundleCost).toBeUndefined()
  })

  it('leaves the field ABSENT rather than zero when measuring fails', async () => {
    const out = await bundleCostPlugin().decorate!(ci(join(dir, 'nope.ts')), { cwd: dir })
    expect(out.bundleCost).toBeUndefined()
  })
})
