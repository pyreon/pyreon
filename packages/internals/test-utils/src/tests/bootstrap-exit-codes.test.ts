import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Subprocess regression test for `scripts/bootstrap.ts` exit-code
 * behaviour.
 *
 * Policy (post gap #3 closure — see PR #435 + CLAUDE.md "Bootstrap
 * fails loudly on partial state"):
 *
 *   1. Build failure under any invocation (postinstall, manual, CI)
 *      exits non-zero by default. Pre-fix the postinstall path
 *      swallowed silently — but devs running `bun run dev` use the
 *      bun condition (→ src/), never touch lib/, and never noticed
 *      missing lib/ until production-build time, far from the cause.
 *      Better to abort `bun install` loudly than leave partial state.
 *
 *   2. `PYREON_BOOTSTRAP_SOFT=1` is the escape hatch — preserves the
 *      prior "swallow on postinstall" behaviour for users who
 *      genuinely want to proceed past a transient flake. The install
 *      completes but lib/ stays incomplete; consumers see confusing
 *      build errors until they re-run bootstrap manually.
 *
 *   3. Failure surfacing: stderr always carries an explicit per-
 *      package partial-state report so users know which packages
 *      need attention, regardless of the exit-code path.
 *
 * Without these tests, a future PR could revert the policy without
 * anything failing locally — the gate would silently rot.
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

  it('exits 1 under postinstall when build fails (loud failure)', () => {
    const result = runBootstrap({
      npm_lifecycle_event: 'postinstall',
    })
    // Post gap #3: postinstall failures now exit non-zero by default.
    // Pre-fix this returned 0 (silent swallow) — devs using bun
    // condition never noticed the missing lib/ until production build.
    expect(result.status).toBe(1)
    // Per-package partial-state report on stderr.
    expect(result.stderr).toContain('[bootstrap] ✗ Build failure')
    // Mentions the escape hatch so users know how to bypass if needed.
    expect(result.stderr).toContain('PYREON_BOOTSTRAP_SOFT=1')
  })

  it('exits 0 under postinstall + PYREON_BOOTSTRAP_SOFT=1 (escape hatch)', () => {
    const result = runBootstrap({
      npm_lifecycle_event: 'postinstall',
      PYREON_BOOTSTRAP_SOFT: '1',
    })
    // Soft bypass preserves the prior "swallow on postinstall"
    // behaviour for users who explicitly opt in.
    expect(result.status).toBe(0)
    // Should STILL log the failure — silence on success would
    // contradict the gate's purpose.
    expect(result.stderr).toContain('[bootstrap] ✗ Build failure')
  })

  it('exits 1 when run standalone (no npm_lifecycle_event)', () => {
    const result = runBootstrap({
      npm_lifecycle_event: undefined,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('[bootstrap] ✗ Build failure')
  })

  it('exits 1 when npm_lifecycle_event is set to anything other than postinstall', () => {
    // Other lifecycle events (test, prepare, prepublishOnly) should
    // exit 1 regardless of soft-bypass policy — only postinstall has
    // the "aborting bun install" trade-off worth the SOFT=1 escape.
    for (const event of ['install', 'test', 'prepare', 'prepublishOnly']) {
      const result = runBootstrap({ npm_lifecycle_event: event })
      expect(result.status).toBe(1)
    }
  })
})
