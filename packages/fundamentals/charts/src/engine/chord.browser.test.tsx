import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { ChordChart } from './ChordChart'
import { layoutChord } from './chord'
import type { ChordArc, ChordLink, ChordNode } from './chord'

const NODES: ChordNode[] = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
const LINKS: ChordLink[] = [
  { source: 'A', target: 'B', value: 10 },
  { source: 'B', target: 'C', value: 5 },
  { source: 'C', target: 'A', value: 5 },
]

const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('ChordChart (real browser)', () => {
  it('paints, selects the arc under the click, repaints reactively', async () => {
    const links = signal(LINKS)
    const picked: (ChordArc | null)[] = []
    const { container } = mountInBrowser(() =>
      ChordChart({
        animate: false,
        nodes: NODES,
        links: () => links(),
        width: 320,
        height: 320,
        title: 'C',
        onSelect: (a) => picked.push(a),
      }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const before = inked(c)
    expect(before).toBeGreaterThan(0)

    // Click the middle of the first arc's RING band. The host lays out into
    // the box inset by 8 on each side, so the test reproduces that inset
    // rather than assuming the canvas box.
    const l = layoutChord(NODES, LINKS, { x: 8, y: 8, w: 304, h: 304 })
    const arc = l.arcs[0]!
    const mid = (arc.start + arc.end) / 2
    const r = l.circle.radius - l.thickness / 2
    const x = l.circle.center.x + Math.cos(mid) * r
    const y = l.circle.center.y + Math.sin(mid) * r
    const rect = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: rect.left + x, clientY: rect.top + y, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]?.name).toBe('A')

    links.set([{ source: 'A', target: 'B', value: 1 }, { source: 'B', target: 'C', value: 20 }])
    await flush()
    expect(inked(c)).not.toBe(before)
  })

  it('a click in the hole is a miss, not the nearest arc', async () => {
    // Worth its own case in a real browser: the hit test is radial, and a
    // centre click is the one a user makes by accident most often. Reporting
    // the nearest arc there would select a category nobody pointed at.
    const picked: (ChordArc | null)[] = []
    const { container } = mountInBrowser(() =>
      ChordChart({ animate: false, nodes: NODES, links: LINKS, width: 320, height: 320, onSelect: (a) => picked.push(a) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const rect = c.getBoundingClientRect()
    const l = layoutChord(NODES, LINKS, { x: 8, y: 8, w: 304, h: 304 })
    c.dispatchEvent(
      new MouseEvent('click', {
        clientX: rect.left + l.circle.center.x,
        clientY: rect.top + l.circle.center.y,
        bubbles: true,
      }),
    )
    expect(picked).toEqual([null])
  })
})
