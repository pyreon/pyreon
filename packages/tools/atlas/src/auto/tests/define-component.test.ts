import { defineComponent } from '../define-component'
import { components } from '../discovery'

describe('defineComponent', () => {
  it('derives controls + axes from a terse spec (union -> select + axis, `?` -> optional)', () => {
    const ci = defineComponent('Button', {
      props: {
        label: 'string',
        state: ['primary', 'secondary'],
        count: 'number',
        bg: 'color',
        onValue: 'accessor',
        'disabled?': 'boolean',
      },
      tags: ['form'],
    })

    expect(ci.name).toBe('Button')
    expect(ci.tags).toEqual(['form'])

    const byName = Object.fromEntries(ci.controls.map((c) => [c.name, c]))
    expect(byName.label).toMatchObject({ kind: 'text', required: true })
    expect(byName.state).toMatchObject({ kind: 'select', options: ['primary', 'secondary'], required: true })
    expect(byName.count!.kind).toBe('number')
    expect(byName.bg!.kind).toBe('color')
    expect(byName.onValue).toMatchObject({ kind: 'reactive', reactive: true })
    expect(byName.disabled).toMatchObject({ kind: 'boolean', required: false })

    // the union prop became an axis automatically
    expect(ci.axes).toEqual([{ name: 'state', values: ['primary', 'secondary'] }])
  })

  it('uses explicit axes over derived ones', () => {
    const ci = defineComponent('Button', {
      props: { state: ['primary', 'secondary'] },
      axes: { size: ['sm', 'lg'] },
    })
    expect(ci.axes).toEqual([{ name: 'size', values: ['sm', 'lg'] }])
  })

  it('defaults empty props/axes/tags and omits component + summary', () => {
    const ci = defineComponent('Bare')
    expect(ci.controls).toEqual([])
    expect(ci.axes).toEqual([])
    expect(ci.tags).toEqual([])
    expect(ci.component).toBeUndefined()
    expect(ci.summary).toBeUndefined()
  })

  it('carries component + summary when given', () => {
    const comp = (props: Record<string, unknown>) => props
    const ci = defineComponent('X', { component: comp, summary: 'a thing' })
    expect(ci.component).toBe(comp)
    expect(ci.summary).toBe('a thing')
  })
})

describe('components', () => {
  it('wraps specs into a discovery plugin, preserving order', async () => {
    const plugin = components({
      Button: { props: { label: 'string' } },
      Badge: { props: { tone: ['info', 'danger'] } },
    })
    expect(plugin.name).toBe('atlas:components')
    const list = await plugin.discover!({ cwd: '.' })
    expect(list.map((c) => c.name)).toEqual(['Button', 'Badge'])
    expect(list[1]!.axes).toEqual([{ name: 'tone', values: ['info', 'danger'] }])
  })
})
