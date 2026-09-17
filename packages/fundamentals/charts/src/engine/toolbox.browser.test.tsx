import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query, queryOptional } from '@pyreon/test-utils'
import { bars } from './marks'
import { PlotChart } from './Chart'

interface Row { v: number }
const DATA: Row[] = [{ v: 3 }, { v: 9 }, { v: 6 }]
const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}
const click = (c: HTMLCanvasElement, x: number, y: number) => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}

describe('toolbox (real browser)', () => {
  it('saveAsImage hands the current frame to onSaveImage as an SVG', async () => {
    const got: string[] = []
    const { container } = mountInBrowser(() => PlotChart<Row>({ data: DATA, marks: [bars((d) => d.v)], width: 400, height: 200, animate: false, title: 'T', toolbox: { saveAsImage: true }, onSaveImage: (s) => got.push(s) }))
    await flush()
    const c = container.querySelector('canvas')!
    click(c, 392, 9)
    await flush()
    expect(got).toHaveLength(1)
    expect(got[0]).toContain('<svg')
    expect(got[0]).toMatch(/<(rect|path)/)
  })

  it('magicType line switches bars to a line and restore brings the bars back', async () => {
    const { container } = mountInBrowser(() => PlotChart<Row>({ data: DATA, marks: [bars((d) => d.v)], width: 400, height: 200, animate: false, toolbox: { magicType: ['line'], restore: true } }))
    await flush()
    const c = container.querySelector('canvas')!
    const barsInk = inked(c)
    click(c, 392 - 25, 9)
    await flush()
    const lineInk = inked(c)
    expect(lineInk).toBeLessThan(barsInk)
    click(c, 392, 9)
    await flush()
    expect(inked(c)).toBe(barsInk)
  })

  it('dataZoom: the select tool zooms to a dragged range, back undoes it; dataView shows the table; stack restacks', async () => {
    const rows: Row[] = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }))
    const zooms: ({ start: number; end: number } | null)[] = []
    const { container } = mountInBrowser(() => PlotChart<Row>({ data: rows, marks: [bars((d) => d.v), bars((d) => d.v / 2)], width: 400, height: 220, animate: false, toolbox: { dataZoom: true, dataView: true, magicType: ['stack', 'tiled'], restore: true }, onZoom: (w) => zooms.push(w) }))
    await flush()
    const c = container.querySelector('canvas')!
    const r = c.getBoundingClientRect()
    // Tools right-aligned, 25px apart: dataZoom, back, dataView, stack, tiled, restore.
    const at = (k: number) => 390.5 - 25 * (5 - k)
    click(c, at(0), 9)
    await flush()
    const fire = (type: string, x: number) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + 120, pointerId: 3 }))
    fire('pointerdown', 120)
    fire('pointermove', 200)
    fire('pointermove', 260)
    fire('pointerup', 260)
    // The click a browser fires at the end of the drag is swallowed.
    click(c, 260, 120)
    await flush()
    const zoomed = zooms[zooms.length - 1]
    expect(zoomed).not.toBeNull()
    expect(zoomed!.end - zoomed!.start).toBeLessThan(0.8)
    click(c, at(1), 9)
    await flush()
    expect(zooms[zooms.length - 1]).toBeNull()
    // Turn the select tool off again (its button is drawn highlighted while on).
    click(c, at(0), 9)
    await flush()
    // The data view: a visible table over the canvas, closed by its button.
    const ink = inked(c)
    click(c, at(2), 9)
    await flush()
    const view = queryOptional<HTMLElement>(container, '[data-pyreon-dataview]')
    expect(view).not.toBeNull()
    expect(view!.querySelectorAll('tbody tr')).toHaveLength(10)
    expect(view!.getBoundingClientRect().width).toBeGreaterThan(300)
    query(view!, 'button').click()
    await flush()
    expect(container.querySelector('[data-pyreon-dataview]')).toBeNull()
    // Stack: the two bar series share one bar per row, so less of the canvas is bar.
    click(c, at(3), 9)
    await flush()
    expect(inked(c)).not.toBe(ink)
    click(c, at(5), 9)
    await flush()
    expect(inked(c)).toBe(ink)
  })
})

