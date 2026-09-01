import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { GraphChart } from './GraphChart'
import { layoutGraph } from './graph'
import type { GraphLayoutNode, GraphLink } from './graph'

const NODES = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const LINKS: GraphLink[] = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }]
const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('GraphChart (real browser)', () => {
  it('paints, selects a node at its laid-out position, repaints reactively', async () => {
    const links = signal(LINKS)
    const picked: (GraphLayoutNode | null)[] = []
    const { container } = mountInBrowser(() =>
      GraphChart({ nodes: NODES, links: () => links(), width: 400, height: 300, title: 'Net', onSelect: (n) => picked.push(n) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const before = inked(c)
    expect(before).toBeGreaterThan(0)
    const a = layoutGraph(NODES, LINKS, { x: 0, y: 0, w: 400, h: 300 }).nodes[0]!
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + a.at.x, clientY: r.top + a.at.y, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]!.id).toBe('a')
    links.set([])
    await flush()
    expect(inked(c)).not.toBe(before)
  })
})
