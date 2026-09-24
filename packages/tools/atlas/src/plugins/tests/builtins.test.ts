import type { ComponentIntelligence } from '../../core'
import { makeScenario } from '../../core'
import { a11yPlugin } from '../a11y'
import { defineAtlasPlugin } from '../define'
import { variantMatrixPlugin } from '../variant-matrix'

/** Finding messages as one string — assertions read the prose, not the shape. */
function messages(check: { findings?: readonly { message: string }[] } | undefined): string {
  return (check?.findings ?? []).map((f) => f.message).join(' ')
}


const ci = (over: Partial<ComponentIntelligence> = {}): ComponentIntelligence => ({
  name: 'Button',
  controls: [],
  axes: [],
  scenarios: [],
  tags: [],
  ...over,
})

describe('defineAtlasPlugin', () => {
  it('returns the plugin unchanged (identity, for inference)', () => {
    const p = defineAtlasPlugin({ name: 'x' })
    expect(p.name).toBe('x')
  })
})

describe('variantMatrixPlugin', () => {
  const decorate = async (input: ComponentIntelligence, opts = {}) =>
    (await variantMatrixPlugin(opts).decorate!(input, { cwd: '.' })) as ComponentIntelligence

  it('returns the component unchanged when there are no axes', async () => {
    const input = ci()
    expect(await decorate(input)).toBe(input)
  })

  it('appends one scenario per axis value — the defaults cell as Default, the rest auto-variant', async () => {
    const out = await decorate(ci({ axes: [{ name: 'state', values: ['primary', 'secondary'] }] }))
    expect(out.scenarios.map((s) => [s.name, s.source])).toEqual([
      ['Default', 'auto-default'],
      ['state=secondary', 'auto-variant'],
    ])
  })

  it('`matrix: "full"` crosses the axes instead', async () => {
    const axes = [
      { name: 'state', values: ['primary', 'secondary'] },
      { name: 'size', values: ['s', 'l'] },
    ]
    expect((await decorate(ci({ axes }))).scenarios).toHaveLength(3)
    expect((await decorate(ci({ axes }), { matrix: 'full' })).scenarios).toHaveLength(4)
  })

  it('never overwrites an existing scenario (dedup by id)', async () => {
    const existing = makeScenario({ component: 'Button', name: 'Default', source: 'authored' })
    const out = await decorate(ci({ axes: [{ name: 'state', values: ['primary'] }], scenarios: [existing] }))
    expect(out.scenarios).toHaveLength(1)
    expect(out.scenarios[0]!.source).toBe('authored')
  })

  it('merges baseArgs into generated scenarios', async () => {
    const out = await decorate(ci({ axes: [{ name: 'state', values: ['primary'] }] }), { baseArgs: { label: 'Go' } })
    expect(out.scenarios[0]!.args).toMatchObject({ label: 'Go', state: 'primary' })
  })
})

describe('a11yPlugin', () => {
  const check = async (component: ComponentIntelligence, args: Record<string, unknown>) => {
    const res = await a11yPlugin().verify!({
      scenario: makeScenario({ component: component.name, name: 's', args }),
      component,
    })
    return res.a11y!
  }

  it('skips when there is no required name-providing prop', async () => {
    const c = ci({ controls: [{ name: 'label2', kind: 'text', reactive: false, required: true }] })
    expect((await check(c, {})).status).toBe('skip')
  })

  it('passes when the accessible name is provided', async () => {
    const c = ci({ controls: [{ name: 'aria-label', kind: 'text', reactive: false, required: true }] })
    expect((await check(c, { 'aria-label': 'Close' })).status).toBe('pass')
  })

  it('fails with a finding when a required accessible name is empty', async () => {
    const c = ci({ controls: [{ name: 'alt', kind: 'text', reactive: false, required: true }] })
    const result = await check(c, { alt: '' })
    expect(result.status).toBe('fail')
    expect(messages(result)).toContain('alt')
  })

  it('checks a SUPPLIED name-like prop even when it is optional', async () => {
    // The seeded `alt` on an `<img>`: optional on the component, present in
    // the scenario. An empty one is a finding, not a skip.
    const c = ci({ controls: [{ name: 'alt', kind: 'text', reactive: false, required: false }] })
    expect((await check(c, { alt: 'Image placeholder' })).status).toBe('pass')
    expect((await check(c, { alt: '' })).status).toBe('fail')
    // Absent from the scenario AND optional: still nothing to check.
    expect((await check(c, {})).status).toBe('skip')
  })

  it('does not fail its OWN Empty edge case on an optional name', async () => {
    const c = ci({ controls: [{ name: 'label', kind: 'text', reactive: false, required: false }] })
    const res = await a11yPlugin().verify!({
      scenario: makeScenario({ component: c.name, name: 'Empty', args: { label: '' }, source: 'auto-edge' }),
      component: c,
    })
    expect(res.a11y!.status).toBe('skip')
    // A REQUIRED name empty in that same scenario is still the finding.
    const req = ci({ controls: [{ name: 'label', kind: 'text', reactive: false, required: true }] })
    const res2 = await a11yPlugin().verify!({
      scenario: makeScenario({ component: req.name, name: 'Empty', args: { label: '' }, source: 'auto-edge' }),
      component: req,
    })
    expect(res2.a11y!.status).toBe('fail')
  })

  it('treats undefined and null as empty', async () => {
    const c = ci({ controls: [{ name: 'label', kind: 'text', reactive: false, required: true }] })
    expect((await check(c, {})).status).toBe('fail')
    expect((await check(c, { label: null })).status).toBe('fail')
  })
})
