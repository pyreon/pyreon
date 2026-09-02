import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { GanttChart } from './GanttChart'
import { layoutGantt } from './gantt'
import type { GanttRow, GanttTask } from './gantt'

const pixel = (c: HTMLCanvasElement, x: number, y: number): string => {
  const dpr = window.devicePixelRatio || 1
  const d = c.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
  return String(d[0]) + ',' + String(d[1]) + ',' + String(d[2])
}

describe('GanttChart (real browser)', () => {
  it('paints bars, selects the task under the click, and re-lays out reactively', async () => {
    const tasks = signal<GanttTask[]>([
      { id: 'a', name: 'Design', start: '2024-03-01', end: '2024-03-10', color: '#ff0000' },
      { id: 'b', name: 'Build', start: '2024-03-08', end: '2024-03-24', dependencies: ['a'] },
    ])
    const picked: (GanttRow | null)[] = []
    const { container } = mountInBrowser(() =>
      GanttChart({ tasks: () => tasks(), width: 500, height: 160, title: 'Plan', onSelect: (r) => picked.push(r) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const ctx = c.getContext('2d')!
    // The browser lays out with the canvas measure; recompute with the same measure.
    const measure = (text: string, size: number): number => {
      ctx.font = String(size) + 'px system-ui, -apple-system, "Segoe UI", sans-serif'
      return ctx.measureText(text).width
    }
    const a = layoutGantt(tasks(), { x: 4, y: 4, w: 492, h: 152 }, undefined, measure).rows[0]!
    const cx = a.rect.x + a.rect.w / 2
    const cy = a.rect.y + a.rect.h * 0.1
    expect(pixel(c, cx, cy)).toBe('255,0,0')
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + cx, clientY: r.top + cy, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]!.task.id).toBe('a')
    expect(container.querySelector('table')!.textContent).toContain('Design')
    // Adding a task shifts the rows: the first bar moves and the table grows.
    tasks.set([{ id: 'z', name: 'Kickoff', start: '2024-02-20', end: '2024-02-28', color: '#00ff00' }, ...tasks()])
    await flush()
    const z = layoutGantt(tasks(), { x: 4, y: 4, w: 492, h: 152 }, undefined, measure).rows[0]!
    expect(pixel(c, z.rect.x + z.rect.w / 2, z.rect.y + z.rect.h * 0.1)).toBe('0,255,0')
    expect(container.querySelector('table')!.textContent).toContain('Kickoff')
  })
})
