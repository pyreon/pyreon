import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { SunburstChart } from './SunburstChart'
import type { SunburstArc } from './sunburst'
import type { TreeNode } from './treemap'

const DATA: TreeNode[] = [{ name: 'docs', value: 30 }, { name: 'src', children: [{ name: 'core', value: 50 }, { name: 'ui', value: 20 }] }]
const pixel = (c: HTMLCanvasElement, x: number, y: number): string => {
  const dpr = window.devicePixelRatio || 1
  const d = c.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
  return String(d[0]) + ',' + String(d[1]) + ',' + String(d[2]) + ',' + String(d[3])
}

describe('SunburstChart (real browser)', () => {
  it('paints rings, selects the deepest arc, repaints reactively', async () => {
    const rows = signal(DATA)
    const picked: (SunburstArc | null)[] = []
    const { container } = mountInBrowser(() =>
      SunburstChart({ data: () => rows(), width: 300, height: 300, title: 'Repo', onSelect: (a) => picked.push(a) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    // Outer ring at 3 o'clock is painted; the hole at the centre is not.
    expect(pixel(c, 150 + 130, 150)).not.toMatch(/,0$/)
    expect(pixel(c, 150, 150)).toMatch(/,0$/)
    const before = pixel(c, 150 + 130, 150)
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + 150 + 130, clientY: r.top + 150, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]!.depth).toBe(1)
    rows.set([{ name: 'only', value: 1, color: '#123456' }])
    await flush()
    expect(pixel(c, 150 + 130, 150)).not.toBe(before)
    expect(container.querySelector('table')!.textContent).toContain('only')
  })
})
