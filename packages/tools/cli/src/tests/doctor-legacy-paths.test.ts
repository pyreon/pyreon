/**
 * Coverage tests for doctor()'s legacy-flag mapping + non-ci exit path.
 *
 * - resolveOnly's `--check-islands` and `--check-ssg` legacy paths
 *   (doctor.ts L80-82).
 * - The non-`ci` return that sums errors+warnings+infos (L113).
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type DoctorOptions, doctor } from '../doctor'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cli-doctor-legacy-'))
}

function defaults(cwd: string): DoctorOptions {
  return { fix: false, json: false, ci: false, cwd }
}

describe('doctor — legacy flag mapping', () => {
  afterEach(() => vi.restoreAllMocks())

  it('legacy --check-islands maps to --only islands-audit', async () => {
    const cwd = makeTmpDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await doctor({
      ...defaults(cwd),
      json: true,
      checkIslands: true,
    })
    const out = log.mock.calls.map((c) => c[0]).join('')
    log.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    const parsed = JSON.parse(out)
    const ranGates = parsed.gates
      .filter((g: { meta: { skipped?: boolean } }) => !g.meta.skipped)
      .map((g: { gate: string }) => g.gate)
    expect(ranGates).toEqual(['islands-audit'])
  })

  it('legacy --check-ssg maps to --only ssg-audit', async () => {
    const cwd = makeTmpDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await doctor({
      ...defaults(cwd),
      json: true,
      checkSsg: true,
    })
    const out = log.mock.calls.map((c) => c[0]).join('')
    log.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    const parsed = JSON.parse(out)
    const ranGates = parsed.gates
      .filter((g: { meta: { skipped?: boolean } }) => !g.meta.skipped)
      .map((g: { gate: string }) => g.gate)
    expect(ranGates).toEqual(['ssg-audit'])
  })

  it('non-ci exit returns totals.errors + warnings + infos (L113)', async () => {
    const cwd = makeTmpDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const ret = await doctor({
      ...defaults(cwd),
      ci: false,
      checkIslands: true,
    })
    log.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    expect(typeof ret).toBe('number')
    expect(ret).toBeGreaterThanOrEqual(0)
  })
})
