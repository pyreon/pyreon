import { describe, expect, it } from 'vitest'
import { hitChordIndex, layoutChord, renderChord, ribbonPolygon } from './chord'
import { chordToSvg } from './family-svg'
import { compileFamily, familyToSvg } from './option-family'
import type { ChordLink, ChordNode } from './chord'

const box = { x: 0, y: 0, w: 400, h: 400 }
const nodes: ChordNode[] = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
const links: ChordLink[] = [
  { source: 'A', target: 'B', value: 10 },
  { source: 'B', target: 'C', value: 5 },
  { source: 'C', target: 'A', value: 5 },
]

const TAU = Math.PI * 2

describe('chord layout', () => {
  it('sizes each arc by the total flowing THROUGH it, both directions', () => {
    // A: 10 out + 5 in = 15. B: 10 in + 5 out = 15. C: 5 in + 5 out = 10.
    // The point of the assertion is the "both directions" half — sizing by
    // outgoing alone would make C and A differ when they should not.
    const l = layoutChord(nodes, links, box)
    expect(l.arcs.map((a) => a.total)).toEqual([15, 15, 10])
    const spans = l.arcs.map((a) => a.end - a.start)
    expect(spans[0]).toBeCloseTo(spans[1]!, 10)
    expect(spans[2]! / spans[0]!).toBeCloseTo(10 / 15, 6)
  })

  it('takes the gaps out BEFORE scaling, so spans stay proportional to values', () => {
    // If the pad were taken out afterwards the ratio would drift with node
    // count, which is the bug that makes a chord read as though the data
    // changed when only a category was added.
    const pad = 0.1
    const l = layoutChord(nodes, links, box, { padAngle: pad })
    const total = l.arcs.reduce((s, a) => s + (a.end - a.start), 0)
    expect(total).toBeCloseTo(TAU - pad * nodes.length, 8)
    const spans = l.arcs.map((a) => a.end - a.start)
    expect(spans[2]! / spans[0]!).toBeCloseTo(10 / 15, 6)
  })

  it('never overlaps two arcs, whatever the pad', () => {
    for (const pad of [0, 0.02, 0.2]) {
      const l = layoutChord(nodes, links, box, { padAngle: pad })
      for (let i = 1; i < l.arcs.length; i++) {
        expect(l.arcs[i]!.start, `pad ${pad}`).toBeGreaterThanOrEqual(l.arcs[i - 1]!.end)
      }
    }
  })

  it('gives every link a span on BOTH of its arcs, inside those arcs', () => {
    const l = layoutChord(nodes, links, box)
    expect(l.ribbons).toHaveLength(3)
    for (const r of l.ribbons) {
      const s = l.arcs[r.source]!
      const t = l.arcs[r.target]!
      expect(r.sourceStart).toBeGreaterThanOrEqual(s.start - 1e-9)
      expect(r.sourceEnd).toBeLessThanOrEqual(s.end + 1e-9)
      expect(r.targetStart).toBeGreaterThanOrEqual(t.start - 1e-9)
      expect(r.targetEnd).toBeLessThanOrEqual(t.end + 1e-9)
    }
  })

  it('packs in INPUT order, so a value change does not reshuffle the ribbons', () => {
    // Sorting by value would be prettier and would make a ribbon jump to a
    // different part of the arc when its value crossed a neighbour's — the
    // thing that makes an updating chord unreadable.
    const bumped: ChordLink[] = [
      { source: 'A', target: 'B', value: 1 },
      { source: 'B', target: 'C', value: 5 },
      { source: 'C', target: 'A', value: 5 },
    ]
    const before = layoutChord(nodes, links, box).ribbons.map((r) => r.link)
    const after = layoutChord(nodes, bumped, box).ribbons.map((r) => r.link)
    expect(after).toEqual(before)
  })

  it('drops links naming an unknown node, and non-positive or non-finite values', () => {
    const dirty: ChordLink[] = [
      { source: 'A', target: 'B', value: 10 },
      { source: 'A', target: 'ZZ', value: 4 },
      { source: 'A', target: 'B', value: 0 },
      { source: 'A', target: 'B', value: Number.NaN },
      { source: 'A', target: 'B', value: -3 },
    ]
    const l = layoutChord(nodes, dirty, box)
    expect(l.ribbons).toHaveLength(1)
    // …and the dropped ones contribute nothing to the totals either, or the
    // arcs would be sized for flows that are not drawn.
    expect(l.arcs[0]!.total).toBe(10)
  })

  it('an empty or all-zero input lays out without producing NaN', () => {
    for (const ls of [[], [{ source: 'A', target: 'B', value: 0 }]]) {
      const l = layoutChord(nodes, ls, box)
      expect(l.ribbons).toHaveLength(0)
      expect(Number.isFinite(l.circle.radius)).toBe(true)
      expect(Number.isFinite(l.thickness)).toBe(true)
    }
    expect(layoutChord([], [], box).arcs).toHaveLength(0)
  })

  it('leaves room outside the ring for the labels it will draw', () => {
    const wide = [{ name: 'a name long enough to need real room' }, { name: 'B' }]
    const wideLinks: ChordLink[] = [{ source: wide[0]!.name, target: 'B', value: 1 }]
    const withLabels = layoutChord(wide, wideLinks, box, { showLabels: true })
    const without = layoutChord(wide, wideLinks, box, { showLabels: false })
    expect(withLabels.circle.radius).toBeLessThan(without.circle.radius)
  })
})

