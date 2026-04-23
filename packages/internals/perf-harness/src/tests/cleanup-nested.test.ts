// @vitest-environment happy-dom
/**
 * `onCleanup` ordering + nested effect lifecycle probe.
 */
import { effect, onCleanup, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

describe('onCleanup ordering', () => {
  it('cleanups run in the registered order when effect disposes (or re-runs)', () => {
    const log: string[] = []
    const s = signal(0)
    const e = effect(() => {
      s()
      onCleanup(() => log.push('a'))
      onCleanup(() => log.push('b'))
      onCleanup(() => log.push('c'))
    })
    // Trigger re-run — first runs all cleanups from first run
    s.set(1)
    // Cleanups fire in registration order
    expect(log).toEqual(['a', 'b', 'c'])
    // Re-run registered new cleanups; dispose should run THOSE
    e.dispose()
    expect(log).toEqual(['a', 'b', 'c', 'a', 'b', 'c'])
  })

  it('cleanup exceptions do not block subsequent cleanups', () => {
    const log: string[] = []
    const e = effect(() => {
      onCleanup(() => {
        log.push('a')
      })
      onCleanup(() => {
        log.push('b-throws')
        throw new Error('boom')
      })
      onCleanup(() => {
        log.push('c')
      })
    })
    e.dispose()
    expect(log).toEqual(['a', 'b-throws', 'c'])
  })
})

describe('nested effects', () => {
  it('inner effect created inside outer runs independently', async () => {
    const outer = signal(0)
    const inner = signal(0)
    const outcome = await perfHarness.record('nested-independent', () => {
      effect(() => {
        outer()
        effect(() => {
          inner()
        })
      })
      inner.set(1) // inner effect re-runs
      inner.set(2) // inner effect re-runs
      outer.set(1) // outer re-runs → creates a NEW inner effect
      inner.set(3) // NOW two inner effects fire (old + new)
    })
    // Tricky: 1 outer initial + 1 inner initial + 2 (inner writes 1,2) +
    // 1 (outer write re-runs outer) + 1 (new inner initial) +
    // 2 (both inner effects fire for inner=3) = 8
    //
    // If the framework doesn't dispose the old inner when outer re-runs,
    // we'd see 8. If it DOES auto-dispose, we'd see 7 (new inner fires alone).
    //
    // Either is a valid design choice; this test just documents which Pyreon chose.
    const runs = outcome.after['reactivity.effectRun'] ?? 0
    expect(runs).toBeGreaterThanOrEqual(7)
    // biome-ignore lint/suspicious/noConsole: probe output
    console.log(
      `[nested] effect runs: ${runs} ${runs === 7 ? '(outer auto-disposes inner on re-run)' : '(inner leaks across outer re-runs)'}`,
    )
  })

  it('disposing outer effect stops its inner effects from re-running', () => {
    const outer = signal(0)
    const inner = signal(0)
    let innerRuns = 0
    const outerEffect = effect(() => {
      outer()
      effect(() => {
        inner()
        innerRuns++
      })
    })
    innerRuns = 0 // reset after initial runs
    inner.set(1)
    const runsAfterInnerWrite = innerRuns
    outerEffect.dispose()
    inner.set(2)
    const runsAfterDispose = innerRuns
    // After dispose, no new runs (or at most 0)
    expect(runsAfterDispose).toBe(runsAfterInnerWrite)
  })
})
