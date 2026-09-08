/**
 * Unit tests for scripts/perf/diff.ts. The file lives outside a package so
 * it can't host its own vitest config; we pull it in here where the suite
 * is already wired.
 */
import { describe, expect, it } from 'vitest'
import { diffRecords, formatMarkdown, type RecordFile } from '../../../../../scripts/perf/diff'

function makeRecord(
  counters: Record<string, number>,
  extras: Partial<RecordFile> = {},
): RecordFile {
  return {
    sha: 'deadbeef',
    app: 'perf-dashboard',
    journey: 'boot',
    mode: 'dev',
    runs: 5,
    timestamp: '2026-04-23T12:00:00Z',
    medianWallMs: 100,
    medianHeapBytes: 1024 * 1024 * 10,
    counters,
    ...extras,
  }
}

describe('diffRecords', () => {
  it('flags a counter as regressed when delta exceeds the threshold', () => {
    const baseline = makeRecord({ 'styler.resolve': 100 })
    const current = makeRecord({ 'styler.resolve': 120 }) // +20%, > 10%
    const diff = diffRecords(baseline, current, 0.1)
    expect(diff.regressed).toBe(true)
    expect(diff.regressions).toHaveLength(1)
    expect(diff.regressions[0]).toMatchObject({
      name: 'styler.resolve',
      delta: 20,
      pct: 0.2,
    })
  })

  it('does NOT flag a counter below the threshold', () => {
    const baseline = makeRecord({ 'styler.resolve': 100 })
    const current = makeRecord({ 'styler.resolve': 105 }) // +5%
    const diff = diffRecords(baseline, current, 0.1)
    expect(diff.regressed).toBe(false)
    expect(diff.regressions).toHaveLength(0)
  })

  it('never flags a downward move, even a large one (less work = improvement)', () => {
    const baseline = makeRecord({ 'unistyle.descriptor': 200 })
    const current = makeRecord({ 'unistyle.descriptor': 20 })
    const diff = diffRecords(baseline, current, 0.1)
    expect(diff.regressed).toBe(false)
    const entry = diff.entries.find((e) => e.name === 'unistyle.descriptor')
    expect(entry?.delta).toBe(-180)
  })

  it('uses an absolute floor so rare counters do not trip the gate on 2 → 3', () => {
    const baseline = makeRecord({ 'router.prefetch': 2 })
    const current = makeRecord({ 'router.prefetch': 3 }) // +50% but tiny
    const diff = diffRecords(baseline, current, 0.1)
    expect(diff.regressed).toBe(false)
  })

  it('tracks new counters (present in current, absent in baseline)', () => {
    const baseline = makeRecord({ a: 1 })
    const current = makeRecord({ a: 1, b: 100 })
    const diff = diffRecords(baseline, current, 0.1)
    // 0 → 100 — the absolute floor is max(3, 0 * 0.1) = 3 → regressed
    expect(diff.regressions.map((r) => r.name)).toContain('b')
    const entry = diff.entries.find((e) => e.name === 'b')
    expect(entry?.pct).toBeNull()
  })

  it('tracks disappeared counters (present in baseline, absent in current)', () => {
    const baseline = makeRecord({ a: 5, gone: 10 })
    const current = makeRecord({ a: 5 })
    const diff = diffRecords(baseline, current, 0.1)
    const entry = diff.entries.find((e) => e.name === 'gone')
    expect(entry).toMatchObject({ before: 10, after: 0, delta: -10 })
    expect(diff.regressed).toBe(false) // downward = fine
  })

  it('sorts entries by delta descending (biggest regressions first)', () => {
    const baseline = makeRecord({ small: 5, big: 100, flat: 50 })
    const current = makeRecord({ small: 6, big: 200, flat: 50 })
    const diff = diffRecords(baseline, current, 0.1)
    expect(diff.entries.map((e) => e.name)).toEqual(['big', 'small', 'flat'])
  })

  it('populates wallMs and heap deltas', () => {
    const baseline = makeRecord({}, { medianWallMs: 100, medianHeapBytes: 10_000_000 })
    const current = makeRecord({}, { medianWallMs: 120, medianHeapBytes: 11_000_000 })
    const diff = diffRecords(baseline, current, 0.1)
    expect(diff.wallMsDelta).toBe(20)
    expect(diff.heapBytesDelta).toBe(1_000_000)
  })

  describe('success counters (.hit / Fast) — drop is the regression', () => {
    it('flags a .hit counter going down', () => {
      // Real scenario: cache stopped working. sheet.insert.hit drops to 0.
      const baseline = makeRecord({ 'styler.sheet.insert.hit': 621 })
      const current = makeRecord({ 'styler.sheet.insert.hit': 0 })
      const diff = diffRecords(baseline, current, 0.1)
      expect(diff.regressed).toBe(true)
      expect(diff.regressions.map((r) => r.name)).toEqual(['styler.sheet.insert.hit'])
    })

    it('does NOT flag a .hit counter going UP (more cache hits = good)', () => {
      const baseline = makeRecord({ 'styler.sheet.insert.hit': 100 })
      const current = makeRecord({ 'styler.sheet.insert.hit': 500 })
      const diff = diffRecords(baseline, current, 0.1)
      expect(diff.regressed).toBe(false)
    })

    it('does NOT flag a *Fast counter going UP (the fast path started winning)', () => {
      // #2669 landed the contiguous-insertion fast path; the chat journey's
      // counter went 0 -> 10 and the gate reported it as a regression. A
      // reconciler fast path firing is the improvement those counters exist
      // to show.
      const baseline = makeRecord({ 'runtime.mountFor.insertFast': 0 })
      const current = makeRecord({ 'runtime.mountFor.insertFast': 10 })
      expect(diffRecords(baseline, current, 0.1).regressed).toBe(false)
    })

    it('FLAGS a *Fast counter going down (the fast path stopped firing)', () => {
      // The direction that matters and was previously invisible: every update
      // now takes the general reconciler.
      const baseline = makeRecord({ 'runtime.mountFor.removeFast': 100 })
      const current = makeRecord({ 'runtime.mountFor.removeFast': 0 })
      const diff = diffRecords(baseline, current, 0.1)
      expect(diff.regressed).toBe(true)
      expect(diff.regressions.map((r) => r.name)).toEqual(['runtime.mountFor.removeFast'])
    })

    it('covers every Fast counter the harness documents', () => {
      // A totality check rather than one representative: COUNTERS.md lists
      // four, and a fifth added later must not silently read as work.
      for (const name of [
        'runtime.mountFor.insertFast',
        'runtime.mountFor.removeFast',
        'runtime.mountFor.clearFast',
        'runtime.mountFor.replaceFast',
      ]) {
        expect(diffRecords(makeRecord({ [name]: 0 }), makeRecord({ [name]: 50 }), 0.1).regressed).toBe(
          false,
        )
        expect(diffRecords(makeRecord({ [name]: 50 }), makeRecord({ [name]: 0 }), 0.1).regressed).toBe(
          true,
        )
      }
    })

    it('treats non-.hit counters the normal way (UP is bad)', () => {
      const baseline = makeRecord({ 'unistyle.descriptor': 20 })
      const current = makeRecord({ 'unistyle.descriptor': 250 })
      const diff = diffRecords(baseline, current, 0.1)
      expect(diff.regressed).toBe(true)
    })
  })
})

