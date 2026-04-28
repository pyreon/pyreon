import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Subprocess regression test for `scripts/bootstrap.ts` exit-code
 * behaviour.
 *
 * The script swallows build failure under postinstall (aborting `bun
 * install` over a stale-lib failure is worse than continuing — the
 * user gets a real error on the next build), but exits non-zero on
 * manual / CI invocation so failures don't slip past silently.
 *
 * Without these tests, a future PR could revert the
 * `if (!isPostinstall) process.exit(1)` line without anything failing
 * locally — the policy would silently rot.
 *
 * Failure injection: the script honours `PYREON_BOOTSTRAP_FORCE_FAIL=1`
 * to jump straight to the catch path so we don't need to break a real
 * package to exercise it.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..')
const BOOTSTRAP = resolve(REPO_ROOT, 'scripts', 'bootstrap.ts')

function runBootstrap(env: Record<string, string | undefined>): {
  status: number | null
  stdout: string
  stderr: string
} {
  // Pass through PATH and HOME so `bun` resolves correctly. Override or
  // delete `npm_lifecycle_event` based on the test case.
  const finalEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    PYREON_BOOTSTRAP_FORCE_FAIL: '1',
  }
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) {
      delete finalEnv[k]
    } else {
      finalEnv[k] = v
    }
  }
  const result = spawnSync('bun', [BOOTSTRAP], {
    cwd: REPO_ROOT,
    env: finalEnv,
    encoding: 'utf-8',
    timeout: 60_000,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

describe('scripts/bootstrap.ts exit-code policy', () => {
  it('bootstrap.ts exists at the expected path', () => {
    expect(existsSync(BOOTSTRAP)).toBe(true)
  })

  it('exits 0 under postinstall even when build fails', () => {
    const result = runBootstrap({
      npm_lifecycle_event: 'postinstall',
    })
    // Postinstall path: failure is swallowed because aborting `bun
    // install` is worse than continuing.
    expect(result.status).toBe(0)
    // Should still log the failure for visibility.
    expect(result.stderr).toContain('[bootstrap] Build failed.')
  })

  it('exits 1 when run standalone (no npm_lifecycle_event)', () => {
    const result = runBootstrap({
      npm_lifecycle_event: undefined,
    })
    // Standalone path: failure surfaces so it doesn't pass silently
    // through CI gates or manual invocations.
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('[bootstrap] Build failed.')
  })

  it('exits 1 when npm_lifecycle_event is set to anything other than postinstall', () => {
    // The check is `=== 'postinstall'`, not "any npm lifecycle event".
    // A test runner or other tool that also sets `npm_lifecycle_event`
    // (e.g. `test`, `prepare`, `prepublishOnly`) should still see
    // failure surface, since none of those have the postinstall
    // problem of aborting `bun install`.
    for (const event of ['install', 'test', 'prepare', 'prepublishOnly']) {
      const result = runBootstrap({ npm_lifecycle_event: event })
      expect(result.status).toBe(1)
    }
  })
})
