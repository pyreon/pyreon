/**
 * The option's `tooltip` component, and a series' own `tooltip` / `cursor` /
 * `silent`, on FAMILY charts through `<OptionChart>`, in real Chromium. Before
 * this, a pie / sankey / treemap option drew no tooltip at all, whatever the
 * option said.
 */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { query, queryOptional } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

const W = 300
const H = 300

const at = (c: HTMLCanvasElement, type: string, x: number, y: number): void => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 5 }))
}
const tipOf = (root: HTMLElement): HTMLElement | null => queryOptional(root, '[data-pyreon-chart-tooltip]')
const shownText = (root: HTMLElement): string | null => {
  const t = tipOf(root)
  return t === null || t.style.display !== 'block' ? null : t.textContent
}

/** A pie of [1, 2]: slice 0 spans 12 to 4 o'clock, slice 1 the rest. */
const pie = (series: Record<string, unknown> = {}, option: Record<string, unknown> = {}): EChartsOption => ({
  animation: false,
  series: [{ type: 'pie', name: 'Share', data: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }], ...series }],
  ...option,
})
const inSlice0 = (c: HTMLCanvasElement): [number, number] => {
  const r = c.getBoundingClientRect()
  return [r.width / 2 + 20, r.height / 2 - 30]
}
const inSlice1 = (c: HTMLCanvasElement): [number, number] => {
  const r = c.getBoundingClientRect()
  return [r.width / 2 - 20, r.height / 2 + 30]
}

const hover = async (option: EChartsOption, point: (c: HTMLCanvasElement) => [number, number], extra: Record<string, unknown> = {}) => {
  const m = mountInBrowser(h(OptionChart, { option, width: W, height: H, ...extra }))
  await flush()
  const c = query(m.container, 'canvas')
  at(c, 'pointermove', ...point(c))
  await flush()
  return { container: m.container, canvas: c }
}

