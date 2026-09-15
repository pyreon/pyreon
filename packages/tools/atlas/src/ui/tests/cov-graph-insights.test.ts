/**
 * Graph-insight shaping — the arms a healthy fixture does not reach.
 *
 * `graph-insights.test.ts` covers the orphan-first ordering and the singular
 * forms; these pin the plural forms (a panel that says "1 orphan signals" reads
 * as a bug in the tool, and so does a missing plural), the both-kinds sentence,
 * and the UNKNOWN kind — a `@pyreon/reactivity` that grows a fourth insight
 * must still render, sorted last, rather than showing an empty meaning cell.
 */
import { describe, expect, it } from 'vitest'
import type { GraphInsight } from '@pyreon/reactivity'
import { areInsightsAvailable, insightRows, insightSummary, readInsights } from '../graph-insights'

const insight = (kind: string, nodeId: number, name = ''): GraphInsight =>
  ({ kind, nodeId, name, detail: 'd' }) as GraphInsight

describe('insightRows — an insight kind this build does not know', () => {
  it('renders it with an empty meaning rather than dropping or crashing on it', () => {
    const rows = insightRows([insight('future-kind', 1, 'z')])
    expect(rows[0]!.meaning).toBe('')
  })

  it('sorts an unknown kind LAST — a known finding must not be buried by it', () => {
    const rows = insightRows([
      insight('future-kind', 1, 'aaa'),
      insight('deep-chain', 2, 'zzz'),
      insight('orphan-signal', 3, 'mmm'),
    ])
    expect(rows.map((r) => r.kind)).toEqual(['orphan-signal', 'deep-chain', 'future-kind'])
  })

  it('still names an unknown-kind node by id when it is anonymous', () => {
    expect(insightRows([insight('future-kind', 8)])[0]!.name).toBe('#8')
  })
})

describe('insightSummary — plurals', () => {
  it('pluralises shape notes when there are no orphans', () => {
    const rows = insightRows([insight('deep-chain', 1, 'a'), insight('high-fanout', 2, 'b')])
    expect(insightSummary(rows)).toBe('2 shape notes — costs, not bugs.')
  })

  it('pluralises orphans', () => {
    const rows = insightRows([insight('orphan-signal', 1, 'a'), insight('orphan-signal', 2, 'b')])
    expect(insightSummary(rows)).toBe(
      '2 orphan signals — an orphan is either dead state or a severed read.',
    )
  })

  it('reports BOTH kinds when both are present, without conflating them', () => {
    const rows = insightRows([
      insight('orphan-signal', 1, 'a'),
      insight('deep-chain', 2, 'b'),
      insight('high-fanout', 3, 'c'),
    ])
    expect(insightSummary(rows)).toBe(
      '1 orphan signal · 2 shape notes — an orphan is either dead state or a severed read.',
    )
  })

  it('singularises the note half too', () => {
    const rows = insightRows([insight('orphan-signal', 1, 'a'), insight('deep-chain', 2, 'b')])
    expect(insightSummary(rows)).toBe(
      '1 orphan signal · 1 shape note — an orphan is either dead state or a severed read.',
    )
  })
})

describe('the unscoped exports', () => {
  it('readInsights describes the WHOLE page graph without throwing', () => {
    // Exported for a host that owns the page outright. Inside Atlas the scoped
    // session is the right call — an unscoped read attributes the workbench's
    // own chrome to the component — but the unscoped form still has to work.
    const rows = readInsights()
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.every((r) => typeof r.name === 'string' && r.name.length > 0)).toBe(true)
  })

  it('availability is the DEV gate itself, not a node count', () => {
    // Nodes register only once tracking is active, so an empty graph is normal
    // before anything has run; reporting "unavailable" then would be wrong for
    // every user who has not interacted yet.
    expect(areInsightsAvailable()).toBe(process.env.NODE_ENV !== 'production')
    expect(areInsightsAvailable()).toBe(true)
  })
})
