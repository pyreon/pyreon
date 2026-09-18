import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from '../types'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
type Sel = { seriesIndex: number; dataIndex: number[] }[]

describe('OptionChart brush (real browser)', () => {
  it('a toolbox lineX brush reports the bars under it, dims the rest, and clear empties it', async () => {
    const cats = Array.from({ length: 8 }, (_, i) => `c${i}`)
    const option: EChartsOption = {
      animation: false,
      brush: { outOfBrush: { colorAlpha: 0.1 } },
      toolbox: { feature: { brush: { type: ['lineX', 'clear'] } } },
      xAxis: { type: 'category', data: cats },
      yAxis: {},
      series: [{ type: 'bar', data: cats.map((_, i) => i + 2) }],
    }
    const got: Sel[] = []
    const m = mountInBrowser(h(OptionChart, { option, width: 400, height: 260, onBrushSelected: (s: Sel) => got.push(s) }))
    await flush()
    await wait(150)
    const c = m.container.querySelector('canvas')!
    const r = c.getBoundingClientRect()
    const click = (x: number, y: number) => c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + x, clientY: r.top + y }))
    const alpha = (): number => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) n += d[i]!
      return n
    }
    const fire = (type: string, x: number) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + 150, pointerId: 4 }))
    // Before a tool is taken up a drag brushes nothing.
    fire('pointerdown', 150)
    fire('pointermove', 260)
    fire('pointerup', 260)
    click(260, 150)
    await flush()
    expect(got).toHaveLength(0)
    const plain = alpha()
    // Tools right-aligned 25px apart: lineX, clear.
    click(390.5 - 25, 9)
    await flush()
    fire('pointerdown', 150)
    fire('pointermove', 200)
    fire('pointermove', 260)
    fire('pointerup', 260)
    click(260, 150)
    await flush()
    const sel = got[got.length - 1]!
    expect(sel[0]!.dataIndex.length).toBeGreaterThan(0)
    expect(sel[0]!.dataIndex.length).toBeLessThan(cats.length)
    expect(alpha()).toBeLessThan(plain)
    click(390.5, 9)
    await flush()
    expect(got[got.length - 1]).toEqual([{ seriesIndex: 0, dataIndex: [] }])
  })
})
