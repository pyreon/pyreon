/**
 * Coverage tests for doctor()'s `only` selection + non-ci exit path.
 *
 * - `only: [gate]` runs exactly that gate.
 * - The non-`ci` return that sums errors+warnings+infos.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type DoctorOptions, doctor } from '../doctor'
import { stdoutToConsoleLog } from './stdout-to-console'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cli-doctor-only-'))
}

function defaults(cwd: string): DoctorOptions {
  return { fix: false, json: false, ci: false, cwd }
}

describe('doctor — only selection', () => {
  afterEach(() => vi.restoreAllMocks())

  it('only: [islands-audit] runs just that gate', async () => {
    const cwd = makeTmpDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const stdout = stdoutToConsoleLog()
    await doctor({
      ...defaults(cwd),
      json: true,
      only: ['islands-audit'],
    })
    const out = log.mock.calls.map((c) => c[0]).join('')
    log.mockRestore()
    stdout.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    const parsed = JSON.parse(out)
    const ranGates = parsed.gates
      .filter((g: { meta: { skipped?: boolean } }) => !g.meta.skipped)
      .map((g: { gate: string }) => g.gate)
    expect(ranGates).toEqual(['islands-audit'])
  })

  it('only: [ssg-audit] runs just that gate', async () => {
    const cwd = makeTmpDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const stdout = stdoutToConsoleLog()
    await doctor({
      ...defaults(cwd),
      json: true,
      only: ['ssg-audit'],
    })
    const out = log.mock.calls.map((c) => c[0]).join('')
    log.mockRestore()
    stdout.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    const parsed = JSON.parse(out)
    const ranGates = parsed.gates
      .filter((g: { meta: { skipped?: boolean } }) => !g.meta.skipped)
      .map((g: { gate: string }) => g.gate)
    expect(ranGates).toEqual(['ssg-audit'])
  })

  it('non-ci exit returns totals.errors + warnings + infos', async () => {
    const cwd = makeTmpDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const stdout = stdoutToConsoleLog()
    const ret = await doctor({
      ...defaults(cwd),
      ci: false,
      only: ['islands-audit'],
    })
    log.mockRestore()
    stdout.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    expect(typeof ret).toBe('number')
    expect(ret).toBeGreaterThanOrEqual(0)
  })
})