describe('host provenance', () => {
  it('warns when baseline and current came from different machine classes', () => {
    // The committed baselines were recorded on a laptop and compared against
    // CI runners for four months; every journey showed a large "regression"
    // that was only a faster machine. The counter table stays authoritative.
    const baseline = makeRecord({ 'styler.resolve': 100 }, { host: 'local' })
    const current = makeRecord({ 'styler.resolve': 100 }, { host: 'ci:Linux' })
    const md = formatMarkdown(baseline, current, diffRecords(baseline, current, 0.1))
    expect(md).toContain('different hosts')
    expect(md).toContain('NOT comparable')
  })

  it('says nothing when both came from the same host', () => {
    const baseline = makeRecord({ 'styler.resolve': 100 }, { host: 'ci:Linux' })
    const current = makeRecord({ 'styler.resolve': 100 }, { host: 'ci:Linux' })
    expect(formatMarkdown(baseline, current, diffRecords(baseline, current, 0.1))).not.toContain(
      'different hosts',
    )
  })

  it('says nothing when a pre-2026-09 file carries no host at all', () => {
    const baseline = makeRecord({ 'styler.resolve': 100 })
    const current = makeRecord({ 'styler.resolve': 100 }, { host: 'ci:Linux' })
    expect(formatMarkdown(baseline, current, diffRecords(baseline, current, 0.1))).not.toContain(
      'different hosts',
    )
  })
})
