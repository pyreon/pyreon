import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { SankeyChart } from './SankeyChart'
import { layoutSankey } from './sankey'
import type { SankeyLink } from './sankey'
import type { SankeyHit } from './sankey-hit'

const NODES = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
const LINKS: SankeyLink[] = [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 5 }]
const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('SankeyChart (real browser)', () => {
  it('paints, selects a node band at its laid-out position, repaints reactively', async () => {
    const links = signal(LINKS)
    const picked: SankeyHit[] = []
    const { container } = mountInBrowser(() =>
      SankeyChart({ nodes: NODES, links: () => links(), width: 400, height: 300, title: 'Flow', onSelect: (h) => picked.push(h) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const before = inked(c)
    expect(before).toBeGreaterThan(0)
    const b = layoutSankey(NODES, LINKS, { x: 80, y: 8, w: 240, h: 284 }).nodes.find((n) => n.name === 'b')!
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + b.rect.x + b.rect.w / 2, clientY: r.top + b.rect.y + b.rect.h / 2, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]?.kind).toBe('node')
    links.set([{ source: 'a', target: 'c', value: 1 }])
    await flush()
    expect(inked(c)).not.toBe(before)
  })
})
