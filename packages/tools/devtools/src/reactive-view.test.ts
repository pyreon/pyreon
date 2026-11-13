import { describe, expect, it } from 'vitest'
import {
  batchLabel,
  BATCH_CAP,
  causeText,
  causeView,
  countKinds,
  createRecorder,
  effectLanes,
  everythingScope,
  FIRE_RING,
  formatAgo,
  formatSpan,
  ingestFires,
  lastCascadeIds,
  layoutGraph,
  selectedScope,
  signalRows,
  summarize,
} from './reactive-view'
import type { ReactiveFire, ReactiveGraph, UpdateCause } from './types'

const g = (
  nodes: Partial<ReactiveGraph['nodes'][number]>[],
  edges: ReactiveGraph['edges'] = [],
): ReactiveGraph => ({
  nodes: nodes.map((n, i) => ({
    id: n.id ?? i + 1,
    kind: n.kind ?? 'signal',
    name: n.name ?? `n${i}`,
    value: n.value ?? '',
    subscribers: n.subscribers ?? 0,
    fires: n.fires ?? 0,
    lastFire: n.lastFire ?? null,
  })),
  edges,
})

describe('layoutGraph', () => {
  it('columns by kind: signals left, derived mid, effects right', () => {
    const laid = layoutGraph(
      g([
        { id: 1, kind: 'signal' },
        { id: 2, kind: 'derived' },
        { id: 3, kind: 'effect' },
      ]),
    )
    const x = (id: number) => laid.nodes.find((n) => n.id === id)?.x
    expect(x(1)).toBeLessThan(x(2) as number)
    expect(x(2)).toBeLessThan(x(3) as number)
  })

  it('stacks same-kind nodes top-down in stable id order', () => {
    const laid = layoutGraph(
      g([
        { id: 5, kind: 'signal' },
        { id: 2, kind: 'signal' },
      ]),
    )
    const a = laid.nodes.find((n) => n.id === 2)!
    const b = laid.nodes.find((n) => n.id === 5)!
    expect(a.x).toBe(b.x)
    expect(a.y).toBeLessThan(b.y) // id 2 above id 5
  })

  it('drops edges whose endpoints are absent (defensive against GC)', () => {
    const laid = layoutGraph(
      g([{ id: 1, kind: 'signal' }], [
        { from: 1, to: 99 },
        { from: 1, to: 1 },
      ]),
    )
    expect(laid.edges).toEqual([{ from: 1, to: 1 }])
  })

  it('is deterministic — identical input → identical layout', () => {
    const input = g([
      { id: 3, kind: 'derived' },
      { id: 1, kind: 'signal' },
    ])
    expect(layoutGraph(input)).toEqual(layoutGraph(input))
  })

  it('empty graph → positive canvas, no nodes', () => {
    const laid = layoutGraph(g([]))
    expect(laid.nodes).toHaveLength(0)
    expect(laid.width).toBeGreaterThan(0)
    expect(laid.height).toBeGreaterThan(0)
  })
})


// A small app graph: draft, to → isValid → submit; draft → charCount.
const app = g(
  [
    { id: 1, kind: 'signal', name: 'draft', fires: 41, lastFire: 900 },
    { id: 2, kind: 'signal', name: 'to', fires: 3, lastFire: 100 },
    { id: 3, kind: 'derived', name: 'isValid', fires: 41, lastFire: 901 },
    { id: 4, kind: 'effect', name: 'submit', fires: 20, lastFire: 902 },
    { id: 5, kind: 'effect', name: 'charCount', fires: 41, lastFire: 903 },
    { id: 6, kind: 'signal', name: 'unrelated', fires: 0, lastFire: null },
    { id: 7, kind: 'effect', name: 'logger', fires: 0, lastFire: null },
  ],
  [
    { from: 1, to: 3 },
    { from: 2, to: 3 },
    { from: 3, to: 4 },
    { from: 1, to: 5 },
    { from: 6, to: 7 },
  ],
)

