/**
 * `runScan` forwards three config fields into the pipeline that nothing else
 * exercised end to end: `matrix` (how many variant combinations are
 * generated), authored `scenarios` (which must survive next to the generated
 * ones), and `parts` (sub-component grouping, carried to the result). A field
 * that is read but not forwarded is the silent-drop shape — the config
 * "works", and changes nothing.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runScan } from '../run'

let dir: string
const write = (rel: string, body: string): void => {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-config-wiring-'))
  write('package.json', JSON.stringify({ name: 'fixture', private: true, type: 'module' }))
  write(
    'src/Badge.tsx',
    "export function Badge(props: { tone?: 'info' | 'warn'; size?: 'sm' | 'lg' }) { return props.tone ?? null }\n",
  )
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('config fields reach the scan', () => {
  it('carries parts, keeps an authored scenario, and honours matrix', async () => {
    write(
      'atlas.config.ts',
      [
        "export const matrix = 'full'",
        "export const scenarios = { Badge: [{ id: 'hand-written', name: 'Hand written', args: { tone: 'warn' } }] }",
        "export const parts = { Badge: 'Badge' }",
        '',
      ].join('\n'),
    )
    const full = await runScan({ cwd: dir, write: false })
    expect(full.configError).toBeUndefined()
    expect(full.parts).toEqual({ Badge: 'Badge' })
    const ids = full.graph.scenarios().map((s) => s.id)
    expect(ids.some((id) => id.includes('hand-written'))).toBe(true)

    write('atlas.config.ts', "export const matrix = 'axes'\n")
    const axes = await runScan({ cwd: dir, write: false })
    // `full` crosses the two union props; `axes` walks each on its own.
    expect(full.graph.scenarios().length).toBeGreaterThan(axes.graph.scenarios().length)
  }, 120_000)
})
