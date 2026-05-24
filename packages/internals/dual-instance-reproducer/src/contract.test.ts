/**
 * Dual-module-instance contract test.
 *
 * This is the **empirical acceptance gate** for the architectural cleanup
 * planned in `.claude/plans/jaunty-herding-kazoo.md`.
 *
 * ## What this test asserts
 *
 * When `@pyreon/reactivity` is loaded TWICE in the same JS heap (Vite
 * resolver divergence, sub-dep version mismatch, workspace+published mix,
 * HMR re-eval), the framework's load-bearing contract MUST hold:
 *
 *   Writing to a signal created via instance A must trigger an effect
 *   tracked via instance B.
 *
 * If this fails, reactivity is silently broken globally — signal updates
 * stop firing effects, and the user sees no error.
 *
 * ## Current state (main, 2026-05-24)
 *
 * **The test currently FAILS on main.** That failure is empirical proof
 * that the bug class is real and reproducible. It is marked `it.fails`
 * to document the known-broken state.
 *
 *   - On `main` (with PR #858 merged, PRs 2–6 still open): FAILS — the
 *     helper exists but `@pyreon/reactivity`'s own state files don't use
 *     it yet (that's PR #863).
 *   - On PR #863 branch (γ applied): PASSES — `defineCrossModuleState`
 *     shares state across instances via globalThis.
 *   - On α/β/ζ prototype branches: must PASS — the chosen mechanism
 *     must eliminate the bug class.
 *
 * ## When this test passes (lifecycle)
 *
 * The winning candidate's PR flips `it.fails` → `it` so a future regression
 * (someone reverts the fix; new contributor reintroduces bare module state)
 * starts failing the test and blocks the regression at the gate.
 *
 * ## How the reproducer works
 *
 * `loadDualReactivityInstances()` copies the published `lib/` tree to a
 * tmp directory and imports both the original AND the copy via absolute
 * `file://` URLs. Node's ESM loader keys its module cache by URL, so two
 * different absolute paths produce two distinct module records — two
 * instances of every module-level binding.
 *
 * Validation: the test runs a defensive check that `instanceA.signal !==
 * instanceB.signal` to confirm the reproducer actually created two
 * instances. If Node deduped them, the test throws (rather than silently
 * passing for the wrong reason).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearPyreonGlobalKeys, loadDualReactivityInstances } from './harness'

interface SignalLike<T> {
  (): T
  set: (v: T) => void
  peek: () => T
}
type SignalFactory = <T>(initial: T) => SignalLike<T>
type EffectFactory = (fn: () => void) => { dispose: () => void }

describe('Dual-instance contract', () => {
  beforeEach(() => {
    clearPyreonGlobalKeys()
  })

  afterEach(() => {
    clearPyreonGlobalKeys()
  })

  // EXPECTED TO FAIL on main. Flip `it.fails` → `it` in the winning
  // candidate's PR. See file-level docstring for the full lifecycle.
  it.fails(
    'CONTRACT — a signal write via instance A triggers an effect tracked via instance B',
    async () => {
      const handle = await loadDualReactivityInstances()
      try {
        const signalA = handle.instanceA.signal as SignalFactory
        const signalB = handle.instanceB.signal as SignalFactory
        const effectB = handle.instanceB.effect as EffectFactory

        // Defensive: confirm we actually have two distinct module instances.
        // Without this, the test could falsely pass if Node deduped the import.
        if (signalA === signalB) {
          throw new Error(
            '[reproducer-invalid] Both instances resolved to the same module — ' +
              'reproducer is degenerate. Vitest/Node deduped despite different absolute paths.',
          )
        }

        const count = signalA(0)
        const runs: number[] = []

        const eff = effectB(() => {
          runs.push(count())
        })

        // Initial sync run captures 0.
        expect(runs).toEqual([0])

        // Writing to instance A's signal MUST notify the effect tracked via
        // instance B. This is the load-bearing contract.
        count.set(1)
        count.set(2)

        // Asserts the bug class is eliminated. Currently fails on main.
        expect(runs).toEqual([0, 1, 2])

        eff.dispose()
      } finally {
        handle.cleanup()
      }
    },
  )
})
