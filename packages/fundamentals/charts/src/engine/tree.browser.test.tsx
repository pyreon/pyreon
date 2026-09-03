import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { TreeChart } from './TreeChart'
import { layoutTree } from './tree'
import type { TreeLayoutNode } from './tree'
import type { TreeNode } from './treemap'

const DATA: TreeNode[] = [{ name: 'root', children: [{ name: 'a', children: [{ name: 'a1' }, { name: 'a2' }] }, { name: 'b' }] }]
const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('TreeChart (real browser)', () => {
  it('paints, selects a node at its laid-out position, repaints reactively', async () => {
    const rows = signal(DATA)
    const picked: (TreeLayoutNode | null)[] = []
    const { container } = mountInBrowser(() =>
      TreeChart({ data: () => rows(), width: 400, height: 300, title: 'Org', onSelect: (n) => picked.push(n) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const before = inked(c)
    expect(before).toBeGreaterThan(0)
    const b = layoutTree(DATA, { x: 0, y: 0, w: 400, h: 300 }).nodes.find((n) => n.name === 'b')!
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + b.at.x, clientY: r.top + b.at.y, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]!.name).toBe('b')
    rows.set([{ name: 'only' }])
    await flush()
    expect(inked(c)).not.toBe(before)
    expect(container.querySelector('table')!.textContent).toContain('only')
  })
})
