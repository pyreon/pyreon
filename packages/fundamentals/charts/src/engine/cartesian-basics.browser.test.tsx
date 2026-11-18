// Bar thickness and per-datum colour in real Chromium: the hit target follows
// the drawn bar, the painted pixels carry each datum's colour, and the tooltip
// names the value behind a shade.
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { query } from '@pyreon/test-utils'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { Bar, Chart, Tooltip } from './grammar'
import { fillBy, shadeBy } from './item-colors'

interface Row { m: string; v: number; w: number; tone: string }

const DATA: Row[] = [
  { m: 'a', v: 90, w: 10, tone: '#ff0000' },
  { m: 'b', v: 90, w: 20, tone: '#00ff00' },
  { m: 'c', v: 90, w: 30, tone: '#0000ff' },
]

const W = 360
const H = 220

async function hitSpans(barProps: Record<string, unknown>, chartProps: Record<string, unknown> = {}): Promise<number[][]> {
  const picked: number[] = []
  const { container, unmount } = mountInBrowser(
    h(Chart<Row>, { data: DATA, x: 'm', width: W, height: H, animate: false, showGrid: false, onSelect: (i: number) => picked.push(i), ...chartProps }, h(Bar<Row>, { y: 'v', ...barProps })),
  )
  await flush()
  const canvas = container.querySelector('canvas')!
  const r = canvas.getBoundingClientRect()
  const spans: number[][] = [[], [], []]
  for (let x = 0; x < W; x++) {
    picked.length = 0
    canvas.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + H - 40, bubbles: true }))
    for (const i of picked) if (i >= 0) spans[i]!.push(x)
  }
  unmount()

  return spans
}

describe('bar thickness in real Chromium', () => {
  it('without barWidth the hit target is the default band share', async () => {
    const spans = await hitSpans({})
    const w = spans[1]!.length
    expect(w).toBeGreaterThan(60)
  })

  it('barWidth narrows the HIT target to the drawn bar, centred where the default bar was', async () => {
    const wide = await hitSpans({})
    const thin = await hitSpans({}, { barWidth: 20 })
    const width = thin[1]!.length
    expect(width).toBeGreaterThanOrEqual(19)
    expect(width).toBeLessThanOrEqual(21)
    const mid = (s: number[]): number => (s[0]! + s[s.length - 1]!) / 2
    expect(Math.abs(mid(thin[1]!) - mid(wide[1]!))).toBeLessThan(1.5)
  })

  it('a click in the gap beside a thin bar selects nothing', async () => {
    const thin = await hitSpans({}, { barWidth: 20 })
    const wide = await hitSpans({})
    const wideOnly = wide[1]!.filter((x) => !thin[1]!.includes(x))
    expect(wideOnly.length).toBeGreaterThan(30)
  })

  it('barCategoryGap widens the gaps: the bars get thinner', async () => {
    const roomy = await hitSpans({}, { barCategoryGap: 0.6 })
    const snug = await hitSpans({}, { barCategoryGap: 0.1 })
    expect(roomy[1]!.length).toBeLessThan(snug[1]!.length)
  })
})

describe('per-datum colour in real Chromium', () => {
  const pixelAt = (canvas: HTMLCanvasElement, fx: number, fy: number): string => {
    const d = canvas.getContext('2d')!.getImageData(Math.round(canvas.width * fx), Math.round(canvas.height * fy), 1, 1).data
    return [d[0], d[1], d[2]].join(',')
  }

  it('each bar paints in its own colour', async () => {
    const { container, unmount } = mountInBrowser(
      h(Chart<Row>, { data: DATA, x: 'm', width: W, height: H, animate: false, showGrid: false }, h(Bar<Row>, { y: 'v', fill: fillBy<Row>('tone') })),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const seen = new Set<string>()
    for (let fx = 0.1; fx < 0.95; fx += 0.01) seen.add(pixelAt(canvas, fx, 0.6))
    expect(seen.has('255,0,0')).toBe(true)
    expect(seen.has('0,255,0')).toBe(true)
    expect(seen.has('0,0,255')).toBe(true)
    unmount()
  })

  it('the tooltip names the value behind a shade', async () => {
    const { container, unmount } = mountInBrowser(
      h(Chart<Row>, { data: DATA, x: 'm', width: W, height: H, animate: false }, h(Bar<Row>, { y: 'v', label: 'Revenue', fill: shadeBy<Row>('w') }), h(Tooltip, {})),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const r = canvas.getBoundingClientRect()
    for (let x = 20; x < W; x += 6) canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + x, clientY: r.top + H - 40, bubbles: true }))
    await flush()
    const tip = query<HTMLElement>(container, '[data-pyreon-chart-tooltip]')
    expect(tip.textContent).toMatch(/Revenue: 90 \(shade \d+\)/)
    unmount()
  })

  it('the accessible table prints the shade column', async () => {
    const { container, unmount } = mountInBrowser(
      h(Chart<Row>, { data: DATA, x: 'm', width: W, height: H, animate: false }, h(Bar<Row>, { y: 'v', label: 'Revenue', fill: shadeBy<Row>('w') })),
    )
    await flush()
    const heads = [...container.querySelectorAll('table th[scope="col"]')].map((e) => e.textContent)
    expect(heads).toContain('Revenue (shade)')
    unmount()
  })
})

