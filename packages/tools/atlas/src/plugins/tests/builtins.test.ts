import type { ComponentIntelligence } from '../../core'
import { makeScenario } from '../../core'
import { a11yPlugin } from '../a11y'
import { defineAtlasPlugin } from '../define'
import { variantMatrixPlugin } from '../variant-matrix'

const ci = (over: Partial<ComponentIntelligence> = {}): ComponentIntelligence => ({
  name: 'Button',
  controls: [],
  axes: [],
  reactivity: [],
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

  it('appends one auto-variant scenario per matrix cell', async () => {
    const out = await decorate(ci({ axes: [{ name: 'state', values: ['primary', 'secondary'] }] }))
    expect(out.scenarios).toHaveLength(2)
    expect(out.scenarios.every((s) => s.source === 'auto-variant')).toBe(true)
  })

  it('never overwrites an existing scenario (dedup by id)', async () => {
    const existing = makeScenario({ component: 'Button', name: 'state=primary', source: 'authored' })
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
    expect(result.findings?.[0]).toContain('alt')
  })

  it('treats undefined and null as empty', async () => {
    const c = ci({ controls: [{ name: 'label', kind: 'text', reactive: false, required: true }] })
    expect((await check(c, {})).status).toBe('fail')
    expect((await check(c, { label: null })).status).toBe('fail')
  })
})
