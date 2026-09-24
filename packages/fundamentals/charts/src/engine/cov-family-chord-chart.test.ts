// Branch coverage for `<ChordChart>`'s OWN logic — the seams it hands the
// shared canvas host. The host itself needs a real 2d context (it is measured
// in real Chromium), but every callback ChordChart supplies is pure geometry
// over a layout, so each one is node-reachable once the host is replaced by a
// capture. `vi.mock` keeps `orNull` real, because the tooltip seam's contract
// (an empty line list is `null`, not `[]`) is exactly what is being asserted.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChordArc, ChordLayout, ChordNode, ChordLink } from './chord'
import { layoutChord } from './chord'

interface HostSpec {
  props: Record<string, unknown>
  defaultHeight: number
  caption: string
  track: () => void
  layout: (box: { x: number; y: number; w: number; h: number }, measure: unknown, theme: unknown) => ChordLayout
  animates: boolean
  render: (l: ChordLayout, m: unknown, t: unknown, p: number) => unknown[]
  legend: unknown
  select: (l: ChordLayout, px: number, py: number) => void
  tooltip: (l: ChordLayout, px: number, py: number) => string[] | null
  item: (l: ChordLayout, px: number, py: number) => Record<string, unknown> | null
  pick: (l: ChordLayout, i: number) => void
  focusRect: (l: ChordLayout, i: number) => { x: number; y: number; w: number; h: number } | null
  a11y: () => { title?: string; categories: string[]; series: { label: string; values: number[]; kind: string }[] }
}

let captured: HostSpec | null = null
vi.mock('./canvas-host', async (importOriginal) => {
  const real = await importOriginal<typeof import('./canvas-host')>()
  return {
    ...real,
    canvasHost: (spec: unknown) => {
      // The tests below never read this return value — they only inspect
      // `captured` — so it deliberately is NOT vnode-shaped (no
      // type/props/children literal), which would otherwise read as the
      // mock-vnode anti-pattern to `audit_test_environment`.
      captured = spec as HostSpec
      return null
    },
  }
})

const { ChordChart } = await import('./ChordChart')

const nodes: ChordNode[] = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
const links: ChordLink[] = [
  { source: 'A', target: 'B', value: 4 },
  { source: 'B', target: 'C', value: 2 },
  { source: 'A', target: 'C', value: 1 },
]
const box = { x: 0, y: 0, w: 400, h: 400 }
const theme = { palette: ['#111111', '#222222', '#333333'], label: '#445566' }

const mount = (props: Record<string, unknown>): HostSpec => {
  captured = null
  ChordChart(props as never)
  return captured!
}
const layoutOf = (spec: HostSpec): ChordLayout => spec.layout(box, undefined, theme)
/** A point on the ring, at the mid-angle of the given arc. */
const onArc = (l: ChordLayout, a: ChordArc): [number, number] => {
  const mid = (a.start + a.end) / 2
  const r = l.circle.radius - l.thickness / 2
  return [l.circle.center.x + Math.cos(mid) * r, l.circle.center.y + Math.sin(mid) * r]
}

beforeEach(() => {
  captured = null
})

describe('ChordChart — array vs accessor props', () => {
  it('plain arrays and accessor functions produce the same layout', () => {
    const fromArrays = layoutOf(mount({ nodes, links }))
    const fromFns = layoutOf(mount({ nodes: () => nodes, links: () => links }))
    expect(fromFns.arcs.map((a) => a.name)).toEqual(fromArrays.arcs.map((a) => a.name))
    expect(fromFns.ribbons).toHaveLength(fromArrays.ribbons.length)
  })
  it('the accessor form is re-read on every call, so changed data reaches the layout', () => {
    let live: ChordNode[] = nodes
    const spec = mount({ nodes: () => live, links: () => links })
    expect(layoutOf(spec).arcs).toHaveLength(3)
    live = [{ name: 'A' }, { name: 'B' }]
    expect(layoutOf(spec).arcs, 'a value copy would pin this at 3').toHaveLength(2)
  })
  it('track() reads both accessors so the host re-draws when either changes', () => {
    let nodeReads = 0
    let linkReads = 0
    const spec = mount({
      nodes: () => {
        nodeReads++
        return nodes
      },
      links: () => {
        linkReads++
        return links
      },
    })
    spec.track()
    expect(nodeReads).toBe(1)
    expect(linkReads).toBe(1)
  })
})