describe('graph scopes', () => {
  it('everythingScope keeps the graph when under the cap', () => {
    const s = everythingScope(app, 100)
    expect(s.total).toBe(7)
    expect(s.graph.nodes).toHaveLength(7)
  })

  it('everythingScope caps by most fires and drops edges to capped-out nodes', () => {
    const s = everythingScope(app, 3)
    expect(s.total).toBe(7)
    expect(s.graph.nodes.map((n) => n.id).sort()).toEqual([1, 3, 5])
    expect(s.graph.edges).toEqual([
      { from: 1, to: 3 },
      { from: 1, to: 5 },
    ])
  })

  it('selectedScope follows dependencies up and subscribers down, not siblings', () => {
    const s = selectedScope(app, [3], 100)
    // isValid's deps (draft, to) and subscriber (submit); NOT charCount,
    // which only shares the draft dependency.
    expect(s.graph.nodes.map((n) => n.id).sort()).toEqual([1, 2, 3, 4])
    expect(s.total).toBe(4)
  })

  it('selectedScope ignores unknown focus ids and respects the cap', () => {
    expect(selectedScope(app, [99], 10).graph.nodes).toHaveLength(0)
    const capped = selectedScope(app, [3], 2)
    expect(capped.total).toBe(4)
    expect(capped.graph.nodes).toHaveLength(2)
    expect(capped.graph.nodes.some((n) => n.id === 3)).toBe(true)
  })

  it('lastCascadeIds returns the ids of the newest cascade only', () => {
    const fires: ReactiveFire[] = [
      { id: 2, ts: 1, cascade: 1 },
      { id: 1, ts: 2, cascade: 2 },
      { id: 3, ts: 3, cascade: 2 },
    ]
    expect([...lastCascadeIds(fires)].sort()).toEqual([1, 3])
    expect(lastCascadeIds([]).size).toBe(0)
  })
})

describe('signals', () => {
  it('lists signals and computeds, newest write first, never effects', () => {
    expect(signalRows(app).map((n) => n.name)).toEqual(['isValid', 'draft', 'to', 'unrelated'])
  })

  it('filters by name, case-insensitively', () => {
    expect(signalRows(app, '  DRA ').map((n) => n.name)).toEqual(['draft'])
    expect(signalRows(app, 'zzz')).toEqual([])
  })

  it('formatAgo reads the page clock and covers every unit', () => {
    expect(formatAgo(null, 5)).toBe('never')
    expect(formatAgo(1000, 1400)).toBe('0.4s ago')
    expect(formatAgo(0, 12_500)).toBe('12s ago')
    expect(formatAgo(0, 4 * 60_000 + 10)).toBe('4m ago')
    expect(formatAgo(0, 2 * 3_600_000)).toBe('2h ago')
    // A lastFire "after" now (clock skew) never reads negative.
    expect(formatAgo(10, 5)).toBe('0.0s ago')
  })

  it('countKinds counts each kind', () => {
    expect(countKinds(app)).toEqual({ signal: 3, derived: 1, effect: 3 })
  })
})

describe('effectLanes', () => {
  const fires: ReactiveFire[] = [
    { id: 4, ts: 9_000, cascade: 1 },
    { id: 5, ts: 9_500, cascade: 1 },
    { id: 5, ts: 14_000, cascade: 2 },
    { id: 5, ts: 19_000, cascade: 3 },
    { id: 1, ts: 19_000, cascade: 3 }, // a signal: not a lane
  ]

  it('one lane per effect that fired in the window, busiest first, with its reads', () => {
    const res = effectLanes(app, fires, 20_000, 10_000)
    expect(res.lanes.map((l) => l.name)).toEqual(['charCount'])
    const lane = res.lanes[0]!
    expect(lane.reads).toEqual(['draft'])
    expect(lane.windowFires).toBe(2)
    expect(lane.fires).toBe(41)
    expect(lane.ticks).toEqual([0.4, 0.9])
    expect(res.ringFull).toBe(false)
  })

  it('a wider window includes older fires and sorts by fires in it', () => {
    const res = effectLanes(app, fires, 20_000, 20_000)
    expect(res.lanes.map((l) => l.name)).toEqual(['charCount', 'submit'])
    expect(res.lanes[1]!.reads).toEqual(['isValid'])
  })

  it('caps lanes and reports the total', () => {
    const res = effectLanes(app, fires, 20_000, 20_000, 1)
    expect(res.lanes).toHaveLength(1)
    expect(res.total).toBe(2)
  })

  it('flags a full fire ring', () => {
    const full = Array.from({ length: FIRE_RING }, (_, i) => ({ id: 4, ts: i, cascade: i }))
    expect(effectLanes(app, full, FIRE_RING).ringFull).toBe(true)
  })
})

