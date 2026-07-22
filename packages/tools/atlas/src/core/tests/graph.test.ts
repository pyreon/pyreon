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

const failVerdict = (findings: string[]): VerifyVerdict => ({
  ok: false,
  a11y: { status: 'fail', findings },
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

describe('search', () => {
  const graph = () =>
    createCatalogGraph([
      ci({
        name: 'Button',
        tags: ['form'],
        controls: [{ name: 'label', kind: 'text', reactive: false, required: true }],
        scenarios: [makeScenario({ component: 'Button', name: 'disabled state' })],
      }),
      ci({ name: 'Badge', tags: ['feedback'] }),
    ])

  it('returns [] for a blank query', () => {
    expect(graph().search('   ')).toEqual([])
  })
  it('matches component names with the highest score, case-insensitively', () => {
    expect(graph().search('BUT')[0]).toMatchObject({ component: 'Button', kind: 'component', score: 10 })
  })
  it('matches tags and props', () => {
    expect(graph().search('form').some((h) => h.component === 'Button' && h.kind === 'component')).toBe(true)
    expect(graph().search('label').some((h) => h.component === 'Button' && h.kind === 'component')).toBe(true)
  })
  it('matches scenario names even when the component itself does not match', () => {
    const hits = graph().search('disabled')
    expect(hits).toEqual([{ component: 'Button', kind: 'scenario', scenario: 'disabled state', score: 3 }])
  })
  it('returns [] when nothing matches', () => {
    expect(graph().search('zzz')).toEqual([])
  })
  it('ranks component matches above scenario matches', () => {
    const g = createCatalogGraph([
      ci({ name: 'Toggle', scenarios: [makeScenario({ component: 'Toggle', name: 'toggle on' })] }),
    ])
    expect(g.search('toggle').map((h) => h.kind)).toEqual(['component', 'scenario'])
  })
})

describe('toAgentGuide', () => {
  it('renders a prescriptive guide: allowed values, a correct example, and avoids', () => {
    const good = {
      ...makeScenario({ component: 'Button', name: 'primary', args: { label: 'Hi', state: 'primary' } }),
      verify: verdict('pass', true),
    }
    const bad = {
      ...makeScenario({ component: 'Button', name: 'Empty', args: { label: '' } }),
      verify: failVerdict(['missing accessible name: "label" is empty']),
    }
    const guide = createCatalogGraph([
      ci({
        name: 'Button',
        tags: ['form'],
        controls: [
          { name: 'label', kind: 'text', reactive: false, required: true },
          { name: 'state', kind: 'select', options: ['primary', 'secondary'], reactive: false, required: true },
          { name: 'disabled', kind: 'boolean', reactive: false, required: false },
          { name: 'onValue', kind: 'reactive', reactive: true, required: false },
          { name: 'size', kind: 'select', reactive: false, required: false }, // select w/o options -> type fallback
        ],
        scenarios: [good, bad],
      }),
    ]).toAgentGuide()

    expect(guide).toContain('## Button [form]')
    expect(guide).toContain('required: label(text), state(primary|secondary)')
    expect(guide).toContain('optional: disabled(bool), onValue(()=>…), size(select)')
    expect(guide).toContain('reactive (pass a signal accessor): onValue')
    expect(guide).toContain('correct: {"label":"Hi","state":"primary"}')
    expect(guide).toContain('avoid: "Empty" — missing accessible name: "label" is empty')
  })

  it('skips an empty-args scenario when picking the correct example', () => {
    const empty = makeScenario({ component: 'Y', name: 'Default' }) // ok !== false, but no args
    const filled = makeScenario({ component: 'Y', name: 'filled', args: { a: 1 } })
    const guide = createCatalogGraph([ci({ name: 'Y', scenarios: [empty, filled] })]).toAgentGuide()
    expect(guide).toContain('correct: {"a":1}')
  })

  it('renders a minimal component and omits an avoid line when a failure has no findings', () => {
    const flaky = { ...makeScenario({ component: 'X', name: 'flaky', args: { a: 1 } }), verify: verdict('fail', false) }
    const guide = createCatalogGraph([ci({ name: 'Bare' }), ci({ name: 'X', scenarios: [flaky] })]).toAgentGuide()
    expect(guide).toContain('## Bare')
    expect(guide).not.toContain('required:')
    expect(guide).not.toContain('avoid:')
  })
})
