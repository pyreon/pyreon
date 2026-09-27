import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Vitest `globalSetup`: give each run its own temp directory and delete it
 * when the run ends.
 *
 * Tests across the repo create scratch directories with
 * `mkdtempSync(join(tmpdir(), …))`, and more than a hundred test files never
 * remove them. Each run left thousands of directories in the OS temp dir
 * (`lathe-pull-*`, `pyreon-bundle-budgets-*`, `pyreon-smoke-*`, …), and a run
 * killed by a timeout leaks even from code that does clean up in `finally`.
 * Fixing every call site would not stop the next test from doing the same, so
 * the run owns the directory instead.
 *
 * `os.tmpdir()` reads `TMPDIR` (POSIX) or `TEMP`/`TMP` (Windows) on every
 * call, and Vitest starts its workers after global setup, so every test and
 * every process a test spawns inherits the sandbox.
 *
 * Opt out with `PYREON_TEST_KEEP_TMP=1`, which keeps the directory for
 * inspection and prints its path.
 */
export default function setup(): () => void {
  const saved = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP }
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-vitest-'))
  process.env.TMPDIR = dir
  process.env.TEMP = dir
  process.env.TMP = dir

  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    if (process.env.PYREON_TEST_KEEP_TMP === '1') {
      console.warn(`[pyreon] kept test temp dir: ${dir}`)
      return
    }
    rmSync(dir, { recursive: true, force: true })
  }
}
