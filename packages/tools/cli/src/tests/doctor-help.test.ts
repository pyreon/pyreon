import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// The published bin: rebuild @pyreon/cli before running or bisecting this test.
const BIN = resolve(__dirname, '../../lib/index.js')
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
