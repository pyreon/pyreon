// @vitest-environment happy-dom
/**
 * Computed fan-out probe.
 *
 * If 100 computeds all depend on the same signal, writing that signal
 * should produce N reads-are-lazy behavior: each computed only
 * recomputes when someone READS it. Naive implementations would
 * eagerly recompute all downstream computeds on every write.
 */
import { computed, effect, signal } from '@pyreon/reactivity'
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

describe('computed fan-out (lazy evaluation)', () => {
  it('100 computeds depend on one signal — writing it does NOT eagerly recompute them', async () => {
    const s = signal(0)
    // 100 computeds, nobody reads them yet
    const cs = Array.from({ length: 100 }, (_, i) => computed(() => s() * i))

    // Write s — none of the computeds are subscribed yet (nobody has read them),
    // so no recompute should fire.
    const outcome = await perfHarness.record('fan-out-no-reads', () => {
      s.set(1)
    })
    // Actually, `computed()` above DID prime the dep (I have to read to prime).
    // Wait — `computed(() => s() * i)` allocates the computed but doesn't
    // evaluate until someone READS it. So the dependency isn't established
    // until .read. So this test should show 0 recomputes.
    //
    // OK this also tests: does creating a computed eagerly evaluate? It
    // should NOT — Pyreon's computeds are lazy.
    expect(outcome.after['reactivity.computedRecompute']).toBeFalsy()

    // Disposal
    for (const c of cs) c.dispose()
  })

  it('100 computeds all READ once, then write signal — only computeds with active subscribers recompute on next read', async () => {
    const s = signal(0)
    const cs = Array.from({ length: 100 }, (_, i) => computed(() => s() * i))
    // Read each once — establishes dep on s
    for (const c of cs) c()
    // Now 100 recomputes fired (initial)
    const afterReads = perfHarness.snapshot()['reactivity.computedRecompute'] ?? 0
    expect(afterReads).toBe(100)

    // Write s — marks all 100 computeds dirty, but NO recomputes yet (lazy)
    const outcome = await perfHarness.record('write-no-second-read', () => {
      s.set(1)
    })
    expect(outcome.after['reactivity.computedRecompute']).toBeFalsy()

    // Now read only computed #0 — exactly 1 recompute
    const outcome2 = await perfHarness.record('read-one', () => {
      cs[0]!()
    })
    expect(outcome2.after['reactivity.computedRecompute']).toBe(1)

    for (const c of cs) c.dispose()
  })

  it('effect subscribed to 100 different computeds of one signal — N effect runs per write', async () => {
    const s = signal(0)
    const cs = Array.from({ length: 100 }, (_, i) => computed(() => s() * i))
    let effectRuns = 0
    // One effect that reads ALL 100 computeds
    effect(() => {
      for (const c of cs) c()
      effectRuns++
    })

    const outcome = await perfHarness.record('one-effect-100-comps', () => {
      s.set(1)
    })
    // All 100 computeds recompute (from effect reads) + 1 effect run
    expect(outcome.after['reactivity.effectRun']).toBe(1)
    expect(outcome.after['reactivity.computedRecompute']).toBe(100)
    // oxlint-disable-next-line no-console
    console.log(`[fanout] effectRuns=${effectRuns}`)

    for (const c of cs) c.dispose()
  })

  it('ONE effect reads 100 computeds, write signal 10 times — effect runs 11× (1 initial + 10)', async () => {
    const s = signal(0)
    const cs = Array.from({ length: 100 }, (_, i) => computed(() => s() * i))
    let effectRuns = 0
    effect(() => {
      for (const c of cs) c()
      effectRuns++
    })

    const outcome = await perfHarness.record('10-writes', () => {
      for (let i = 1; i <= 10; i++) s.set(i)
    })
    expect(outcome.after['reactivity.effectRun']).toBe(10)
    // 100 computeds × 10 writes = 1000 recomputes
    expect(outcome.after['reactivity.computedRecompute']).toBe(1000)
    // oxlint-disable-next-line no-console
    console.log(`[fanout] 10-writes, 100 computeds: effectRuns=${effectRuns}`)

    for (const c of cs) c.dispose()
  })
})