describe('chord render', () => {
  it('draws every ribbon UNDER the ring, so a flow leaves from beneath its arc', () => {
    const l = layoutChord(nodes, links, box)
    const cmds = renderChord(l, {})
    const polys = cmds.filter((c) => c.kind === 'polygon')
    expect(polys).toHaveLength(l.ribbons.length + l.arcs.length)
    // Order is the assertion: ribbons first.
    for (let i = 0; i < l.ribbons.length; i++) {
      expect(String((polys[i] as { fill: string }).fill)).toContain('rgba(')
    }
    for (let i = l.ribbons.length; i < polys.length; i++) {
      expect(String((polys[i] as { fill: string }).fill)).toMatch(/^#/)
    }
  })

  it('emits no NaN coordinate for any progress', () => {
    const l = layoutChord(nodes, links, box)
    for (const p of [0.01, 0.25, 0.5, 1]) {
      for (const cmd of renderChord(l, { progress: p })) {
        const pts = (cmd as { points?: { x: number; y: number }[] }).points ?? []
        for (const pt of pts) {
          expect(Number.isFinite(pt.x), `progress ${p}`).toBe(true)
          expect(Number.isFinite(pt.y), `progress ${p}`).toBe(true)
        }
      }
    }
  })

  it('progress 0 draws nothing, and every ribbon polygon closes', () => {
    const l = layoutChord(nodes, links, box)
    expect(renderChord(l, { progress: 0 })).toHaveLength(0)
    for (const r of l.ribbons) {
      const pts = ribbonPolygon(l, r, 1)
      expect(pts.length).toBeGreaterThan(8)
      // It ends where it began, within a sample's width — an unclosed ribbon
      // fills as a wedge to the canvas origin.
      const first = pts[0]!
      const last = pts[pts.length - 1]!
      expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThan(2)
    }
  })

  it('at progress 0 the crossing collapses to the ring rather than to the centre', () => {
    // The entrance grows ribbons INWARD. If the control point were the centre
    // at every progress, a chord would fade in rather than flow in, and at
    // small progress the ribbon would already span the circle.
    const l = layoutChord(nodes, links, box)
    const near = ribbonPolygon(l, l.ribbons[0]!, 0.02)
    const far = ribbonPolygon(l, l.ribbons[0]!, 1)
    const dist = (pts: { x: number; y: number }[]): number =>
      Math.min(...pts.map((p) => Math.hypot(p.x - l.circle.center.x, p.y - l.circle.center.y)))
    expect(dist(near)).toBeGreaterThan(dist(far))
  })

  it('drops a label too wide for the box instead of clipping it', () => {
    const wide = [{ name: 'x'.repeat(400) }, { name: 'B' }]
    const l = layoutChord(wide, [{ source: wide[0]!.name, target: 'B', value: 1 }], box)
    const texts = renderChord(l, {}).filter((c) => c.kind === 'text')
    expect(texts.map((t) => (t as { text: string }).text)).toEqual(['B'])
  })

  it('labels on the left half anchor inward so text never crosses the circle', () => {
    const l = layoutChord(nodes, links, box)
    for (const a of l.arcs) {
      const mid = (a.start + a.end) / 2
      expect(a.labelAlign, a.name).toBe(Math.cos(mid) >= 0 ? 'start' : 'end')
    }
  })
})

describe('chord hit testing', () => {
  it('finds the arc under a point on the ring, including the wrapped one', () => {
    const l = layoutChord(nodes, links, box)
    for (const a of l.arcs) {
      const mid = (a.start + a.end) / 2
      const r = l.circle.radius - l.thickness / 2
      const px = l.circle.center.x + Math.cos(mid) * r
      const py = l.circle.center.y + Math.sin(mid) * r
      // The last arc runs past PI, where atan2 has wrapped — the reason the
      // hit test tries the angle twice.
      expect(hitChordIndex(l, px, py), a.name).toBe(a.index)
    }
  })

  it('misses the hole, the outside, and a gap between arcs', () => {
    const l = layoutChord(nodes, links, box, { padAngle: 0.4 })
    expect(hitChordIndex(l, l.circle.center.x, l.circle.center.y)).toBe(-1)
    expect(hitChordIndex(l, l.circle.center.x + l.circle.radius + 20, l.circle.center.y)).toBe(-1)
    const gapMid = l.arcs[0]!.end + 0.2
    const r = l.circle.radius - l.thickness / 2
    expect(hitChordIndex(l, l.circle.center.x + Math.cos(gapMid) * r, l.circle.center.y + Math.sin(gapMid) * r)).toBe(-1)
  })
})

describe('chord option mapping', () => {
  it('an ECharts chord series lowers nodes/links, padAngle and ringSize', () => {
    const f = compileFamily({
      series: [
        {
          type: 'chord',
          padAngle: 0.12,
          ringSize: 0.2,
          data: [{ name: 'a', itemStyle: { color: '#123456' } }, { name: 'b' }],
          links: [{ source: 'a', target: 'b', value: 3 }],
        },
      ],
    })!
    if (f.plan.kind !== 'chord') throw new Error('kind')
    expect(f.plan.nodes[0]!.color).toBe('#123456')
    expect(f.plan.links[0]!.value).toBe(3)
    expect(f.plan.chord.padAngle).toBe(0.12)
    expect(f.plan.chord.ringRatio).toBe(0.2)
    expect(f.warnings).toEqual([])
    expect(familyToSvg(f.plan)).toContain('<polygon')
  })

  it('reads a sankey-shaped option unchanged — the reason to reach for chord', () => {
    // The two take the same `{ data, links }`, so switching a spec between them
    // is a one-word edit. If this ever needed reshaping, the compat claim in the
    // manifest would be wrong.
    const spec = {
      data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      links: [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 3 }],
    }
    const asSankey = compileFamily({ series: [{ type: 'sankey', ...spec }] })!
    const asChord = compileFamily({ series: [{ type: 'chord', ...spec }] })!
    expect(asChord.warnings).toEqual([])
    if (asSankey.plan.kind !== 'sankey' || asChord.plan.kind !== 'chord') throw new Error('kind')
    expect(asChord.plan.nodes.map((n) => n.name)).toEqual(asSankey.plan.nodes.map((n) => n.name))
    expect(asChord.plan.links).toEqual(asSankey.plan.links)
  })

  it('names a bad node or link rather than dropping it silently', () => {
    const f = compileFamily({
      series: [{ type: 'chord', data: [{ name: 'a' }, { nope: 1 }], links: [{ source: 'a', target: 'a' }] }],
    })!
    expect(f.warnings.map((w) => w.code)).toEqual(['series-data-shape', 'series-data-shape'])
  })

  it('chordToSvg describes what it drew, for the hidden a11y summary', () => {
    const svg = chordToSvg({
      nodes: [{ name: 'A' }, { name: 'B' }],
      links: [{ source: 'A', target: 'B', value: 4 }],
      title: 'Flows',
    })
    expect(svg).toContain('2 categories, 1 flows')
    expect(svg).not.toContain('NaN')
  })
})