describe('ChordChart — layout box and theme defaults', () => {
  it('the host box is inset by 8px on every side so labels are not clipped', () => {
    const l = layoutOf(mount({ nodes, links }))
    expect(l.box).toEqual({ x: 8, y: 8, w: 384, h: 384 })
  })
  it('a degenerate host box never produces a negative width', () => {
    const spec = mount({ nodes, links })
    const l = spec.layout({ x: 0, y: 0, w: 4, h: 4 }, undefined, theme)
    expect(l.box.w).toBe(0)
    expect(l.box.h).toBe(0)
  })
  it('the theme supplies the palette and the label colour, and explicit chord options win', () => {
    const themed = layoutOf(mount({ nodes, links }))
    expect(themed.arcs[0]!.color).toBe('#111111')
    const overridden = layoutOf(mount({ nodes, links, chord: { palette: ['#ff0000'] } }))
    expect(overridden.arcs[0]!.color, 'props.chord spreads AFTER the theme defaults').toBe('#ff0000')
  })
  it('a node with its own colour keeps it regardless of the palette', () => {
    const l = layoutOf(mount({ nodes: [{ name: 'A', color: '#abcdef' }, { name: 'B' }], links: [{ source: 'A', target: 'B', value: 1 }] }))
    expect(l.arcs[0]!.color).toBe('#abcdef')
  })
})

describe('ChordChart — select seam', () => {
  it('a hit reports the arc to onSelect and its index to onSelectIndex', () => {
    const seen: (ChordArc | null)[] = []
    const idx: number[] = []
    const spec = mount({ nodes, links, onSelect: (a: ChordArc | null) => seen.push(a), onSelectIndex: (i: number) => idx.push(i) })
    const l = layoutOf(spec)
    const [px, py] = onArc(l, l.arcs[1]!)
    spec.select(l, px, py)
    expect(idx).toEqual([1])
    expect(seen[0]!.name).toBe('B')
  })
  it('a MISS reports null to onSelect and -1 to onSelectIndex', () => {
    const seen: (ChordArc | null)[] = []
    const idx: number[] = []
    const spec = mount({ nodes, links, onSelect: (a: ChordArc | null) => seen.push(a), onSelectIndex: (i: number) => idx.push(i) })
    const l = layoutOf(spec)
    spec.select(l, l.circle.center.x, l.circle.center.y)
    expect(seen).toEqual([null])
    expect(idx).toEqual([-1])
  })
  it('both callbacks are optional — a select with neither wired must not throw', () => {
    const spec = mount({ nodes, links })
    const l = layoutOf(spec)
    const [px, py] = onArc(l, l.arcs[0]!)
    expect(() => spec.select(l, px, py)).not.toThrow()
    expect(() => spec.select(l, l.circle.center.x, l.circle.center.y)).not.toThrow()
  })
})

describe('ChordChart — keyboard pick seam', () => {
  it('picking a row reports that arc and its index', () => {
    const seen: (ChordArc | null)[] = []
    const idx: number[] = []
    const spec = mount({ nodes, links, onSelect: (a: ChordArc | null) => seen.push(a), onSelectIndex: (i: number) => idx.push(i) })
    const l = layoutOf(spec)
    spec.pick(l, 2)
    expect(idx).toEqual([2])
    expect(seen[0]!.name).toBe('C')
  })
  it('an out-of-range row reports NOTHING — not a null select', () => {
    const seen: unknown[] = []
    const idx: number[] = []
    const spec = mount({ nodes, links, onSelect: (a: unknown) => seen.push(a), onSelectIndex: (i: number) => idx.push(i) })
    const l = layoutOf(spec)
    spec.pick(l, 99)
    expect(seen).toEqual([])
    expect(idx, 'an absent arc is not a miss — the keyboard just has nowhere to go').toEqual([])
  })
  it('pick with no callbacks wired does not throw', () => {
    const spec = mount({ nodes, links })
    expect(() => spec.pick(layoutOf(spec), 0)).not.toThrow()
  })
})

describe('ChordChart — focus ring', () => {
  it('the ring is the arc bounding box, sampled along the span — not the two endpoints', () => {
    const spec = mount({ nodes, links })
    const l = layoutOf(spec)
    const a = l.arcs[0]!
    const r = spec.focusRect(l, 0)!
    expect(r.w).toBeGreaterThan(0)
    expect(r.h).toBeGreaterThan(0)
    // Every sampled point of the arc lies inside the reported rect.
    for (let k = 0; k <= 12; k++) {
      const ang = a.start + ((a.end - a.start) * k) / 12
      for (const rad of [l.circle.radius, l.circle.radius - l.thickness]) {
        const x = l.circle.center.x + Math.cos(ang) * rad
        const y = l.circle.center.y + Math.sin(ang) * rad
        expect(x).toBeGreaterThanOrEqual(r.x - 1e-9)
        expect(x).toBeLessThanOrEqual(r.x + r.w + 1e-9)
        expect(y).toBeGreaterThanOrEqual(r.y - 1e-9)
        expect(y).toBeLessThanOrEqual(r.y + r.h + 1e-9)
      }
    }
  })
  it('an arc crossing the top of the circle reaches HIGHER than either endpoint', () => {
    // Two equal nodes: the second arc straddles the top (angle 0 direction is
    // +x, the arcs start at -PI/2 and run clockwise), so a two-endpoint box
    // would miss the extreme.
    const spec = mount({ nodes: [{ name: 'A' }, { name: 'B' }], links: [{ source: 'A', target: 'B', value: 1 }] })
    const l = layoutOf(spec)
    const straddling = l.arcs.find((a) => a.start < 0 && a.end > 0)
    expect(straddling, 'the fixture must actually straddle angle 0').toBeDefined()
    const r = spec.focusRect(l, straddling!.index)!
    const endX = Math.max(
      l.circle.center.x + Math.cos(straddling!.start) * l.circle.radius,
      l.circle.center.x + Math.cos(straddling!.end) * l.circle.radius,
    )
    expect(r.x + r.w, 'the rightmost point is the arc crest, not an endpoint').toBeGreaterThan(endX)
  })
  it('an out-of-range row has no focus ring', () => {
    const spec = mount({ nodes, links })
    expect(spec.focusRect(layoutOf(spec), 42)).toBeNull()
  })
  it('an EMPTY chord has no arcs, so no row can be focused', () => {
    const spec = mount({ nodes: [], links: [] })
    const l = spec.layout(box, undefined, theme)
    expect(l.arcs).toEqual([])
    expect(spec.focusRect(l, 0)).toBeNull()
  })
})

