/**
 * The bench harness re-launches itself once to get NODE_ENV=production. A bundle that folded NODE_ENV to "development" once
 * made it re-launch forever (a process storm): the second launch must refuse. Tested on the pure guard, so no bench runs.
 */
import { resolve } from 'node:path'

// The harness lives outside this package (outside tsc's rootDir): load it by a computed path.
const HARNESS = resolve(process.cwd(), '../../../scripts/bench/rivals-harness.ts')
const { assertNotRespawned } = (await import(HARNESS)) as { assertNotRespawned: (env: Record<string, string | undefined>) => void }

describe('the bench harness never re-launches itself twice', () => {
  it('the first launch (no marker) may re-launch', () => {
    expect(() => assertNotRespawned({})).not.toThrow()
    expect(() => assertNotRespawned({ PYREON_BENCH_RESPAWNED: '0' })).not.toThrow()
  })

  it('a launch that is already a re-launch throws instead of recursing', () => {
    expect(() => assertNotRespawned({ PYREON_BENCH_RESPAWNED: '1' })).toThrow(/after the respawn/)
  })

  it('the re-launch sets the marker (the orchestrator source passes it)', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(HARNESS, 'utf8')

    expect(source).toMatch(/PYREON_BENCH_RESPAWNED: '1'/)
    expect(source).toMatch(/assertNotRespawned\(process\.env\)/)
  })
})
