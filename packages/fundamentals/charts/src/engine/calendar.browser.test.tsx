import { afterEach, describe, expect, it, vi } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { CalendarChart } from './CalendarChart'
import { layoutCalendar } from './calendar'
import type { CalendarCell } from './calendar'

const pixel = (c: HTMLCanvasElement, x: number, y: number): string => {
  const dpr = window.devicePixelRatio || 1
  const d = c.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
  return String(d[0]) + ',' + String(d[1]) + ',' + String(d[2])
}

describe('CalendarChart (real browser)', () => {
  it('paints cells, selects the day under the click, recolours reactively', async () => {
    const values = signal<Record<string, number>>({ '2024-01-03': 8 })
    const picked: (CalendarCell | null)[] = []
    const { container } = mountInBrowser(() =>
      CalendarChart({ animate: false, updateAnimation: false, start: '2024-01-01', end: '2024-01-28', values: () => values(), width: 400, height: 140, title: 'Jan', onSelect: (c) => picked.push(c) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const cell = layoutCalendar('2024-01-01', '2024-01-28', { x: 4, y: 4, w: 392, h: 132 }).cells.find((x) => x.date === '2024-01-03')!
    const cx = cell.rect.x + cell.rect.w / 2
    const cy = cell.rect.y + cell.rect.h / 2
    const before = pixel(c, cx, cy)
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + cx, clientY: r.top + cy, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]!.date).toBe('2024-01-03')
    values.set({ '2024-01-03': 8, '2024-01-04': 100 })
    await flush()
    // With a new maximum, the old cell's ramp position (and colour) changes.
    expect(pixel(c, cx, cy)).not.toBe(before)
    expect(container.querySelector('table')!.textContent).toContain('2024-01-04')
  })
})

describe('CalendarChart month labels stay on the canvas (real browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // A Jan–Dec range puts "Dec" in the last week column; start-aligned there with
  // no clamp, it ran past the right edge of a narrow canvas and was clipped
  // ("Dec" ended at 366.3px on a 358px canvas). Every month label actually
  // drawn is read off the canvas's own fillText and measured in its own font.
  for (const width of [358, 600]) {
    it(`every drawn month label ends inside the ${String(width)}px canvas, and Dec is drawn`, async () => {
      const drawn: { text: string; right: number; left: number }[] = []
      const fillText = CanvasRenderingContext2D.prototype.fillText
      vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText').mockImplementation(function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number) {
        if (MONTHS.has(text) && this.textAlign === 'start') {
          const w = this.measureText(text).width
          const origin = this.getTransform().e / (window.devicePixelRatio || 1)
          drawn.push({ text, left: origin + x, right: origin + x + w })
        }
        if (maxWidth === undefined) fillText.call(this, text, x, y)
        else fillText.call(this, text, x, y, maxWidth)
      })
      const { container } = mountInBrowser(() =>
        CalendarChart({ animate: false, start: '2024-01-01', end: '2024-12-01', values: {}, width, height: 140 }),
      )
      await flush()
      const canvasWidth = container.querySelector('canvas')!.getBoundingClientRect().width
      expect(canvasWidth).toBe(width)
      expect(drawn.map((d) => d.text)).toContain('Dec')
      for (const d of drawn) {
        expect(d.right, `${d.text} right edge`).toBeLessThanOrEqual(canvasWidth - 4 + 0.01)
        expect(d.left, `${d.text} left edge`).toBeGreaterThanOrEqual(0)
      }
      const lefts = drawn.map((d) => d.left)
      expect(new Set(lefts).size, 'no two labels stacked').toBe(lefts.length)
    })
  }
})

const MONTHS = new Set(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])

