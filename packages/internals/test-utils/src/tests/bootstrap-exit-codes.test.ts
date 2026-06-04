import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe } from 'vitest'

/**
 * CI gate: this file is the slow part of `test (internals)`. Locally
 * it runs in ~5s; on GHA's slower runners it takes ~190s because each
 * test spawns a bun subprocess that walks the package tree + invokes
 * `bun scripts/bootstrap.ts` end-to-end. The dirty-detection walk +
 * subprocess startup is what dominates — locally cached, slow on CI.
 *
 * The `test (internals)` job (which runs on every PR) sets
 * `PYREON_SKIP_SLOW_TESTS=1` so this suite is a no-op for PRs that
 * don't touch the bootstrap infrastructure. The dedicated
 * `bootstrap-exit-codes` CI cell DOES run the suite (with the env var
 * unset) when `scripts/bootstrap.ts` itself changes — that's the
 * only path that can regress the exit-code contract. push:main +
 * merge_group always run the full suite.
 *
 * The cost-of-skip is zero — the contract this file protects can only
 * regress through a `scripts/bootstrap.ts` edit, and the dedicated
 * cell catches that. Local `bun run test` continues to run everything
 * (no env var set), preserving the existing dev workflow.
 */
const SKIP_SLOW = process.env.PYREON_SKIP_SLOW_TESTS === '1'
const describeIfFull = SKIP_SLOW ? describe.skip : describe

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

function runBootstrap(
  env: Record<string, string | undefined>,
  opts: { timeoutMs?: number } = {},
): {
  status: number | null
  stdout: string
  stderr: string
} {
  const timeoutMs = opts.timeoutMs ?? 60_000
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
    // Default 60s is enough for FORCE_FAIL specs (which exit via
    // process.exit(1) BEFORE Phase E1 / git-hooks-install runs). Specs
    // that flow through to Phase E1 (the new contract-decoupling
    // branch, which exits 0 implicitly after the warning) hit the
    // git-hooks-install execSync at the bottom of bootstrap.ts —
    // that's slow on CI's cold-cache git operations. Override per
    // call via the second arg below.
    timeout: timeoutMs,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

describeIfFull('scripts/bootstrap.ts exit-code policy', () => {
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
    // Per-spec timeout override — mirrors the FORCE_FAIL specs (line 88
    // and below). The default 60s `runBootstrap` timeout was tuned for
    // local hardware; CI's cold-cache dirty-detection walk over ~80
    // packages can exceed it on contended runners. Bumping to 90s
    // matches the pattern used for every other spec in this file that
    // spawns the real script. Vitest test-level timeout (the outer
    // arg `{ timeout: 90_000 }`) must be at least as large as the
    // subprocess spawnSync timeout the helper uses (60s) plus margin
    // for the vitest overhead, hence 90s.
    it('exits 0 under postinstall when subprocess throws but every originally-dirty package built', { timeout: 150_000 }, () => {
      const result = runBootstrap(
        {
          npm_lifecycle_event: 'postinstall',
          PYREON_BOOTSTRAP_FORCE_FAIL: undefined,
          PYREON_BOOTSTRAP_FORCE_BUILD_THREW: '1',
        },
        // 120s subprocess timeout (vs default 60s). This branch flows
        // through to Phase E1 / git-hooks-install, which is slow on
        // CI's cold-cache git operations. Vitest's outer timeout above
        // must be at least subprocess timeout + framework overhead.
        { timeoutMs: 120_000 },
      )
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

    it('exits 0 under standalone (no npm_lifecycle_event) when subprocess throws but every originally-dirty package built', { timeout: 150_000 }, () => {
      const result = runBootstrap(
        {
          npm_lifecycle_event: undefined,
          PYREON_BOOTSTRAP_FORCE_FAIL: undefined,
          PYREON_BOOTSTRAP_FORCE_BUILD_THREW: '1',
        },
        { timeoutMs: 120_000 },
      )
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
