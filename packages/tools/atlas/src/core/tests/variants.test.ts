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

  it('makes one scenario per matrix cell with base args merged', () => {
    const s = autoVariantScenarios('Button', [{ name: 'state', values: ['primary', 'secondary'] }], {
      label: 'Go',
    })
    expect(s).toHaveLength(2)
    expect(s[0]).toMatchObject({
      source: 'auto-variant',
      args: { label: 'Go', state: 'primary' },
      variant: { state: 'primary' },
    })
  })
})