describe('<OptionChart> family tooltip, cursor and silent (real browser)', () => {
  it('no tooltip component: no box, as ECharts', async () => {
    const { container } = await hover(pie(), inSlice0)
    expect(shownText(container)).toBeNull()
  })

  it('a tooltip component shows the family\'s own lines for the hovered slice', async () => {
    const { container } = await hover(pie({}, { tooltip: {} }), inSlice1)
    expect(shownText(container)).toBe('b\n2 (67%)')
  })

  it('a template formatter reads {a} {b} {c} {d} with ECharts\' pie percent (largest remainder, two places)', async () => {
    const { container } = await hover(pie({}, { tooltip: { formatter: '{a}|{b}|{c}|{d}' } }), inSlice0)
    expect(shownText(container)).toBe('Share|a|1|33.33')
  })

  it('a function formatter gets ECharts params: seriesType, data, percent, marker', async () => {
    const seen: Record<string, unknown>[] = []
    const { container } = await hover(
      pie({}, {
        tooltip: {
          formatter: (p: Record<string, unknown>) => {
            seen.push(p)
            return `<b>${String(p['name'])}</b>`
          },
        },
      }),
      inSlice1,
    )
    expect(seen[0]).toMatchObject({ componentType: 'series', seriesType: 'pie', seriesName: 'Share', name: 'b', dataIndex: 1, value: 2, percent: 66.67, data: { name: 'b', value: 2 } })
    expect(String(seen[0]!['marker'])).toContain('border-radius')
    expect(query(container, '[data-pyreon-chart-tooltip] b').textContent).toBe('b')
  })

  it('a series\' own tooltip refines the global one', async () => {
    const { container } = await hover(pie({ tooltip: { formatter: 'own {b}' } }, { tooltip: { formatter: 'global {b}' } }), inSlice0)
    expect(shownText(container)).toBe('own a')
  })

  it('trigger "axis" on a pie shows nothing, as ECharts', async () => {
    const { container } = await hover(pie({}, { tooltip: { trigger: 'axis' } }), inSlice0)
    expect(shownText(container)).toBeNull()
  })

  it('cursor: pointer over a slice by default, the series\' own when set, default off the slices', async () => {
    const plain = await hover(pie({}, { tooltip: {} }), inSlice0)
    expect(plain.canvas.style.cursor).toBe('pointer')
    at(plain.canvas, 'pointermove', 2, 2)
    expect(plain.canvas.style.cursor).toBe('')
    const own = await hover(pie({ cursor: 'crosshair' }, { tooltip: {} }), inSlice0)
    expect(own.canvas.style.cursor).toBe('crosshair')
  })

  it('a silent series: no box, no cursor, no selection', async () => {
    const picked: unknown[] = []
    const { container, canvas } = await hover(pie({ silent: true }, { tooltip: {} }), inSlice0, { onFamilySelect: (_k: string, hit: unknown) => picked.push(hit) })
    expect(shownText(container)).toBeNull()
    expect(canvas.style.cursor).toBe('')
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: canvas.getBoundingClientRect().left + inSlice0(canvas)[0], clientY: canvas.getBoundingClientRect().top + inSlice0(canvas)[1] }))
    await flush()
    expect(picked).toEqual([])
  })

  it('a sankey edge reports dataType "edge" and a "source > target" name', async () => {
    const seen: Record<string, unknown>[] = []
    const option: EChartsOption = {
      animation: false,
      tooltip: { formatter: (p: Record<string, unknown>) => (seen.push(p), 'x') },
      series: [{ type: 'sankey', data: [{ name: 'in' }, { name: 'out' }], links: [{ source: 'in', target: 'out', value: 5 }] }],
    }
    // The ribbon runs across the middle of the plot, between the two node bands.
    const { container } = await hover(option, (c) => [c.getBoundingClientRect().width / 2, c.getBoundingClientRect().height / 2])
    expect(shownText(container)).toBe('x')
    expect(seen[0]).toMatchObject({ dataType: 'edge', name: 'in > out', value: 5 })
  })

  it('each family layer applies its own series\' keys', async () => {
    const option: EChartsOption = {
      animation: false,
      tooltip: { formatter: '{a}:{b}' },
      series: [
        { type: 'pie', name: 'Left', center: ['25%', '50%'], radius: '40%', data: [{ name: 'l', value: 1 }] },
        { type: 'pie', name: 'Right', center: ['75%', '50%'], radius: '40%', silent: true, data: [{ name: 'r', value: 1 }] },
      ],
    }
    const { container } = mountInBrowser(h(OptionChart, { option, width: 400, height: 200 }))
    await flush()
    const [left, right] = Array.from(container.querySelectorAll<HTMLElement>('[data-pyreon-chart-layer]'))
    const lc = query(left!, 'canvas')
    at(lc, 'pointermove', 40, 40)
    await flush()
    expect(shownText(left!)).toBe('Left:l')
    const rc = query(right!, 'canvas')
    at(rc, 'pointermove', 40, 40)
    await flush()
    expect(shownText(right!)).toBeNull()
    expect(rc.style.cursor).toBe('')
  })

  it('rtl mirrors a layer\'s box with the chart', async () => {
    const option: EChartsOption = {
      animation: false,
      series: [
        { type: 'pie', center: ['25%', '50%'], radius: '40%', data: [1] },
        { type: 'pie', center: ['75%', '50%'], radius: '40%', data: [1] },
      ],
    }
    const { container } = mountInBrowser(h(OptionChart, { option, width: 400, height: 200, rtl: true }))
    await flush()
    const ls = Array.from(container.querySelectorAll<HTMLElement>('[data-pyreon-chart-layer]')).map((l) => l.style.left)
    // Unmirrored the boxes sit at 60px and 260px; mirrored, 400 - 60 - 80 and 400 - 260 - 80.
    expect(ls).toEqual(['260px', '60px'])
  })

  it('zlevel / z stack the family layers: a higher one sits over a lower one', async () => {
    const option: EChartsOption = {
      animation: false,
      series: [
        { type: 'pie', center: ['40%', '50%'], radius: '40%', z: 7, data: [1] },
        { type: 'pie', center: ['60%', '50%'], radius: '40%', data: [1] },
        { type: 'pie', center: ['50%', '50%'], radius: '20%', zlevel: 1, data: [1] },
      ],
    }
    const { container } = mountInBrowser(h(OptionChart, { option, width: 400, height: 200 }))
    await flush()
    const z = Array.from(container.querySelectorAll<HTMLElement>('[data-pyreon-chart-layer]')).map((l) => Number(l.style.zIndex))
    expect(z[0]!).toBeGreaterThan(z[1]!)
    expect(z[2]!).toBeGreaterThan(z[0]!)
  })

  it('the facade\'s host props reach a family host: accessibleTable={false} drops the table', async () => {
    const withTable = mountInBrowser(h(OptionChart, { option: pie(), width: W, height: H }))
    await flush()
    expect(withTable.container.querySelector('table')).not.toBeNull()
    const without = mountInBrowser(h(OptionChart, { option: pie(), width: W, height: H, accessibleTable: false }))
    await flush()
    expect(without.container.querySelector('table')).toBeNull()
  })
})
