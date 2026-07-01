import { describe, expect, it } from 'vitest'
import {
  classifyReactiveNode,
  computeReactiveCoverage,
  formatReactiveCoverage,
} from '../coverage'
import type { ReactiveNode } from '../reactive-devtools'

/** Build a synthetic node (only the fields coverage reads). */
function node(over: Partial<ReactiveNode> & Pick<ReactiveNode, 'kind' | 'fires'>): ReactiveNode {
  return {
    id: over.id ?? 1,
    kind: over.kind,
    name: over.name ?? `${over.kind}#${over.id ?? 1}`,
    value: over.value ?? '',
    subscribers: over.subscribers ?? 0,
    fires: over.fires,
    lastFire: over.lastFire ?? null,
    ...(over.loc ? { loc: over.loc } : {}),
  }
}

describe('classifyReactiveNode — kind-aware thresholds', () => {
  it('signal: covered iff it changed at least once', () => {
    expect(classifyReactiveNode({ kind: 'signal', fires: 0 })).toEqual({
      covered: false,
      reason: 'never-changed',
    })
    expect(classifyReactiveNode({ kind: 'signal', fires: 1 })).toEqual({
      covered: true,
      reason: 'covered',
    })
    expect(classifyReactiveNode({ kind: 'signal', fires: 9 }).covered).toBe(true)
  })

  it('effect: covered only when it re-ran past the mount run (fires >= 2)', () => {
    expect(classifyReactiveNode({ kind: 'effect', fires: 0 })).toEqual({
      covered: false,
      reason: 'never-ran',
    })
    expect(classifyReactiveNode({ kind: 'effect', fires: 1 })).toEqual({
      covered: false,
      reason: 'ran-once',
    })
    expect(classifyReactiveNode({ kind: 'effect', fires: 2 })).toEqual({
      covered: true,
      reason: 'covered',
    })
  })

  it('derived: same thresholds as effect (>=2 recomputed = covered)', () => {
    expect(classifyReactiveNode({ kind: 'derived', fires: 0 }).reason).toBe('never-ran')
    expect(classifyReactiveNode({ kind: 'derived', fires: 1 }).reason).toBe('ran-once')
    expect(classifyReactiveNode({ kind: 'derived', fires: 2 }).covered).toBe(true)
  })
})

describe('computeReactiveCoverage — report math', () => {
  it('aggregates totals, percent, and per-kind stats', () => {
    const report = computeReactiveCoverage([
      node({ id: 1, kind: 'signal', fires: 3 }), // covered
      node({ id: 2, kind: 'signal', fires: 0 }), // never-changed
      node({ id: 3, kind: 'derived', fires: 2 }), // covered
      node({ id: 4, kind: 'derived', fires: 1 }), // ran-once
      node({ id: 5, kind: 'effect', fires: 5 }), // covered
      node({ id: 6, kind: 'effect', fires: 0 }), // never-ran
    ])
    expect(report.total).toBe(6)
    expect(report.covered).toBe(3)
    expect(report.uncovered).toBe(3)
    expect(report.percent).toBe(50)
    expect(report.byKind).toEqual({
      signal: { total: 2, covered: 1 },
      derived: { total: 2, covered: 1 },
      effect: { total: 2, covered: 1 },
    })
    expect(report.uncoveredEntries.map((e) => e.reason)).toEqual([
      'never-changed',
      'ran-once',
      'never-ran',
    ])
  })

  it('rounds percent to one decimal', () => {
    // 2 of 3 covered → 66.666… → 66.7
    const report = computeReactiveCoverage([
      node({ id: 1, kind: 'signal', fires: 1 }),
      node({ id: 2, kind: 'signal', fires: 1 }),
      node({ id: 3, kind: 'signal', fires: 0 }),
    ])
    expect(report.percent).toBe(66.7)
  })

  it('empty registry → vacuous 100%', () => {
    const report = computeReactiveCoverage([])
    expect(report).toMatchObject({ total: 0, covered: 0, uncovered: 0, percent: 100 })
  })

  it('carries loc + kind through to entries', () => {
    const loc = { file: '/app/Cart.tsx', line: 12, col: 20 }
    const report = computeReactiveCoverage([node({ id: 7, kind: 'signal', fires: 0, loc })])
    expect(report.uncoveredEntries[0]).toMatchObject({ kind: 'signal', reason: 'never-changed', loc })
  })
})

describe('formatReactiveCoverage', () => {
  const report = computeReactiveCoverage([
    node({ id: 1, kind: 'signal', name: 'price', fires: 3 }),
    node({ id: 2, kind: 'signal', name: 'qty', fires: 0, loc: { file: '/app/Cart.tsx', line: 8, col: 9 } }),
    node({ id: 3, kind: 'derived', name: 'total', fires: 1, loc: { file: '/app/Cart.tsx', line: 11, col: 18 } }),
  ])

  it('renders the headline, per-kind line, and uncovered list with reasons + loc', () => {
    const out = formatReactiveCoverage(report)
    expect(out).toContain('Reactive Coverage — 33.3% (1 of 3 reactive nodes exercised)')
    expect(out).toContain('signals 1/2')
    expect(out).toContain('Uncovered (2):')
    expect(out).toContain('never changed')
    expect(out).toContain('qty [signal]')
    expect(out).toContain('/app/Cart.tsx:8:9')
    expect(out).toContain('ran once, never re-ran')
    expect(out).toContain('total [derived]')
  })

  it('honors the limit', () => {
    const out = formatReactiveCoverage(report, { limit: 1 })
    expect(out).toContain('… and 1 more')
  })

  it('showCovered lists covered nodes with fire counts', () => {
    const out = formatReactiveCoverage(report, { showCovered: true })
    expect(out).toContain('Covered (1):')
    expect(out).toContain('price [signal] ×3')
  })
})
