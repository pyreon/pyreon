/**
 * `missingRuntimeBinaries` — the probe that keeps the edge-runtimes suite from
 * booting on an install npm silently stripped of its platform binary.
 *
 * npm drops an optional dependency it fails to fetch without failing the
 * install. For workerd that optional dependency IS the runtime, so a transient
 * registry error produced a complete-looking install that died at web-server
 * boot (CI run 39492029961: 52 packages installed instead of 53). The probe
 * loads each binary-backed package under node; workerd's entry throws at load
 * when its binary is absent, which is exactly the signal wanted.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { missingRuntimeBinaries } from '../../../../../scripts/edge-runtimes/tools'

const dirs: string[] = []
function fakeTools(packages: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'edge-tools-'))
  dirs.push(dir)
  for (const [name, body] of Object.entries(packages)) {
    const pkgDir = join(dir, 'node_modules', name)
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name, main: 'index.js' }))
    writeFileSync(join(pkgDir, 'index.js'), body)
  }
  return dir
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('missingRuntimeBinaries', () => {
  it('reports a package whose entry throws because its binary is absent', () => {
    const dir = fakeTools({
      workerd: 'throw new Error(\'The package "@cloudflare/workerd-linux-64" could not be found\')',
    })
    expect(missingRuntimeBinaries(dir)).toEqual(['workerd'])
  })

  it('reports a package that is not installed at all', () => {
    expect(missingRuntimeBinaries(fakeTools({}))).toEqual(['workerd'])
  })

  it('reports nothing when every binary-backed package loads', () => {
    const dir = fakeTools({ workerd: 'module.exports = { binary: "/bin/true" }' })
    expect(missingRuntimeBinaries(dir)).toEqual([])
  })

  it('checks each probe independently', () => {
    const dir = fakeTools({ ok: 'module.exports = 1', broken: 'throw new Error("no binary")' })
    expect(missingRuntimeBinaries(dir, ['ok', 'broken'])).toEqual(['broken'])
  })
})
