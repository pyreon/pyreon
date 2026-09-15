import { autoVariantScenarios, buildVariantMatrix, variantLabel } from '../variants'

describe('buildVariantMatrix', () => {
  it('returns a single empty combo for zero axes', () => {
    expect(buildVariantMatrix([])).toEqual([{}])
  })

  it('skips axes that have no values', () => {
    expect(buildVariantMatrix([{ name: 'x', values: [] }])).toEqual([{}])
  })

  it('enumerates a single axis', () => {
    expect(buildVariantMatrix([{ name: 's', values: ['a', 'b'] }])).toEqual([{ s: 'a' }, { s: 'b' }])
  })

  it('cross-products two axes', () => {
    const m = buildVariantMatrix([
      { name: 's', values: ['a', 'b'] },
      { name: 'z', values: ['1', '2'] },
    ])
    expect(m).toHaveLength(4)
    expect(m).toContainEqual({ s: 'a', z: '1' })
    expect(m).toContainEqual({ s: 'b', z: '2' })
  })
})

describe('variantLabel', () => {
  it('labels the empty selection Default', () => {
    expect(variantLabel({})).toBe('Default')
  })

  it('joins axis=value pairs', () => {
    expect(variantLabel({ state: 'primary', size: 'lg' })).toBe('state=primary · size=lg')
  })
})

describe('autoVariantScenarios', () => {
  it('makes one default scenario for zero axes', () => {
    const s = autoVariantScenarios('Button', [])
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ name: 'Default', source: 'auto-default', variant: {} })
  })

  it('makes one scenario per axis value with base args merged; the all-defaults cell is `Default`', () => {
    const s = autoVariantScenarios('Button', [{ name: 'state', values: ['primary', 'secondary'] }], {
      label: 'Go',
    })
    expect(s).toHaveLength(2)
    expect(s[0]).toMatchObject({
      id: 'button--default',
      name: 'Default',
      source: 'auto-default',
      args: { label: 'Go', state: 'primary' },
      variant: { state: 'primary' },
    })
    expect(s[1]).toMatchObject({ name: 'state=secondary', source: 'auto-variant', args: { label: 'Go', state: 'secondary' } })
  })

  it('fans one axis at a time by default: Σ|axis| scenarios, each carrying EVERY axis', () => {
    // The cross-product was the original default; four ui-components layout
    // components sharing indent(5)×gap(5)×gapY(6) produced 150 scenarios EACH.
    const axes = [
      { name: 'state', values: ['primary', 'secondary', 'danger'] },
      { name: 'size', values: ['small', 'large'] },
    ]
    const fan = autoVariantScenarios('Button', axes)
    expect(fan.map((s) => s.name)).toEqual(['Default', 'state=secondary', 'state=danger', 'size=large'])
    // Every scenario is a COMPLETE pinned state — the other axis sits at its default.
    expect(fan[3]!.args).toEqual({ state: 'primary', size: 'large' })
    expect(fan[3]!.variant).toEqual({ state: 'primary', size: 'large' })
  })

  it('`full` opts back into the cross-product, with the product\'s long labels', () => {
    const axes = [
      { name: 'state', values: ['primary', 'secondary'] },
      { name: 'size', values: ['small', 'large'] },
    ]
    const full = autoVariantScenarios('Button', axes, {}, 'full')
    expect(full.map((s) => s.name)).toEqual([
      'Default',
      'state=primary · size=large',
      'state=secondary · size=small',
      'state=secondary · size=large',
    ])
  })
})
