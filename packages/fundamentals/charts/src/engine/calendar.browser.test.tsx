import { describe, expect, it } from 'vitest'
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
      CalendarChart({ start: '2024-01-01', end: '2024-01-28', values: () => values(), width: 400, height: 140, title: 'Jan', onSelect: (c) => picked.push(c) }),
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
