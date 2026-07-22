import type { CheckStatus, ComponentIntelligence, VerifyVerdict } from '../types'
import { createCatalogGraph } from '../graph'
import { makeScenario } from '../scenario'

const ci = (over: Partial<ComponentIntelligence> = {}): ComponentIntelligence => ({
  name: 'Button',
  controls: [],
  axes: [],
  reactivity: [],
  scenarios: [],
  tags: [],
  ...over,
})

const verdict = (a11y: CheckStatus, ok: boolean): VerifyVerdict => ({
  ok,
  a11y: { status: a11y },
  interaction: { status: 'skip' },
  reactivityCoverage: { status: 'skip' },
  leak: { status: 'skip' },
  snapshot: { status: 'skip' },
})

describe('createCatalogGraph', () => {
  it('adds, lists, gets, and sizes (last write wins by name)', () => {
    const g = createCatalogGraph()
    g.add(ci({ name: 'A' })).add(ci({ name: 'B' }))
    expect(g.size()).toBe(2)
    expect(g.list().map((c) => c.name)).toEqual(['A', 'B'])
    expect(g.get('A')?.name).toBe('A')
    expect(g.get('Z')).toBeUndefined()

    g.add(ci({ name: 'A', summary: 'replaced' }))
    expect(g.size()).toBe(2)
    expect(g.get('A')?.summary).toBe('replaced')
  })

  it('seeds from an initial set and is chainable', () => {
    const g = createCatalogGraph([ci({ name: 'X' })])
    expect(g.add(ci({ name: 'Y' })).size()).toBe(2)
  })

  it('flattens scenarios across components and finds by tag', () => {
    const g = createCatalogGraph([
      ci({ name: 'A', tags: ['form'], scenarios: [makeScenario({ component: 'A', name: 'p' })] }),
      ci({ name: 'B', tags: ['layout'] }),
    ])
    expect(g.scenarios()).toHaveLength(1)
    expect(g.findByTag('form').map((c) => c.name)).toEqual(['A'])
    expect(g.findByTag('none')).toEqual([])
  })

  it('serializes toJSON', () => {
    const g = createCatalogGraph([ci({ name: 'A' })])
    expect(g.toJSON()).toEqual({ version: 1, components: [ci({ name: 'A' })] })
  })
})

describe('toLlmsText', () => {
  it('renders full detail (summary, tags, props, scenarios, verdicts)', () => {
    const pass = { ...makeScenario({ component: 'A', name: 'ok', source: 'auto-variant' }), verify: verdict('pass', true) }
    const fail = { ...makeScenario({ component: 'A', name: 'bad' }), verify: verdict('fail', false) }
    const plain = makeScenario({ component: 'A', name: 'plain' })
    const g = createCatalogGraph([
      ci({
        name: 'A',
        summary: 'a button',
        tags: ['form'],
        controls: [
          { name: 'label', kind: 'text', reactive: false, required: true },
          { name: 'x', kind: 'number', reactive: false, required: false },
        ],
        scenarios: [pass, fail, plain],
      }),
    ])
    const text = g.toLlmsText()
    expect(text).toContain('## A')
    expect(text).toContain('a button')
    expect(text).toContain('tags: form')
    expect(text).toContain('label: text (required)')
    expect(text).toContain('x: number')
    expect(text).toContain('scenarios (3):')
    expect(text).toContain('[pass]')
    expect(text).toContain('[FAIL]')
  })

  it('renders a minimal component (no summary / tags / props / scenarios)', () => {
    const text = createCatalogGraph([ci({ name: 'Bare' })]).toLlmsText()
    expect(text).toContain('## Bare')
    expect(text).not.toContain('tags:')
    expect(text).not.toContain('props:')
    expect(text).not.toContain('scenarios (')
  })
})
