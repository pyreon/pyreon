/**
 * Reactive-coverage shaping + the session's non-recording paths.
 *
 * `reactive-coverage.test.ts` drives a REAL session, which is what proves the
 * classification. What a live session cannot produce on demand is the row a
 * panel actually renders in its degenerate forms — an anonymous node, a
 * creation site with no line, a `never-ran` entry — so those are pinned against
 * reports built directly, and paired with the shapes they must NOT be confused
 * with.
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { activateReactiveDevtools, signal } from '@pyreon/reactivity'
import type { ReactiveCoverageEntry, ReactiveCoverageReport } from '@pyreon/reactivity/coverage'
import { coverageRows, coverageSummary, createCoverageSession } from '../reactive-coverage'

const entry = (over: Partial<ReactiveCoverageEntry> & { id: number }): ReactiveCoverageEntry => ({
  kind: 'signal',
  name: '',
  fires: 0,
  subscribers: 0,
  covered: false,
  reason: 'never-changed',
  ...over,
})

const report = (uncovered: ReactiveCoverageEntry[]): ReactiveCoverageReport =>
  ({
    total: uncovered.length,
    covered: 0,
    uncovered: uncovered.length,
    percent: 0,
    byKind: {} as ReactiveCoverageReport['byKind'],
    entries: uncovered,
    uncoveredEntries: uncovered,
  }) as ReactiveCoverageReport

describe('coverageRows — the creation-site cell', () => {
  it('renders `dir/file:line` when the location is complete', () => {
    const rows = coverageRows(
      report([entry({ id: 1, loc: { file: '/a/b/src/Counter.tsx', line: 12, col: 5 } })]),
    )
    expect(rows[0]!.where).toBe('src/Counter.tsx:12')
  })

  it('renders the file ALONE when the line is unknown, never `file:undefined`', () => {
    // `line: 0` is the shape a stack frame with no line produces; the cell
    // must not read `file:0`.
    const rows = coverageRows(
      report([entry({ id: 1, loc: { file: '/a/b/src/Counter.tsx', line: 0, col: 0 } })]),
    )
    expect(rows[0]!.where).toBe('src/Counter.tsx')
  })

  it('renders an EMPTY cell when there is no location at all', () => {
    expect(coverageRows(report([entry({ id: 1 })]))[0]!.where).toBe('')
    expect(
      coverageRows(report([entry({ id: 1, loc: { file: '', line: 1, col: 1 } })]))[0]!.where,
    ).toBe('')
  })
})

describe('coverageRows — naming and explanation', () => {
  it('names an anonymous node by id rather than rendering an empty cell', () => {
    expect(coverageRows(report([entry({ id: 7 })]))[0]!.name).toBe('#7')
  })

  it('keeps a real name where there is one', () => {
    expect(coverageRows(report([entry({ id: 7, name: 'count' })]))[0]!.name).toBe('count')
  })

  it('carries a plain-language reason per row — the token alone teaches nothing', () => {
    const rows = coverageRows(
      report([
        entry({ id: 1, reason: 'never-changed' }),
        entry({ id: 2, reason: 'ran-once', kind: 'effect' }),
        entry({ id: 3, reason: 'never-ran', kind: 'effect' }),
      ]),
    )
    expect(rows.map((r) => r.explain)).toEqual([
      'never written — no scenario changed this signal',
      'mounted but never re-ran — its reactive path is untested',
      'created but never executed',
    ])
  })
})

describe('coverageSummary', () => {
  it('counts a `never-ran` entry as NEITHER ran-once nor never-changed', () => {
    // The two named buckets mean different things, and a node that was created
    // and never executed is a third thing again — folding it into either would
    // overstate that bucket's finding.
    const summary = coverageSummary(report([entry({ id: 1, reason: 'never-ran', kind: 'effect' })]))
    expect(summary.ranOnce).toBe(0)
    expect(summary.neverChanged).toBe(0)
    expect(summary.total).toBe(1)
  })

  it('separates the two buckets when all three reasons are present', () => {
    const summary = coverageSummary(
      report([
        entry({ id: 1, reason: 'never-changed' }),
        entry({ id: 2, reason: 'never-changed' }),
        entry({ id: 3, reason: 'ran-once', kind: 'effect' }),
        entry({ id: 4, reason: 'never-ran', kind: 'effect' }),
      ]),
    )
    expect(summary.ranOnce).toBe(1)
    expect(summary.neverChanged).toBe(2)
  })
})

describe('createCoverageSession — outside a session', () => {
  // The panel activates the devtools bridge; without it the graph records
  // nothing at all, and "0 nodes" would be indistinguishable from "not
  // recording" (see `recentCandidates`, which activates for the same reason).
  const seed = (name: string) => {
    activateReactiveDevtools()
    const s = signal(0, { name })
    void s()
  }

  it('samples the WHOLE graph, so the panel shows a static picture instead of nothing', () => {
    seed('cov-before-session')
    const session = createCoverageSession()
    const outside = session.sample()
    expect(coverageRows(outside).some((r) => r.name === 'cov-before-session')).toBe(true)
  })

  it('is session-SCOPED once started — the same node is excluded from the denominator', () => {
    // The contrast is the point: the fallback is a picture of everything, and a
    // session is a measurement of what happened during it. Reporting the first
    // as the second would count the workbench chrome as the component's
    // uncovered reactive edges.
    seed('cov-scoping-check')
    const session = createCoverageSession()
    session.start()
    const inside = session.sample()
    session.stop()
    expect(coverageRows(inside).some((r) => r.name === 'cov-scoping-check')).toBe(false)
  })

  it('stop() without start() is a no-op, not an error', () => {
    seed('cov-stray-stop')
    const session = createCoverageSession()
    expect(() => session.stop()).not.toThrow()
    // And it stays OUTSIDE a session: a stray Stop must not leave the panel
    // sampling an empty session it never began.
    expect(coverageRows(session.sample()).some((r) => r.name === 'cov-stray-stop')).toBe(true)
  })
})
