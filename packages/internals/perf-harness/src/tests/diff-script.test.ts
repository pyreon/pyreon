/**
 * Unit tests for scripts/perf/diff.ts. The file lives outside a package so
 * it can't host its own vitest config; we pull it in here where the suite
 * is already wired.
 */
import { describe, expect, it } from 'vitest'
import { diffRecords, type RecordFile } from '../../../../../scripts/perf/diff'

function makeRecord(counters: Record<string, number>, extras: Partial<RecordFile> = {}): RecordFile {
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
})
