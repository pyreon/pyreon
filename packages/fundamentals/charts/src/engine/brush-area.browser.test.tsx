import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { bars } from './marks'
import { PlotChart } from './Chart'

interface Row { v: number }
const ROWS: Row[] = Array.from({ length: 8 }, (_, i) => ({ v: i + 2 }))
type Sel = { seriesIndex: number; dataIndex: number[] }[]

const alphaSum = (c: HTMLCanvasElement): number => {
  const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) n += data[i]!
  return n
}

function drag(c: HTMLCanvasElement, from: [number, number], to: [number, number], id = 7): void {
  const r = c.getBoundingClientRect()
  const fire = (type: string, x: number, y: number) =>
    c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: id }))
  fire('pointerdown', from[0], from[1])
  fire('pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2)
  fire('pointermove', to[0], to[1])
  fire('pointerup', to[0], to[1])
  // The click a browser fires at the end of a drag.
  c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + to[0], clientY: r.top + to[1] }))
}

function tap(c: HTMLCanvasElement, x: number, y: number): void {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 9 }))
  c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 9 }))
  c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + x, clientY: r.top + y }))
}

describe('area brush (real browser)', () => {
  it('a lineX brush selects the bars under it, fades the rest, and a click clears it', async () => {
    const got: Sel[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({ data: ROWS, marks: [bars((d) => d.v)], width: 400, height: 220, animate: false, brushType: 'lineX', onBrushSelected: (s) => got.push(s) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const plain = alphaSum(c)
    drag(c, [150, 100], [260, 100])
    await flush()
    const last = got[got.length - 1]!
    expect(last).toHaveLength(1)
    expect(last[0]!.dataIndex.length).toBeGreaterThan(0)
    expect(last[0]!.dataIndex.length).toBeLessThan(ROWS.length)
    // Contiguous columns.
    const idx = last[0]!.dataIndex
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBe(idx[i - 1]! + 1)
    // The faded bars outweigh the cover's own ink.
    expect(alphaSum(c)).toBeLessThan(plain)
    tap(c, 200, 100)
    await flush()
    expect(got[got.length - 1]).toEqual([{ seriesIndex: 0, dataIndex: [] }])
    expect(alphaSum(c)).toBe(plain)
  })

  it('a rect brush selects per series, and multiple mode keeps both areas', async () => {
    const got: Sel[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: ROWS,
        marks: [bars((d) => d.v)],
        width: 400,
        height: 220,
        animate: false,
        brushType: 'rect',
        brushMode: 'multiple',
        onBrushSelected: (s) => got.push(s),
      }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    drag(c, [40, 5], [140, 215])
    await flush()
    const first = got[got.length - 1]![0]!.dataIndex
    expect(first.length).toBeGreaterThan(0)
    drag(c, [300, 5], [398, 215])
    await flush()
    const both = got[got.length - 1]![0]!.dataIndex
    expect(both.length).toBeGreaterThan(first.length)
    expect(both).toEqual(expect.arrayContaining(first))
    expect(both).toContain(ROWS.length - 1)
  })

  it('the toolbox brush tools switch the type on and clear the areas', async () => {
    const got: Sel[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({ data: ROWS, marks: [bars((d) => d.v)], width: 400, height: 240, animate: false, toolbox: { brush: ['lineX', 'clear'] }, onBrushSelected: (s) => got.push(s) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    // No brush until the tool is on: a drag reports nothing.
    drag(c, [150, 150], [260, 150])
    await flush()
    expect(got).toHaveLength(0)
    // Tools right-aligned, 25px apart: lineX, clear.
    tap(c, 390.5 - 25, 9)
    await flush()
    drag(c, [150, 150], [260, 150])
    await flush()
    expect(got[got.length - 1]![0]!.dataIndex.length).toBeGreaterThan(0)
    tap(c, 390.5, 9)
    await flush()
    expect(got[got.length - 1]).toEqual([{ seriesIndex: 0, dataIndex: [] }])
  })
})
