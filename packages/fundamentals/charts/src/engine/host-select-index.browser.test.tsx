// `onSelectIndex` — the multiplatform-safe selection callback on the family
// hosts: the engine's INDEX hit (what the native tap gesture also receives),
// beside the web-shaped `onSelect`. Real Chromium: a real click at a computed
// position on the canvas.

import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { SankeyChart } from './SankeyChart'
import { TreemapChart } from './TreemapChart'
import { layoutSankey, hitSankeyIndex } from './sankey'
import type { SankeyHitIndex, SankeyLink, SankeyNode } from './sankey'
import { layoutTreemap } from './treemap'
import type { TreeNode } from './treemap'

const NODES: SankeyNode[] = [{ name: 'Coal' }, { name: 'Power' }, { name: 'Homes' }]
const LINKS: SankeyLink[] = [
  { source: 'Coal', target: 'Power', value: 10 },
  { source: 'Power', target: 'Homes', value: 8 },
]

function clickAt(canvas: HTMLCanvasElement, x: number, y: number): void {
  const r = canvas.getBoundingClientRect()
  canvas.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}

describe('onSelectIndex on the family hosts', () => {
  it('SankeyChart: a click on a node band reports its index; empty space reports -1/-1; onSelect still fires', async () => {
    const indexHits: SankeyHitIndex[] = []
    const hits: unknown[] = []
    const { container } = mountInBrowser(
      h(SankeyChart, { nodes: NODES, links: LINKS, width: 480, height: 240, onSelectIndex: (hit: SankeyHitIndex) => indexHits.push(hit), onSelect: (hit: unknown) => hits.push(hit) }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    // The host lays out with gutter 80 into { x: 80, y: 8, w: 480 - 160, h: 240 - 16 } — recompute the same layout.
    const layout = layoutSankey(NODES, LINKS, { x: 80, y: 8, w: 320, h: 224 })
    const coal = layout.nodes[0]!.rect
    clickAt(canvas, coal.x + coal.w / 2, coal.y + coal.h / 2)
    expect(indexHits).toEqual([{ node: 0, link: -1 }])
    expect(hits).toHaveLength(1)
    expect(hitSankeyIndex(layout, coal.x + 1, coal.y + 1)).toEqual({ node: 0, link: -1 })
    clickAt(canvas, 2, 2)
    expect(indexHits[1]).toEqual({ node: -1, link: -1 })
  })

  it('TreemapChart: a click reports the deepest cell index under the point, -1 outside', async () => {
    const data: TreeNode[] = [{ name: 'a', value: 3 }, { name: 'b', value: 1 }]
    const picked: number[] = []
    const { container } = mountInBrowser(h(TreemapChart, { data, width: 200, height: 100, onSelectIndex: (i: number) => picked.push(i) }))
    await flush()
    const canvas = container.querySelector('canvas')!
    const cells = layoutTreemap(data, { x: 0, y: 0, w: 200, h: 100 })
    const b = cells.find((c) => c.name === 'b')!
    clickAt(canvas, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2)
    expect(picked).toEqual([cells.indexOf(b)])
    clickAt(canvas, 199.5, 99.5)
    expect(picked.length).toBe(2)
  })
})
