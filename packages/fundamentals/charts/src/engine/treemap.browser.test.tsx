import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { TreemapChart } from './TreemapChart'
import type { TreeNode, TreemapCell } from './treemap'

const DATA: TreeNode[] = [{ name: 'docs', value: 30 }, { name: 'src', children: [{ name: 'core', value: 50 }, { name: 'ui', value: 20 }] }]
const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('TreemapChart (real browser)', () => {
  it('paints, selects the deepest cell, repaints reactively', async () => {
    const rows = signal(DATA)
    const picked: (TreemapCell | null)[] = []
    const { container } = mountInBrowser(() =>
      TreemapChart({ data: () => rows(), width: 400, height: 300, title: 'Repo', onSelect: (c) => picked.push(c) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    expect(inked(c)).toBeGreaterThan(0)
    // A treemap tiles the WHOLE canvas, so ink count cannot tell two frames
    // apart — sample a pixel's colour instead.
    const pixel = (): string => {
      const dpr = window.devicePixelRatio || 1
      const d = c.getContext('2d')!.getImageData(Math.round(200 * dpr), Math.round(150 * dpr), 1, 1).data
      return String(d[0]) + ',' + String(d[1]) + ',' + String(d[2])
    }
    const before = pixel()
    // The whole canvas is tiled; any interior click lands on a leaf.
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + 200, clientY: r.top + 150, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]!.leaf).toBe(true)
    rows.set([{ name: 'only', value: 1, color: '#123456' }])
    await flush()
    expect(pixel()).not.toBe(before)
    expect(container.querySelector('table')!.textContent).toContain('only')
  })
})
