/**
 * Reactive-native matchers — the differentiator. These read Pyreon's reactive
 * graph to assert on fire counts and re-run behavior, which DOM-only testing
 * libraries fundamentally cannot express (they have no graph). Deletes the
 * hand-rolled `let ran = 0; …; expect(ran).toBe(n)` pattern.
 *
 * Identity: signal/computed callables + `effect()` handles carry a graph node
 * id (`__pxRdId`), read via `@pyreon/reactivity`'s name-stable `_rdNodeId`.
 * Fire counts are recorded always-on in `__DEV__` and surfaced through
 * `getReactiveGraph()` once the devtools read flag is active (idempotent).
 *
 * These require a dev/test build — under a production build the reactive graph
 * is tree-shaken away, so they throw a clear error rather than silently pass.
 */
import { _rdNodeId, activateReactiveDevtools, getReactiveGraph } from '@pyreon/reactivity'

function nodeIdOf(target: unknown, what: string): number {
  const id = _rdNodeId(target)
  if (id === undefined) {
    throw new Error(
      `[Pyreon] ${what}: target is not a reactive node. Pass a signal, computed, or effect() handle created in a dev/test build (the reactive graph is tree-shaken in production, so these matchers require NODE_ENV !== 'production').`,
    )
  }
  return id
}

function firesOf(id: number): number {
  // getReactiveGraph() gates node exposure on the devtools READ flag (fires
  // are recorded always-on in __DEV__). Activation is idempotent.
  activateReactiveDevtools()
  const node = getReactiveGraph().nodes.find((n) => n.id === id)
  return node?.fires ?? 0
}

export interface SignalAssertions {
  /** Assert the signal changed (was written) exactly `n` times. */
  toHaveChangedTimes(n: number): void
  /** Assert the computed recomputed exactly `n` times. */
  toHaveRecomputedTimes(n: number): void
}

/**
 * Assert on a signal's or computed's fire count.
 *
 * @example
 *   expectSignal(total).toHaveRecomputedTimes(1)  // recomputed once, no thrash
 */
export function expectSignal(target: unknown): SignalAssertions {
  const id = nodeIdOf(target, 'expectSignal')
  const check = (n: number, verb: string) => {
    const actual = firesOf(id)
    if (actual !== n) {
      throw new Error(`[Pyreon] expected reactive node to have ${verb} ${n}×, got ${actual}`)
    }
  }
  return {
    toHaveChangedTimes: (n) => check(n, 'changed'),
    toHaveRecomputedTimes: (n) => check(n, 'recomputed'),
  }
}

export interface EffectAssertions {
  /** Assert the effect re-ran at least once during `action`. */
  toReRunWhen(action: () => void): void
  /** Assert the effect did NOT re-run during `action` (fine-grained precision). */
  notToReRunWhen(action: () => void): void
}

/**
 * Assert an effect's re-run behavior around an action. The NEGATIVE form
 * (`notToReRunWhen`) verifies fine-grained precision — that an unrelated write
 * does NOT re-run the effect — which is impossible to express with a
 * whole-component re-render model.
 *
 * @example
 *   expectEffect(logEffect).toReRunWhen(() => qty.set(3))
 *   expectEffect(logEffect).notToReRunWhen(() => unrelated.set(9))
 *
 * @param handle the `Effect` returned by `effect(...)`.
 */
export function expectEffect(handle: unknown): EffectAssertions {
  const id = nodeIdOf(handle, 'expectEffect')
  return {
    toReRunWhen(action) {
      const before = firesOf(id)
      action()
      const after = firesOf(id)
      if (after <= before) {
        throw new Error(
          `[Pyreon] expected effect to re-run on the action, but it did not (fires ${before} → ${after})`,
        )
      }
    },
    notToReRunWhen(action) {
      const before = firesOf(id)
      action()
      const after = firesOf(id)
      if (after !== before) {
        throw new Error(
          `[Pyreon] expected effect NOT to re-run on the action, but it fired (${before} → ${after})`,
        )
      }
    },
  }
}
