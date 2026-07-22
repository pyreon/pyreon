import { inferControl, inferControls } from '../controls'

describe('inferControl', () => {
  it('maps a union type to a select control with options', () => {
    expect(inferControl({ name: 'state', type: { union: ['a', 'b'] } })).toMatchObject({
      name: 'state',
      kind: 'select',
      options: ['a', 'b'],
      reactive: false,
      required: true,
    })
  })

  it('maps an accessor to a reactive control', () => {
    expect(inferControl({ name: 'value', type: 'accessor' })).toMatchObject({
      kind: 'reactive',
      reactive: true,
    })
  })

  it('maps number / boolean / color scalars', () => {
    expect(inferControl({ name: 'n', type: 'number' }).kind).toBe('number')
    expect(inferControl({ name: 'b', type: 'boolean' }).kind).toBe('boolean')
    expect(inferControl({ name: 'c', type: 'color' }).kind).toBe('color')
  })

  it('maps a plain string to text', () => {
    expect(inferControl({ name: 'label', type: 'string' }).kind).toBe('text')
  })

  it('maps a color-named string prop to a color control', () => {
    expect(inferControl({ name: 'backgroundColor', type: 'string' }).kind).toBe('color')
    expect(inferControl({ name: 'fill', type: 'string' }).kind).toBe('color')
    expect(inferControl({ name: 'colour', type: 'string' }).kind).toBe('color')
  })

  it('maps unknown to unknown', () => {
    expect(inferControl({ name: 'x', type: 'unknown' }).kind).toBe('unknown')
  })

  it('derives required from optional + defaultValue', () => {
    expect(inferControl({ name: 'a', type: 'string' }).required).toBe(true)
    expect(inferControl({ name: 'a', type: 'string', optional: true }).required).toBe(false)
    expect(inferControl({ name: 'a', type: 'string', defaultValue: 'x' }).required).toBe(false)
    expect(inferControl({ name: 'a', type: 'string', defaultValue: 'x' }).defaultValue).toBe('x')
  })
})

describe('inferControls', () => {
  it('maps a whole prop set, preserving declaration order', () => {
    const out = inferControls([
      { name: 'a', type: 'string' },
      { name: 'b', type: 'number' },
    ])
    expect(out.map((c) => c.name)).toEqual(['a', 'b'])
  })
})
