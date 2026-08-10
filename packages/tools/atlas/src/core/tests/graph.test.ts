import type { CheckStatus, ComponentIntelligence, VerifyVerdict } from '../types'
import { createCatalogGraph } from '../graph'
import { makeScenario } from '../scenario'

const ci = (over: Partial<ComponentIntelligence> = {}): ComponentIntelligence => ({
  name: 'Button',
  controls: [],
  axes: [],
  scenarios: [],
  tags: [],
  ...over,
})

/**
 * `checked` is DERIVED here exactly as `mergeVerdict` derives it in the
 * registry — a hand-set count would let a fixture describe a verdict the
 * pipeline can never produce (e.g. "ok, but nothing ran"), which is the state
 * this file exists to prove the renderers no longer present as a pass.
 */
const verdict = (a11y: CheckStatus, ok: boolean): VerifyVerdict => ({
  ok,
  checked: a11y === 'skip' ? 0 : 1,
  a11y: { status: a11y },
  interaction: { status: 'skip' },
  reactivityCoverage: { status: 'skip' },
  leak: { status: 'skip' },
  snapshot: { status: 'skip' },
  ssrParity: { status: 'skip' },
})

const failVerdict = (findings: string[]): VerifyVerdict => ({
  ok: false,
  checked: 1,
  a11y: { status: 'fail', findings },
  interaction: { status: 'skip' },
  reactivityCoverage: { status: 'skip' },
  leak: { status: 'skip' },
  snapshot: { status: 'skip' },
  ssrParity: { status: 'skip' },
})

/** A verdict from a pipeline where every check was a stub — the common case. */
const unverifiedVerdict = (): VerifyVerdict => ({
  ok: false,
  checked: 0,
  a11y: { status: 'skip' },
  interaction: { status: 'skip' },
  reactivityCoverage: { status: 'skip' },
  leak: { status: 'skip' },
  snapshot: { status: 'skip' },
  ssrParity: { status: 'skip' },
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

  it('skips an empty-args scenario when picking the example', () => {
    const empty = makeScenario({ component: 'Y', name: 'Default' }) // no args to show
    const filled = makeScenario({ component: 'Y', name: 'filled', args: { a: 1 } })
    const guide = createCatalogGraph([ci({ name: 'Y', scenarios: [empty, filled] })]).toAgentGuide()
    // Neither scenario ran a check, so the guide offers the args WITHOUT
    // claiming they are correct — but it still picks the one with args.
    expect(guide).toContain('example (unverified): {"a":1}')
  })

  it('only says "correct" for a scenario a check actually passed', () => {
    // The distinction the guide exists to make: an agent reading `correct:`
    // should be able to trust that something verified it. Before, `correct:`
    // was printed for any scenario that had not explicitly FAILED — which
    // included every scenario the stubbed pipeline never examined.
    const unchecked = {
      ...makeScenario({ component: 'Z', name: 'unchecked', args: { a: 1 } }),
      verify: unverifiedVerdict(),
    }
    const checked = {
      ...makeScenario({ component: 'Z', name: 'checked', args: { b: 2 } }),
      verify: verdict('pass', true),
    }

    const unverifiedOnly = createCatalogGraph([
      ci({ name: 'Z', scenarios: [unchecked] }),
    ]).toAgentGuide()
    expect(unverifiedOnly).not.toContain('correct:')
    expect(unverifiedOnly).toContain('example (unverified): {"a":1}')

    // With a verified scenario present, the guide prefers it and upgrades the wording.
    const withVerified = createCatalogGraph([
      ci({ name: 'Z', scenarios: [unchecked, checked] }),
    ]).toAgentGuide()
    expect(withVerified).toContain('correct: {"b":2}')
    expect(withVerified).not.toContain('example (unverified)')
  })

  it('never labels an unverified scenario as passing in the llms catalog', () => {
    const unchecked = {
      ...makeScenario({ component: 'W', name: 'unchecked' }),
      verify: unverifiedVerdict(),
    }
    const text = createCatalogGraph([ci({ name: 'W', scenarios: [unchecked] })]).toLlmsText()
    expect(text).toContain('[unverified]')
    expect(text).not.toContain('[pass]')
  })

  it('renders a minimal component and omits an avoid line when a failure has no findings', () => {
    const flaky = { ...makeScenario({ component: 'X', name: 'flaky', args: { a: 1 } }), verify: verdict('fail', false) }
    const guide = createCatalogGraph([ci({ name: 'Bare' }), ci({ name: 'X', scenarios: [flaky] })]).toAgentGuide()
    expect(guide).toContain('## Bare')
    expect(guide).not.toContain('required:')
    expect(guide).not.toContain('avoid:')
  })
})