describe('profiler recorder', () => {
  const info = (id: number) => {
    const n = app.nodes.find((x) => x.id === id)
    return n ? { name: n.name, kind: n.kind } : undefined
  }

  it('groups fires by cascade, rooted at the write that started it', () => {
    const rec = ingestFires(
      createRecorder(),
      [
        { id: 1, ts: 10, cascade: 7 },
        { id: 3, ts: 10.02, cascade: 7 },
        { id: 4, ts: 10.05, cascade: 7 },
        { id: 2, ts: 20, cascade: 8 },
      ],
      info,
    )
    expect(rec.batches).toHaveLength(2)
    const [a, b] = rec.batches
    expect(a).toMatchObject({ rootName: 'draft', rootKind: 'signal', fires: 3, effectRuns: 1 })
    expect(a!.end - a!.start).toBeCloseTo(0.05)
    expect(batchLabel(a!)).toBe('draft changed · 3 fires')
    expect(batchLabel(b!)).toBe('to changed · 1 fire')
    expect(rec.lastTs).toBe(20)
    expect(rec.gaps).toBe(0)
  })

  it('skips fires it has already seen, and grows a batch whose cascade is still open', () => {
    const rec = createRecorder()
    ingestFires(rec, [{ id: 1, ts: 10, cascade: 7 }], info)
    ingestFires(
      rec,
      [
        { id: 1, ts: 10, cascade: 7 },
        { id: 5, ts: 30, cascade: 7 },
      ],
      info,
    )
    expect(rec.batches).toHaveLength(1)
    expect(rec.batches[0]).toMatchObject({ fires: 2, effectRuns: 1, start: 10, end: 30 })
  })

  it('counts a gap when a full ring starts after the last fire it saw', () => {
    const rec = createRecorder()
    ingestFires(rec, [{ id: 1, ts: 1, cascade: 1 }], info)
    const wrapped = Array.from({ length: FIRE_RING }, (_, i) => ({ id: 1, ts: 100 + i, cascade: 2 + i }))
    ingestFires(rec, wrapped, info)
    expect(rec.gaps).toBe(1)
    // A full ring that still overlaps what we saw is not a gap.
    const overlap = Array.from({ length: FIRE_RING }, (_, i) => ({ id: 1, ts: 300 + i, cascade: 9000 + i }))
    overlap[0] = { id: 1, ts: rec.lastTs as number, cascade: 1 }
    ingestFires(rec, overlap, info)
    expect(rec.gaps).toBe(1)
  })

  it('names unknown ids by number and keeps at most BATCH_CAP batches', () => {
    const many = Array.from({ length: BATCH_CAP + 5 }, (_, i) => ({ id: 99, ts: i + 1, cascade: i }))
    const rec = ingestFires(createRecorder(), many, info)
    expect(rec.batches).toHaveLength(BATCH_CAP)
    expect(rec.batches[0]!.rootName).toBe('#99')
    expect(batchLabel(rec.batches[0]!)).toBe('#99 ran · 1 fire')
  })

  it('formatSpan admits the clock resolution', () => {
    expect(formatSpan(0)).toBe('< 0.1 ms')
    expect(formatSpan(0.0999)).toBe('< 0.1 ms')
    expect(formatSpan(0.41)).toBe('0.41 ms')
  })

  it('summarize totals fires, effect runs and the longest span', () => {
    const rec = ingestFires(
      createRecorder(),
      [
        { id: 1, ts: 10, cascade: 1 },
        { id: 3, ts: 10.5, cascade: 1 },
        { id: 2, ts: 20, cascade: 2 },
        { id: 4, ts: 20.1, cascade: 2 },
      ],
      info,
    )
    expect(summarize(rec.batches)).toEqual({ updates: 2, fires: 4, effectRuns: 1, longest: 0.5 })
    expect(summarize([])).toEqual({ updates: 0, fires: 0, effectRuns: 0, longest: 0 })
    expect(batchLabel({ ...rec.batches[0]!, rootKind: 'derived' })).toBe('draft recomputed · 2 fires')
  })
})

describe('why did this update?', () => {
  const cause: UpdateCause = {
    target: { id: 4, kind: 'effect', name: 'submit', ts: 3, loc: { file: '/src/Composer.tsx?t=123', line: 22, col: 3 } },
    chain: [
      { id: 1, kind: 'signal', name: 'draft', ts: 1, loc: { file: 'http://localhost:5173/src/Composer.tsx', line: 18, col: 9 } },
      { id: 3, kind: 'derived', name: 'isValid', ts: 2 },
    ],
    rootReached: true,
  }

  it('lists the chain root-first and ends with the target, with file:line', () => {
    const v = causeView(cause)
    expect(v.direct).toBe(false)
    expect(v.truncated).toBe(false)
    expect(v.steps).toEqual([
      { name: 'draft', kind: 'signal', verb: 'changed', where: 'Composer.tsx:18' },
      { name: 'isValid', kind: 'derived', verb: 'recomputed', where: null },
      { name: 'submit', kind: 'effect', verb: 'ran', where: 'Composer.tsx:22' },
    ])
    expect(causeText(cause)).toBe('draft changed → isValid recomputed → submit ran')
  })

  it('a direct write is one step; a truncated chain says so', () => {
    const direct = causeView({ target: cause.chain[0]!, chain: [], rootReached: true })
    expect(direct.direct).toBe(true)
    expect(direct.steps).toHaveLength(1)
    const cut = { ...cause, rootReached: false }
    expect(causeView(cut).truncated).toBe(true)
    expect(causeText(cut)).toBe('… → draft changed → isValid recomputed → submit ran')
    expect(causeView({ ...cause, target: { ...cause.target, loc: { file: 'App.tsx', line: 1, col: 1 } } }).steps[2]!.where).toBe('App.tsx:1')
  })
})
