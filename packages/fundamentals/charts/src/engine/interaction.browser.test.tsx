// Interaction wave in a real browser: legend click-to-toggle + hover crosshair.

import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { PlotChart } from './Chart'
import { bars, line } from './marks'
import { renderLegend } from './legend'
import { canvasMeasure } from './canvas-web'

interface Row {
  month: string
  revenue: number
  cost: number
}

const DATA: Row[] = [
  { month: 'Jan', revenue: 40, cost: 25 },
  { month: 'Feb', revenue: 55, cost: 30 },
  { month: 'Mar', revenue: 70, cost: 45 },
]

const RED = '#ff0000'
const BLUE = '#0000ff'
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

function colorCount(canvas: HTMLCanvasElement, rgb: string): number {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return 0
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 255 && `${data[i]},${data[i + 1]},${data[i + 2]}` === rgb) n++
  }
  return n
}
const inked = (canvas: HTMLCanvasElement): number => {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return 0
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

/** The legend entry hit boxes exactly as the component computes them. */
function legendBoxAt(canvas: HTMLCanvasElement, labels: string[], colors: string[], w: number, h: number, i: number) {
  const ctx = canvas.getContext('2d')!
  const l = renderLegend(
    labels.map((label, k) => ({ label, color: colors[k]! })),
    { x: 0, y: 0, w, h },
    { fontSize: 11, labelColor: '#5a6b7a', swatch: 10, gap: 12, orientation: 'horizontal' },
    canvasMeasure(ctx, FONT),
  )
  return l.boxes[i]!
}

const clickAt = (canvas: HTMLCanvasElement, x: number, y: number): void => {
  const r = canvas.getBoundingClientRect()
  canvas.dispatchEvent(
    new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }),
  )
}

const mountChart = (over: Record<string, unknown> = {}) =>
  mountInBrowser(() =>
    PlotChart<Row>({
      data: DATA,
      marks: [
        bars((d: Row) => d.revenue, { label: 'Revenue', color: RED }),
        line((d: Row) => d.cost, { label: 'Cost', color: BLUE, width: 3 }),
      ],
      x: (d: Row) => d.month,
      width: 320,
      height: 200,
      animate: false,
      showLegend: true,
      ...over,
    }),
  )

describe('legend click-to-toggle', () => {
  it('hides the clicked series, keeps the other, and restores on the second click', async () => {
    const { container } = mountChart()
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    expect(colorCount(canvas, '255,0,0')).toBeGreaterThan(50)
    expect(colorCount(canvas, '0,0,255')).toBeGreaterThan(20)

    const box = legendBoxAt(canvas, ['Revenue', 'Cost'], [RED, BLUE], 320, 200, 1)
    clickAt(canvas, box.x + box.w / 2, box.y + box.h / 2)
    await flush()
    // The line is gone; the bars remain (and may even gain ink — the domain
    // rescales to the visible series).
    expect(colorCount(canvas, '0,0,255')).toBe(0)
    expect(colorCount(canvas, '255,0,0')).toBeGreaterThan(50)

    clickAt(canvas, box.x + box.w / 2, box.y + box.h / 2)
    await flush()
    expect(colorCount(canvas, '0,0,255')).toBeGreaterThan(20)
  })

  it('a legend click is a toggle, NOT a datum selection', async () => {
    let selections = 0
    const { container } = mountChart({ onSelect: () => { selections += 1 } })
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const box = legendBoxAt(canvas, ['Revenue', 'Cost'], [RED, BLUE], 320, 200, 0)
    clickAt(canvas, box.x + box.w / 2, box.y + box.h / 2)
    await flush()
    expect(selections).toBe(0)
    expect(colorCount(canvas, '255,0,0')).toBe(0)
  })

  it('hiding EVERY series leaves the frame standing, not a crash', async () => {
    const { container } = mountChart()
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const b0 = legendBoxAt(canvas, ['Revenue', 'Cost'], [RED, BLUE], 320, 200, 0)
    const b1 = legendBoxAt(canvas, ['Revenue', 'Cost'], [RED, BLUE], 320, 200, 1)
    clickAt(canvas, b0.x + b0.w / 2, b0.y + b0.h / 2)
    await flush()
    clickAt(canvas, b1.x + b1.w / 2, b1.y + b1.h / 2)
    await flush()
    expect(colorCount(canvas, '255,0,0')).toBe(0)
    expect(colorCount(canvas, '0,0,255')).toBe(0)
    // Axes + legend still painted.
    expect(inked(canvas)).toBeGreaterThan(100)
  })

  it('legendToggle: false keeps the legend inert', async () => {
    const { container } = mountChart({ legendToggle: false })
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const box = legendBoxAt(canvas, ['Revenue', 'Cost'], [RED, BLUE], 320, 200, 1)
    clickAt(canvas, box.x + box.w / 2, box.y + box.h / 2)
    await flush()
    expect(colorCount(canvas, '0,0,255')).toBeGreaterThan(20)
  })
})

describe('crosshair', () => {
  const moveAt = (canvas: HTMLCanvasElement, x: number, y: number): void => {
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(
      new MouseEvent('mousemove', { clientX: r.left + x, clientY: r.top + y, bubbles: true }),
    )
  }
  const leave = (canvas: HTMLCanvasElement): void => {
    canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
  }

  it('hover draws the rule, leave removes it', async () => {
    const { container } = mountChart({ showLegend: false, crosshair: true })
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const before = inked(canvas)
    moveAt(canvas, 160, 100)
    await flush()
    expect(inked(canvas)).toBeGreaterThan(before)
    leave(canvas)
    await flush()
    expect(inked(canvas)).toBe(before)
  })

  it('marks the hovered datum on the line series', async () => {
    const { container } = mountChart({ showLegend: false, crosshair: true })
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const blueBefore = colorCount(canvas, '0,0,255')
    moveAt(canvas, 160, 100)
    await flush()
    // The marker circle adds solid-blue ink at the hovered point.
    expect(colorCount(canvas, '0,0,255')).toBeGreaterThan(blueBefore)
  })
})
