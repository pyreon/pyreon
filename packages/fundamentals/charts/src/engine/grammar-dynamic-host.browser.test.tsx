import { _rp, h, Show } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { jsx } from '@pyreon/core/jsx-runtime'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { Arc, Bar, Chart, PieChart } from '../engine'

interface Row { label: string; value: number }
const DATA: Row[] = [{ label: 'a', value: 3 }, { label: 'b', value: 7 }]
const OPTIONS = { data: DATA, x: 'label' as const, width: 240, height: 160, animate: false, updateAnimation: false }

describe('chart host follows dynamic marks', () => {
  it('mounts the first cartesian mark revealed after an empty chart', async () => {
    const visible = signal(false)
    const view = mountInBrowser(h(Chart<Row>, OPTIONS,
      jsx(Show as ComponentFn, { when: visible, children: jsx(Bar as unknown as ComponentFn, { y: 'value' }) }),
    ))
    onTestFinished(view.unmount)
    await flush()
    expect(view.container.querySelector('canvas')).toBeNull()
    visible.set(true)
    await flush()
    expect(view.container.querySelector('canvas')).not.toBeNull()
    visible.set(false)
    await flush()
    expect(view.container.querySelector('canvas')).toBeNull()
    visible.set(true)
    await flush()
    expect(view.container.querySelector('canvas')).not.toBeNull()
  })

  it('keeps a family canvas mounted when only its data changes', async () => {
    const data = signal(DATA)
    const view = mountInBrowser(h(Chart<Row>, { ...OPTIONS, data }, h(Arc<Row>, { value: 'value', label: 'label' })))
    onTestFinished(view.unmount)
    await flush()
    const canvas = view.container.querySelector('canvas')!
    expect(canvas).not.toBeNull()
    const before = canvas.toDataURL()
    data.set([{ label: 'a', value: 9 }, { label: 'b', value: 1 }])
    await flush()
    expect(view.container.querySelector('canvas')).toBe(canvas)
    expect(canvas.toDataURL()).not.toBe(before)
  })

  it('tracks direct family render options on the first mounted frame', async () => {
    const radius = signal(0.2)
    const view = mountInBrowser(h(PieChart<Row>, {
      ...OPTIONS, value: (row: Row) => row.value, label: (row: Row) => row.label,
      innerRadius: _rp(radius),
    }))
    onTestFinished(view.unmount)
    await flush()
    const canvas = view.container.querySelector('canvas')!
    const before = canvas.toDataURL()
    radius.set(0.7)
    await flush()
    expect(view.container.querySelector('canvas')).toBe(canvas)
    expect(canvas.toDataURL()).not.toBe(before)
  })

  it('switches between fallback and primary mark hosts', async () => {
    const pie = signal(false)
    const view = mountInBrowser(h(Chart<Row>, OPTIONS,
      h(Show, { when: pie, fallback: h(Bar<Row>, { y: 'value' }) },
        h(Arc<Row>, { value: 'value', label: 'label' })),
    ))
    onTestFinished(view.unmount)
    await flush()
    const bars = view.container.querySelector('canvas')!
    expect(bars).not.toBeNull()
    pie.set(true)
    await flush()
    const slices = view.container.querySelector('canvas')!
    expect(slices).not.toBeNull()
    expect(slices).not.toBe(bars)
    pie.set(false)
    await flush()
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    expect(view.container.querySelector('canvas')).not.toBe(slices)
  })

  it('installs new family prop keys and then updates their values in place', async () => {
    const radius = signal<number | undefined>(undefined)
    const view = mountInBrowser(h(Chart<Row>, OPTIONS, () => radius() === undefined
      ? h(Arc<Row>, { value: 'value', label: 'label' })
      : h(Arc<Row>, { value: 'value', label: 'label', innerRadius: radius() }),
    ))
    onTestFinished(view.unmount)
    await flush()
    const pie = view.container.querySelector('canvas')!
    radius.set(0.25)
    await flush()
    const donut = view.container.querySelector('canvas')!
    expect(donut).not.toBe(pie)
    const before = donut.toDataURL()
    radius.set(0.7)
    await flush()
    expect(view.container.querySelector('canvas')).toBe(donut)
    expect(donut.toDataURL()).not.toBe(before)
    radius.set(undefined)
    await flush()
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    expect(view.container.querySelector('canvas')).not.toBe(donut)
  })

  it('reveals the first mark in every facet without dropping subsequent row updates', async () => {
    const visible = signal(false)
    const data = signal(DATA)
    const view = mountInBrowser(h(Chart<Row>, { ...OPTIONS, data, facet: 'label' },
      h(Show, { when: visible }, h(Bar<Row>, { y: 'value' })),
    ))
    onTestFinished(view.unmount)
    await flush()
    expect(view.container.querySelector('canvas')).toBeNull()
    visible.set(true)
    await flush()
    const canvases = [...view.container.querySelectorAll('canvas')]
    expect(canvases).toHaveLength(2)
    data.set([{ label: 'a', value: 8 }, { label: 'b', value: 2 }])
    await flush()
    expect([...view.container.querySelectorAll('canvas')]).toEqual(canvases)
  })
})
