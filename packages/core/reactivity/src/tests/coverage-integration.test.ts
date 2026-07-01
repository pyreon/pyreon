import { afterEach, describe, expect, it } from 'vitest'
import { computed } from '../computed'
import {
  startReactiveCoverage,
  stopReactiveCoverage,
  takeReactiveCoverage,
} from '../coverage'
import { effect } from '../effect'
import { __resetReactiveDevtoolsForTesting } from '../reactive-devtools'
import { signal } from '../signal'

afterEach(() => {
  stopReactiveCoverage()
  __resetReactiveDevtoolsForTesting()
})

describe('reactive coverage — real reactive graph', () => {
  it('classifies each node by whether its reactive behaviour was exercised', () => {
    startReactiveCoverage()

    // signal that changes → covered
    const changed = signal(0, { name: '$changed' })
    changed.set(1)

    // signal that never changes → never-changed
    signal('const', { name: '$constant' })

    // derived that recomputes after a dep change → covered
    const dep = signal(1, { name: '$dep' })
    const total = computed(() => dep() * 2)
    expect(total()).toBe(2) // first computation → fires 1
    dep.set(2)
    expect(total()).toBe(4) // recompute → fires 2 → covered

    // derived read once, no deps → ran-once
    const frozen = computed(() => 42)
    expect(frozen()).toBe(42)

    // effect that re-runs after a dep change → covered
    const trig = signal(0, { name: '$trig' })
    let runs = 0
    effect(() => {
      trig()
      runs++
    })
    trig.set(1) // re-run → fires 2 → covered
    expect(runs).toBe(2)

    // effect that runs once at mount, reads nothing reactive → ran-once
    effect(() => {
      /* no reactive read */
    })

    const report = takeReactiveCoverage()

    // 4 signals ($changed, $constant, $dep, $trig) + 2 derived + 2 effects = 8 nodes
    expect(report.byKind.signal.total).toBe(4)
    expect(report.byKind.derived.total).toBe(2)
    expect(report.byKind.effect.total).toBe(2)
    expect(report.total).toBe(8)

    // covered: $changed, $dep, $trig (all changed), total (recomputed),
    // effect(trig) (re-ran) = 5
    expect(report.covered).toBe(5)

    const byName = (n: string) => report.entries.find((e) => e.name === n)
    expect(byName('$changed')).toMatchObject({ covered: true, reason: 'covered' })
    expect(byName('$dep')).toMatchObject({ covered: true, reason: 'covered' })
    expect(byName('$constant')).toMatchObject({ covered: false, reason: 'never-changed' })

    // the ran-once derived + effect (by reason)
    const reasons = report.uncoveredEntries.map((e) => e.reason).sort()
    expect(reasons).toEqual(['never-changed', 'ran-once', 'ran-once'])

    // source locations are captured for the nodes created in THIS file
    const withLoc = report.entries.filter((e) => e.loc)
    expect(withLoc.length).toBeGreaterThan(0)
    expect(withLoc.some((e) => e.loc?.file.includes('coverage-integration'))).toBe(true)
  })

  it('exercising a reactive path flips it from uncovered → covered (bisect anchor)', () => {
    // First session: a derived that is read once but its dep never changes.
    startReactiveCoverage()
    const a = signal(1, { name: '$a' })
    const doubled = computed(() => a() * 2)
    expect(doubled()).toBe(2) // fires 1 → ran-once
    let report = takeReactiveCoverage()
    expect(report.entries.find((e) => e.kind === 'derived')).toMatchObject({
      covered: false,
      reason: 'ran-once',
    })
    stopReactiveCoverage()
    __resetReactiveDevtoolsForTesting()

    // Second session: SAME shape, but now we exercise the reactive path.
    startReactiveCoverage()
    const b = signal(1, { name: '$b' })
    const doubled2 = computed(() => b() * 2)
    expect(doubled2()).toBe(2)
    b.set(5) // exercise the reactive path
    expect(doubled2()).toBe(10) // recompute → fires 2 → covered
    report = takeReactiveCoverage()
    expect(report.entries.find((e) => e.kind === 'derived')).toMatchObject({
      covered: true,
      reason: 'covered',
    })
  })

  it('retention keeps a dropped node in the denominator (no GC flakiness)', () => {
    startReactiveCoverage()
    // Create a signal, drop every reference to it — retention must keep it
    // counted so the denominator is complete.
    ;(() => {
      const ephemeral = signal(0, { name: '$ephemeral' })
      void ephemeral // created + named, never changed, then the ref is dropped
    })()
    const report = takeReactiveCoverage()
    // The ephemeral signal is still counted (uncovered, never-changed).
    expect(report.entries.some((e) => e.name === '$ephemeral')).toBe(true)
  })
})
