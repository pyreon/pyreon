import type { GraphInsight } from '@pyreon/reactivity'
import { insightRows, insightSummary } from '../graph-insights'

const insight = (kind: GraphInsight['kind'], name: string, id = 1): GraphInsight => ({
  kind,
  nodeId: id,
  name,
  detail: `${kind} detail`,
})

describe('insightRows', () => {
  it('puts orphan signals FIRST — the only kind that is usually a bug', () => {
    // The other two are costs a healthy component can legitimately have. An
    // orphan is either dead state or a SEVERED read, and a severed read is
    // the "UI silently never updates" class.
    const rows = insightRows([
      insight('deep-chain', 'c'),
      insight('high-fanout', 'b'),
      insight('orphan-signal', 'a'),
    ])
    expect(rows.map((r) => r.kind)).toEqual(['orphan-signal', 'high-fanout', 'deep-chain'])
  })

  it('orders ties by name, so the panel does not reshuffle between reads', () => {
    const rows = insightRows([insight('high-fanout', 'zeta'), insight('high-fanout', 'alpha')])
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'zeta'])
  })

  it('names an anonymous node rather than rendering an empty cell', () => {
    // Anonymous computeds are normal; a blank cell reads as a rendering bug.
    expect(insightRows([insight('high-fanout', '', 42)])[0]?.name).toBe('#42')
  })

  it('states what each smell COSTS, not what it is', () => {
    // "high-fanout: many subscribers" restates the label. The row has to say
    // the consequence or the panel is a glossary.
    const rows = insightRows([insight('high-fanout', 'x'), insight('orphan-signal', 'y')])
    expect(rows.find((r) => r.kind === 'high-fanout')?.meaning).toContain('repaint')
    expect(rows.find((r) => r.kind === 'orphan-signal')?.meaning).toContain('never updates')
  })
})

describe('insightSummary', () => {
  it('says so plainly when there is nothing wrong', () => {
    expect(insightSummary([])).toContain('No shape smells')
  })

  it('leads with the orphan count — the number to act on', () => {
    const rows = insightRows([
      insight('orphan-signal', 'a'),
      insight('high-fanout', 'b'),
      insight('deep-chain', 'c'),
    ])
    expect(insightSummary(rows)).toMatch(/^1 orphan signal/)
    expect(insightSummary(rows)).toContain('2 shape notes')
  })

  it('does NOT imply a bug when only costs are present', () => {
    // A bare total invites ignoring the panel; a wrong alarm invites
    // distrusting it. Neither is acceptable.
    const rows = insightRows([insight('high-fanout', 'b')])
    expect(insightSummary(rows)).toContain('costs, not bugs')
    expect(insightSummary(rows)).not.toContain('orphan')
  })

  it('singularises, because "1 orphan signals" reads as a bug in the tool', () => {
    expect(insightSummary(insightRows([insight('orphan-signal', 'a')]))).toContain('1 orphan signal —')
    expect(insightSummary(insightRows([insight('high-fanout', 'b')]))).toContain('1 shape note')
  })
})

describe('createInsightSession — scoping to the component', () => {
  it('excludes nodes that existed BEFORE the baseline', async () => {
    // The correctness of the whole panel. The workbench and the preview share
    // one reactivity instance, so an unscoped read describes Atlas's own
    // chrome — sidebar signals, theme, search box — as the component's smells.
    const { activateReactiveDevtools, effect, signal } = await import('@pyreon/reactivity')
    const { createInsightSession } = await import('../graph-insights')
    activateReactiveDevtools()

    // "Chrome": an orphan that must NEVER be attributed to the component.
    const chromeOrphan = signal(0, { name: 'chromeOrphan' })
    void chromeOrphan

    const session = createInsightSession()
    session.baseline()

    // "Component": its own orphan, which MUST be reported.
    const ownOrphan = signal(0, { name: 'ownOrphan' })
    void ownOrphan
    // A subscribed signal, so the fixture is not all-orphans.
    const live = signal(0, { name: 'live' })
    effect(() => {
      void live()
    })

    const names = session.sample().map((r) => r.name)
    expect(names).toContain('ownOrphan')
    expect(names).not.toContain('chromeOrphan')
  })
})
