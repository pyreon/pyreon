/**
 * Reactive coverage — the pure half.
 *
 * These run against a REAL reactive graph (real signals, real effects), not a
 * fabricated report, because the verdict that matters — `ran-once` — is a
 * property of how the framework actually fires, and a hand-built fixture would
 * simply restate the classifier's own rule back to it.
 */
import { effect, getReactiveGraph, signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import {
  coverageRows,
  coverageSummary,
  createCoverageSession,
  isCoverageAvailable,
} from '../reactive-coverage'

describe('a live session', () => {
  it('reports a signal that was never written as uncovered', () => {
    const session = createCoverageSession()
    session.start()
    const untouched = signal(0, { name: 'untouched' })
    void untouched()
    const report = session.sample()
    session.stop()

    const row = coverageRows(report).find((r) => r.name === 'untouched')
    expect(row, 'the unwritten signal should be flagged').toBeDefined()
    expect(row?.reason).toBe('never-changed')
    expect(row?.explain).toContain('never written')
  })

  it('clears a signal once it actually changes', () => {
    const session = createCoverageSession()
    session.start()
    const used = signal(0, { name: 'used' })
    used.set(1)
    const report = session.sample()
    session.stop()

    expect(coverageRows(report).some((r) => r.name === 'used')).toBe(false)
  })

  it('flags a mounted effect that never re-ran — the class line coverage calls 100%', () => {
    // This is the whole reason the panel exists. The effect's body RAN, so a
    // line-coverage tool reports the line as covered; its reactive edge was
    // never exercised, which is the "UI doesn't update" bug.
    const session = createCoverageSession()
    session.start()
    const src = signal(0, { name: 'src' })
    effect(() => {
      void src()
    })
    const report = session.sample()
    session.stop()

    const ranOnce = coverageRows(report).filter((r) => r.reason === 'ran-once')
    expect(ranOnce.length, 'the effect mounted but never re-ran').toBeGreaterThan(0)
    expect(ranOnce[0]?.explain).toContain('never re-ran')
  })

  it('counts an effect as covered once its dependency actually fires it', () => {
    const session = createCoverageSession()
    session.start()
    const src = signal(0, { name: 'src2' })
    let runs = 0
    effect(() => {
      void src()
      runs += 1
    })
    src.set(1)
    const report = session.sample()
    session.stop()

    expect(runs, 'the effect really did re-run').toBe(2)
    const summary = coverageSummary(report)
    expect(summary.total).toBeGreaterThan(0)
    expect(summary.ranOnce).toBe(0)
  })

  it('is idempotent on start — a second Record must not reset the baseline', () => {
    const session = createCoverageSession()
    session.start()
    const s = signal(0, { name: 'kept' })
    s.set(1)
    session.start() // second click
    const report = session.sample()
    session.stop()

    // If the second start had reset the baseline, `kept` would read as
    // never-changed again and the earlier write would be lost.
    expect(coverageRows(report).some((r) => r.name === 'kept')).toBe(false)
  })

  it('samples without ending the session, so Stop can read the final state', () => {
    const session = createCoverageSession()
    session.start()
    const s = signal(0, { name: 'later' })
    session.sample()
    s.set(1)
    const final = session.sample()
    session.stop()
    expect(coverageRows(final).some((r) => r.name === 'later')).toBe(false)
  })
})

describe('summary', () => {
  it('separates ran-once from never-changed, because they mean different things', () => {
    const session = createCoverageSession()
    session.start()
    const quiet = signal(0, { name: 'quiet' })
    void quiet()
    effect(() => {
      void quiet()
    })
    const summary = coverageSummary(session.sample())
    session.stop()

    // A signal no scenario wrote is often just an unexercised prop; an effect
    // that mounted and never re-ran is an unproven reactive edge. Collapsing
    // them into one number would hide the finding that has teeth.
    expect(summary.neverChanged).toBeGreaterThan(0)
    expect(summary.ranOnce).toBeGreaterThan(0)
  })
})

describe('availability', () => {
  it('is true under test, where the dev registry exists', () => {
    // The panel branches on this: a production build tree-shakes the registry,
    // an empty graph computes as `percent: 100`, and rendering that as a clean
    // pass would fabricate a verdict.
    expect(isCoverageAvailable()).toBe(true)
  })

  it('does NOT depend on the graph already having nodes', () => {
    // The first cut probed `getReactiveGraph().nodes.length > 0`, which is
    // wrong in a way that only shows up in the product: nodes are registered
    // only after tracking activates, so a healthy dev build reports ZERO nodes
    // until the user presses Record — and the panel would have told them to go
    // get a development build they were already running.
    expect(getReactiveGraph().nodes.length).toBe(0)
    expect(isCoverageAvailable()).toBe(true)
  })
})