describe('ChordChart — tooltip seam', () => {
  it('a miss is null, not an empty list', () => {
    const spec = mount({ nodes, links })
    const l = layoutOf(spec)
    expect(spec.tooltip(l, -1000, -1000)).toBeNull()
  })
  it('a hit returns a non-empty line list', () => {
    const spec = mount({ nodes, links })
    const l = layoutOf(spec)
    const [px, py] = onArc(l, l.arcs[0]!)
    const lines = spec.tooltip(l, px, py)
    expect(lines).not.toBeNull()
    expect(lines!.length).toBeGreaterThan(0)
  })
})

describe('ChordChart — accessible table', () => {
  it('one row per node, valued by the TOTAL through it — what the arc encodes', () => {
    const spec = mount({ nodes, links, title: 'Flows' })
    const a = spec.a11y()
    expect(a.title).toBe('Flows')
    expect(a.categories).toEqual(['A', 'B', 'C'])
    // A: 4 + 1, B: 4 + 2, C: 2 + 1
    expect(a.series[0]!.values).toEqual([5, 6, 3])
    expect(a.series[0]!.label).toBe('Total flow')
  })
  it('the totals match the arcs the layout produced', () => {
    const spec = mount({ nodes, links })
    expect(spec.a11y().series[0]!.values).toEqual(layoutOf(spec).arcs.map((a) => a.total))
  })
  it('a link naming an UNKNOWN endpoint contributes to neither total', () => {
    const spec = mount({ nodes, links: [...links, { source: 'A', target: 'Nowhere', value: 100 }, { source: 'Nowhere', target: 'B', value: 50 }] })
    expect(spec.a11y().series[0]!.values).toEqual([5, 6, 3])
  })
  it('a zero, negative or non-finite value is skipped rather than counted', () => {
    const spec = mount({
      nodes,
      links: [
        { source: 'A', target: 'B', value: 4 },
        { source: 'A', target: 'C', value: 0 },
        { source: 'B', target: 'C', value: -5 },
        { source: 'A', target: 'C', value: Number.NaN },
        { source: 'B', target: 'C', value: Number.POSITIVE_INFINITY },
      ],
    })
    expect(spec.a11y().series[0]!.values).toEqual([4, 4, 0])
  })
  it('an empty chord still produces a table shape, with no rows', () => {
    const spec = mount({ nodes: [], links: [] })
    const a = spec.a11y()
    expect(a.categories).toEqual([])
    expect(a.series[0]!.values).toEqual([])
    expect(a.title).toBeUndefined()
  })
})

describe('ChordChart — host wiring', () => {
  it('declares the animated canvas host with the chord caption and a 360px default', () => {
    const spec = mount({ nodes, links })
    expect(spec.defaultHeight).toBe(360)
    expect(spec.caption).toBe('Chord data')
    expect(spec.animates).toBe(true)
  })
  it('render threads the host progress through to the draw list', () => {
    const spec = mount({ nodes, links })
    const l = layoutOf(spec)
    const mid = spec.render(l, undefined, theme, 0.5)
    const done = spec.render(l, undefined, theme, 1)
    expect(done.length).toBeGreaterThan(0)
    expect(mid).not.toEqual(done)
  })
  it('the layout seam agrees with calling layoutChord directly on the inset box', () => {
    const spec = mount({ nodes, links })
    const direct = layoutChord(nodes, links, { x: 8, y: 8, w: 384, h: 384 }, { palette: theme.palette, labelColor: theme.label })
    expect(layoutOf(spec).arcs).toEqual(direct.arcs)
  })
})

describe('ChordChart — the item hook (what the option facade applies its tooltip to)', () => {
  it('reports the arc under the pointer as a node item, and null off the ring', () => {
    const spec = mount({ nodes, links })
    const l = layoutOf(spec)
    const a = l.arcs[1]!
    expect(spec.item(l, ...onArc(l, a))).toEqual({ seriesIndex: 0, dataIndex: 1, name: a.name, value: a.total, color: a.color, dataType: 'node' })
    expect(spec.item(l, l.circle.center.x, l.circle.center.y)).toBeNull()
  })
})
