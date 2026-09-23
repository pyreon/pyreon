/**
 * ECharts' tooltip component on `<OptionChart>`, in real Chromium. The option
 * — not the host prop — decides whether a box shows, what it says, where it
 * sits and what the axis pointer draws.
 */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { query, queryOptional } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const option = (tooltip: Record<string, unknown> | undefined): EChartsOption => ({
  animation: false,
  xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu'] },
  yAxis: { type: 'value', min: 0, max: 10 },
  series: [
    { type: 'bar', name: 'Sales', data: [4, 8, 6, 2], itemStyle: { color: '#ff0000' } },
    { type: 'bar', name: 'Cost', data: [2, 3, 5, 1], itemStyle: { color: '#0000ff' } },
  ],
  ...(tooltip === undefined ? {} : { tooltip }),
})

const mount = (o: EChartsOption) => {
  const m = mountInBrowser(h(OptionChart, { option: o, width: 400, height: 260 }))
  return m
}

/** Fire a pointer event at a canvas-relative point. */
const at = (c: HTMLCanvasElement, type: string, x: number, y: number): void => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 3 }))
}

/**
 * A point inside the plot over column `i` of 4, low enough to sit on the bars.
 * ECharts' default grid places the plot: 15% / 10% of the width at the sides,
 * 65 above and 80 below.
 */
const column = (c: HTMLCanvasElement, i: number): [number, number] => {
  const r = c.getBoundingClientRect()
  const left = r.width * 0.15
  const x = left + ((r.width - left - r.width * 0.1) / 4) * (i + 0.5)
  return [x, r.height - 80 - 8]
}

const box = (container: HTMLElement): HTMLElement => query(container, '[data-pyreon-chart-tooltip]')

describe('<OptionChart> tooltip component (real browser)', () => {
  it('no tooltip component, no box — as ECharts', async () => {
    const { container } = mount(option(undefined))
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', ...column(c, 1))
    await flush()
    expect(queryOptional(container, '[data-pyreon-chart-tooltip]')?.style.display ?? 'none').toBe('none')
  })

  it('an axis trigger lists every series at the hovered column', async () => {
    const { container } = mount(option({ trigger: 'axis' }))
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', column(c, 1)[0], 72) // high in the plot: above the bars, still the column
    await flush()
    const b = box(container)
    expect(b.style.display).toBe('block')
    // ECharts' default content: the category, then a row (swatch, series, value) per series.
    expect(b.innerText.split('\n').map((l) => l.trim()).filter((l) => l !== '')).toEqual(['Tue', 'Sales', '8', 'Cost', '3'])
  })

  it('a template formatter fills {b} {a0} {c0} {a1} {c1}, and <br/> breaks the line', async () => {
    const { container } = mount(option({ trigger: 'axis', formatter: '{b}<br/>{a0}={c0}; {a1}={c1}' }))
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', ...column(c, 2))
    await flush()
    const b = box(container)
    expect(b.querySelector('br')).not.toBeNull()
    expect(b.textContent).toBe('WedSales=6; Cost=5')
  })

  it('a function formatter gets ECharts params and its HTML renders — sanitised', async () => {
    const seen: unknown[] = []
    // One series, so the column centre IS the bar (two grouped bars leave a gap there).
    const single = (tooltip: Record<string, unknown>): EChartsOption => ({ ...option(tooltip), series: [(option(undefined).series as unknown[])[0]] })
    const { container } = mount(
      single({
        formatter: (p: { seriesName: string; name: string; value: number; marker: string }) => {
          seen.push(p)
          return `${p.marker}<b>${p.seriesName}</b> ${p.name}: ${p.value}<img src=x onerror="window.__tipPwn=1">`
        },
      }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', ...column(c, 0))
    await flush()
    const b = box(container)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0]).toMatchObject({ componentType: 'series', seriesType: 'bar', seriesName: expect.any(String), name: 'Mon', dataIndex: 0 })
    expect(b.querySelector('b')).not.toBeNull()
    expect(b.querySelector('span')!.getAttribute('style')).toContain('border-radius:10px')
    expect(b.querySelector('img')).toBeNull()
    expect((window as unknown as { __tipPwn?: number }).__tipPwn).toBeUndefined()
  })

  it('valueFormatter formats the default lines', async () => {
    const { container } = mount(option({ trigger: 'axis', valueFormatter: (v: number) => `${v} kg` }))
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', column(c, 3)[0], 72)
    await flush()
    expect(box(container).innerText.split('\n').map((l) => l.trim()).filter((l) => l !== '')).toEqual(['Thu', 'Sales', '2 kg', 'Cost', '1 kg'])
  })

  it('a fixed position puts the box there, not at the pointer', async () => {
    const { container } = mount(option({ trigger: 'axis', position: [12, 7] }))
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', ...column(c, 2))
    await flush()
    const b = box(container)
    expect(b.style.left).toBe('12px')
    expect(b.style.top).toBe('7px')
  })

  it('the look keys style the box', async () => {
    const { container } = mount(option({ trigger: 'axis', backgroundColor: 'rgb(1, 2, 3)', textStyle: { color: 'rgb(9, 8, 7)' } }))
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', ...column(c, 1))
    await flush()
    const cs = getComputedStyle(box(container))
    expect(cs.backgroundColor).toBe('rgb(1, 2, 3)')
    expect(cs.color).toBe('rgb(9, 8, 7)')
  })

  it('triggerOn "click" shows nothing on hover and the box on a press', async () => {
    const { container } = mount(option({ trigger: 'axis', triggerOn: 'click' }))
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', ...column(c, 1))
    await flush()
    expect(box(container).style.display).not.toBe('block')
    at(c, 'pointerdown', ...column(c, 1))
    await flush()
    expect(box(container).style.display).toBe('block')
  })

  it('hideDelay keeps the box briefly after leaving; alwaysShowContent keeps it', async () => {
    const { container } = mount(option({ trigger: 'axis', hideDelay: 150 }))
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', ...column(c, 1))
    await flush()
    at(c, 'pointerleave', 0, 0)
    expect(box(container).style.display).toBe('block')
    await wait(300)
    expect(box(container).style.display).toBe('none')

    const kept = mount(option({ trigger: 'axis', alwaysShowContent: true }))
    await flush()
    const c2 = kept.container.querySelector('canvas')!
    at(c2, 'pointermove', ...column(c2, 1))
    await flush()
    at(c2, 'pointerleave', 0, 0)
    await wait(300)
    expect(box(kept.container).style.display).toBe('block')
  })

  it('a shadow axis pointer shades the hovered band (against the same hover with no pointer)', async () => {
    const pixel = (c: HTMLCanvasElement, x: number, y: number): number[] => {
      const dpr = c.width / c.getBoundingClientRect().width
      return Array.from(c.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data)
    }
    const hovered = async (pointer: string): Promise<number[]> => {
      const { container } = mount(option({ trigger: 'axis', axisPointer: { type: pointer, shadowStyle: { color: 'rgba(0,0,0,0.5)' } } }))
      await flush()
      const c = container.querySelector('canvas')!
      const [x] = column(c, 1)
      at(c, 'pointermove', x, 72)
      await flush()
      await flush()
      // Above the bar, inside the band: only the shadow can paint here.
      return pixel(c, x, 70)
    }
    const control = await hovered('none')
    const shaded = await hovered('shadow')
    expect(shaded).not.toEqual(control)
    // Darker: a 50% black wash over whatever the control painted.
    expect(shaded[0]! + shaded[1]! + shaded[2]!).toBeLessThan(control[0]! + control[1]! + control[2]! + (control[3] === 0 ? 1 : 0) * 765)
  })

})
