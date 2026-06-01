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
  //
  // Default failure-injection: PYREON_BOOTSTRAP_FORCE_FAIL=1 simulates
  // the canonical "contract unmet" failure (postcondition still-dirty)
  // — the most common test scenario. Specific tests can override this
  // via the `env` arg to exercise other branches (e.g. clear it AND set
  // PYREON_BOOTSTRAP_FORCE_BUILD_THREW=1 to test the new
  // buildThrew-but-postcondition-pass warning path that exits 0).
  const finalEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    PYREON_BOOTSTRAP_FORCE_FAIL: '1',
    // Skip the Rust native binary build (5+ min cold-cache cargo build
    // on CI exceeds this test's 60s subprocess timeout). The exit-code
    // policy tests don't depend on the binary.
    PYREON_BOOTSTRAP_SKIP_NATIVE: '1',
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

  it('exits 1 under postinstall when build fails (loud failure)', { timeout: 90_000 }, () => {
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

  it('force-fail terminates without infinite retry loop (gap #3 retry policy)', () => {
    // Gap #3 added a single sequential retry pass for still-dirty
    // packages — that's a defensive recovery for transient flakes
    // (topological-order race, file-handle limits, native-binary
    // link race after `bun install`). The retry MUST be capped at
    // ONE pass so a structurally-broken package can't infinite-loop.
    //
    // Implementation: the `if (stillDirty.length > 0 && !forceFail)`
    // gate skips retry when forceFail is set, so this test verifies
    // the script terminates within the per-test timeout (60s) with
    // exit code 1. If retry-loop bound were broken, the script would
    // either hang past the timeout (vitest fails with TIMEOUT) or
    // succeed silently (status === 0). We assert status === 1.
    //
    // Even without the !forceFail short-circuit, the retry block
    // doesn't recurse — it iterates the fixed `retried` array once
    // and falls through to the failure-surfacing path. Same exit-1
    // shape regardless.
    const result = runBootstrap({ npm_lifecycle_event: undefined })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('[bootstrap] ✗ Build failure')
  })

  // ── Contract-decoupling fix: buildThrew but postcondition passes ────────
  //
  // The bootstrap's contract is "every ORIGINALLY-DIRTY package now has a
  // fresh lib/" — not "every package in the workspace built cleanly".
  // The broader `bun run --filter='./packages/*/*' build` subprocess
  // builds ALL packages, so a single broken non-dirty package (stale
  // node_modules orphan, local typecheck error in an unrelated package)
  // makes the subprocess exit nonzero — but does NOT violate bootstrap's
  // contract for the install.
  //
  // Pre-fix the script exited 1 whenever the subprocess threw, even
  // when the contract was met. Real-world symptom: a stale @codemirror
  // entry in node_modules blocked an example app's build → bootstrap
  // exited 1 → every contributor's `bun install` failed even though
  // they didn't care about that example.
  //
  // Fix: split the failure paths.
  //   (1) stillDirty.length > 0 → REAL failure, exit 1 (covered by
  //       the existing specs above).
  //   (2) buildThrew && stillDirty.length === 0 → contract MET, exit 0
  //       with a loud warning naming common causes (this spec).
  //
  // Injection: PYREON_BOOTSTRAP_FORCE_BUILD_THREW=1 flips `buildThrew`
  // after the real build returns, WITHOUT affecting the postcondition.
  // We clear PYREON_BOOTSTRAP_FORCE_FAIL (which would inject a fake
  // still-dirty entry) so the postcondition stays clean.
  describe('contract-decoupling fix (buildThrew but postcondition passes)', () => {
    it('exits 0 under postinstall when subprocess throws but every originally-dirty package built', () => {
      const result = runBootstrap({
        npm_lifecycle_event: 'postinstall',
        PYREON_BOOTSTRAP_FORCE_FAIL: undefined,
        PYREON_BOOTSTRAP_FORCE_BUILD_THREW: '1',
      })
      // Contract met → install succeeds.
      expect(result.status).toBe(0)
      // Loud warning surfaces the other-package error so the user
      // notices it before they hit a confusing build failure later.
      expect(result.stderr).toContain(
        '[bootstrap] ⚠ Build subprocess emitted nonzero exit code',
      )
      // Names the contract explicitly so the user knows the install
      // is fine even though they see the warning.
      expect(result.stderr).toContain(
        "[bootstrap] Bootstrap's contract",
      )
      expect(result.stderr).toContain('IS satisfied')
      // Names common causes so users can diagnose.
      expect(result.stderr).toContain('Common causes')
      expect(result.stderr).toContain('node_modules/.bun/')
      // Does NOT surface the hard-failure header — that's reserved
      // for stillDirty > 0.
      expect(result.stderr).not.toContain('[bootstrap] ✗ Build failure')
    })

    it('exits 0 under standalone (no npm_lifecycle_event) when subprocess throws but every originally-dirty package built', () => {
      const result = runBootstrap({
        npm_lifecycle_event: undefined,
        PYREON_BOOTSTRAP_FORCE_FAIL: undefined,
        PYREON_BOOTSTRAP_FORCE_BUILD_THREW: '1',
      })
      // Standalone / CI invocations also benefit from the split — the
      // contract is the same regardless of invocation mode.
      expect(result.status).toBe(0)
      expect(result.stderr).toContain(
        '[bootstrap] ⚠ Build subprocess emitted nonzero exit code',
      )
      expect(result.stderr).not.toContain('[bootstrap] ✗ Build failure')
    })
  })
})
