import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// The published bin: rebuild @pyreon/cli before running or bisecting this test.
const BIN = resolve(__dirname, '../../bin/pyreon.js')
let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'pyreon-doctor-help-'))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

describe('doctor help in the published CLI', () => {
  it.each(['--help', '-h'])(
    '%s returns help before validating or running gates',
    (flag) => {
      const result = spawnSync(process.execPath, [BIN, 'doctor', flag, '--only', 'invalid-gate'], {
        cwd,
        encoding: 'utf8',
        timeout: 20_000,
        killSignal: 'SIGKILL',
      })
      expect({
        status: result.status,
        error: result.error?.message,
        stderr: result.stderr,
      }).toMatchObject({ status: 0, error: undefined })
      // The old audit report also contained gate names. Assert the actual help
      // contract, including the gate registry, rather than accepting that report.
      expect(result.stdout).toContain('pyreon <command> [options]')
      expect(result.stdout).toContain('doctor gates:')
      expect(result.stdout).toContain('dependency-fabric')
    },
    30_000,
  )
})

describe('doctor rejects an unknown argument in the published CLI', () => {
  // An ignored selector widens the run to every gate, so a CI script pinned to
  // a removed flag (`--check-ssg`, now `--only ssg-audit`) would silently start
  // failing on gates it never opted into. It must fail loudly instead.
  it.each(['--check-ssg', '--audit-tests', '--onyl'])(
    '%s exits 1 with a usage error naming --only, before running any gate',
    (flag) => {
      const result = spawnSync(process.execPath, [BIN, 'doctor', flag], {
        cwd,
        encoding: 'utf8',
        timeout: 20_000,
        killSignal: 'SIGKILL',
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(`unknown argument '${flag}'`)
      expect(result.stderr).toContain('--only')
      expect(result.stdout).not.toContain('doctor gates:')
    },
    30_000,
  )

  // Each removed selector, and each flag spelling older docs and messages
  // taught (`--check-dedup` is still printed by the reactivity singleton
  // guard in 0.53), names the exact gate that replaces it, so the fix is a
  // copy-paste. Bisect-verified: without `doctorFlagHint`, the hint is the
  // generic `--only <gate>` line and these specs fail.
  it.each([
    ['--audit-tests', 'select that gate with --only audit-tests'],
    ['--check-islands', 'select that gate with --only islands-audit'],
    ['--check-ssg', 'select that gate with --only ssg-audit'],
    ['--check-content', 'select that gate with --only content-audit'],
    ['--check-native', 'select that gate with --only native-audit'],
    ['--check-dedup', 'select that gate with --only check-dedup'],
    ['--check-pyreon-patterns', 'select that gate with --only pyreon-patterns'],
    ['--format=json', 'as a separate argument: --format json'],
  ])('%s names its replacement: %s', (flag, replacement) => {
    const result = spawnSync(process.execPath, [BIN, 'doctor', flag], {
      cwd,
      encoding: 'utf8',
      timeout: 20_000,
      killSignal: 'SIGKILL',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(replacement)
  }, 30_000)

  it('still accepts every documented flag, including value flags', () => {
    const result = spawnSync(
      process.execPath,
      [BIN, 'doctor', '--json', '--ci', '--only', 'ssg-audit', '--audit-min-risk', 'high', '--format', 'json'],
      { cwd, encoding: 'utf8', timeout: 20_000, killSignal: 'SIGKILL' },
    )
    expect(result.stderr).not.toContain('unknown argument')
    expect(result.status).toBe(0)
  }, 30_000)
})
