import { h, Show } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { jsx } from '@pyreon/core/jsx-runtime'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { Arc, Bar, Chart, resolveGrammar } from './grammar'

interface Row { label: string; value: number }
const DATA: Row[] = [{ label: 'a', value: 2 }, { label: 'b', value: 8 }]

describe('conditional chart children', () => {
  it('resolves automatic JSX Show children and its fallback', () => {
    const visible = signal(true)
    const children = jsx(Show as ComponentFn, {
      when: visible,
      children: jsx(Bar as unknown as ComponentFn, { y: 'value' }),
      fallback: jsx(Arc as unknown as ComponentFn, { value: 'value', label: 'label' }),
    })
    expect(resolveGrammar(DATA, { data: DATA }, children).marks).toHaveLength(1)
    visible.set(false)
    expect(resolveGrammar(DATA, { data: DATA }, children).family?.host).toBe('pie')
    visible.set(true)
    expect(resolveGrammar(DATA, { data: DATA }, children).marks).toHaveLength(1)
  })

  it('preserves cartesian component identity while updating marks and rows', () => {
    const visible = signal(false)
    const data = signal(DATA)
    const root = document.createElement('div')
    document.body.append(root)
    const dispose = mount(h(Chart<Row>, { data, width: 240, height: 160, animate: false },
      jsx(Show as ComponentFn, { when: visible, children: jsx(Bar as unknown as ComponentFn, { y: 'value' }) }),
    ), root)
    onTestFinished(() => { dispose(); root.remove() })
    expect(root.querySelector('canvas')).toBeNull()
    visible.set(true)
    const canvas = root.querySelector('canvas')
    expect(canvas).not.toBeNull()
    data.set([{ label: 'c', value: 4 }])
    expect(root.querySelector('canvas')).toBe(canvas)
    visible.set(false)
    expect(root.querySelector('canvas')).toBeNull()
    visible.set(true)
    expect(root.querySelectorAll('canvas')).toHaveLength(1)
    expect(root.querySelector('canvas')).not.toBe(canvas)
  })

  it('reinstalls family prop keys while preserving value-only updates', () => {
    const radius = signal<number | undefined>(undefined)
    const data = signal(DATA)
    const root = document.createElement('div')
    document.body.append(root)
    const dispose = mount(h(Chart<Row>, { data, width: 240, height: 160, animate: false }, () =>
      radius() === undefined
        ? h(Arc<Row>, { value: 'value', label: 'label' })
        : h(Arc<Row>, { value: 'value', label: 'label', innerRadius: radius() }),
    ), root)
    onTestFinished(() => { dispose(); root.remove() })
    const pie = root.querySelector('canvas')
    data.set([{ label: 'c', value: 4 }])
    expect(root.querySelector('canvas')).toBe(pie)
    radius.set(0.3)
    const donut = root.querySelector('canvas')
    expect(donut).not.toBe(pie)
    radius.set(0.7)
    expect(root.querySelector('canvas')).toBe(donut)
    radius.set(undefined)
    expect(root.querySelector('canvas')).not.toBe(donut)
  })
})
