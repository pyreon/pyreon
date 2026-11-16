import { describe, expect, it } from 'vitest'
import {
  createRecorder,
  displayName,
  effectLanes,
  FIRE_RING,
  ingestFires,
  lastCascadeIds,
  selectedScope,
  signalRows,
  withDisplayNames,
} from './reactive-view'
import type { ReactiveFire, ReactiveGraph } from './types'

const node = (
  id: number,
  kind: 'signal' | 'derived' | 'effect',
  name: string,
  extra: Partial<ReactiveGraph['nodes'][number]> = {},
) => ({
  id,
  kind,
  name,
  value: '',
  subscribers: 0,
  fires: 0,
  lastFire: null,
  ...extra,
})

const fire = (id: number, ts: number, cascade = 1): ReactiveFire =>
  ({ id, ts, cascade }) as ReactiveFire

describe('displayName / withDisplayNames', () => {
  it('names a synthetic node after where it was created, strips query and hash, keeps real names', () => {
    expect(
      displayName('effect#7', { file: '/src/ui/Composer.tsx?t=123#x', line: 31 } as never),
    ).toBe('Composer.tsx:31')
    expect(displayName('derived#2', { file: 'bare.ts', line: 4 } as never)).toBe('bare.ts:4')
    expect(displayName('draft', { file: '/a/b.ts', line: 1 } as never)).toBe('draft')
    expect(displayName('signal#1', undefined)).toBe('signal#1')
  })

  it('renames only the nodes whose name changes and keeps the others by identity', () => {
    const plain = node(1, 'signal', 'count')
    const synthetic = node(2, 'effect', 'effect#2', {
      loc: { file: '/x/View.tsx', line: 9 },
    } as never)
    const graph: ReactiveGraph = { nodes: [plain, synthetic], edges: [{ from: 1, to: 2 }] }
    const out = withDisplayNames(graph)
    expect(out.nodes[0]).toBe(plain)
    expect(out.nodes[1]?.name).toBe('View.tsx:9')
    expect(out.nodes[1]?.id).toBe(2)
    expect(out.edges).toBe(graph.edges)
  })
})

describe('selectedScope', () => {
  const graph: ReactiveGraph = {
    nodes: [
      node(1, 'signal', 'a'),
      node(2, 'derived', 'b'),
      node(3, 'effect', 'c'),
      node(4, 'signal', 'z'),
    ],
    edges: [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ],
  }

  it('walks upstream and downstream of the focus, ignoring unknown and repeated focus ids', () => {
    const r = selectedScope(graph, [2, 2, 99], 10)
    expect(r.graph.nodes.map((n) => n.id).sort()).toEqual([1, 2, 3])
    expect(r.total).toBe(3)
  })

  it('keeps the nearest nodes of both sides when capped', () => {
    const r = selectedScope(graph, [2], 2)
    expect(r.graph.nodes).toHaveLength(2)
    expect(r.total).toBe(3)
  })
})

describe('lastCascadeIds', () => {
  it('is empty with no fires, else the ids of the newest cascade', () => {
    expect(lastCascadeIds([]).size).toBe(0)
    expect([...lastCascadeIds([fire(1, 1, 1), fire(2, 2, 2), fire(3, 3, 2)])].sort()).toEqual([
      2, 3,
    ])
  })
})

describe('signalRows ordering', () => {
  it('filters by name, orders by recency, then by fire count, then by id', () => {
    const graph: ReactiveGraph = {
      nodes: [
        node(1, 'signal', 'Alpha', { lastFire: 5, fires: 1 }),
        node(2, 'signal', 'alphabet', { lastFire: 5, fires: 3 }),
        node(3, 'signal', 'alpine', { lastFire: 5, fires: 3 }),
        node(4, 'signal', 'old', { lastFire: null, fires: 9 }),
        node(5, 'effect', 'alpha-effect'),
      ],
      edges: [],
    }
    expect(signalRows(graph).map((n) => n.id)).toEqual([2, 3, 1, 4])
    expect(signalRows(graph, '  ALP ').map((n) => n.id)).toEqual([2, 3, 1])
  })
})

describe('effectLanes edges', () => {
  const graph: ReactiveGraph = {
    nodes: [
      node(1, 'signal', 's'),
      node(2, 'effect', 'e', { fires: 4 }),
      node(3, 'effect', 'quiet'),
    ],
    edges: [
      { from: 1, to: 2 },
      { from: 77, to: 2 },
      { from: 1, to: 3 },
    ],
  }

  it('counts only fires of effects inside the window, names reads, skips edges from unknown nodes, and flags a full ring', () => {
    const fires = [fire(2, 100), fire(2, 5000), fire(1, 5000), fire(2, -50000), fire(2, 99999)]
    const out = effectLanes(graph, fires, 6000, 10_000)
    expect(out.lanes).toHaveLength(1)
    expect(out.lanes[0]).toMatchObject({ id: 2, reads: ['s'], fires: 4, windowFires: 2 })
    expect(out.total).toBe(1)
    expect(out.ringFull).toBe(false)
    const full = Array.from({ length: FIRE_RING }, (_, i) => fire(2, 5000 + i))
    expect(effectLanes(graph, full, 7000).ringFull).toBe(true)
  })

  it('orders lanes busiest first, then by id, and caps them', () => {
    const g2: ReactiveGraph = {
      nodes: [node(2, 'effect', 'a'), node(3, 'effect', 'b'), node(4, 'effect', 'c')],
      edges: [],
    }
    const fires = [fire(4, 10), fire(3, 11), fire(3, 12), fire(2, 13)]
    const out = effectLanes(g2, fires, 100, 1000, 2)
    expect(out.lanes.map((l) => l.id)).toEqual([3, 2])
    expect(out.total).toBe(3)
  })
})

describe('ingestFires', () => {
  const info = (id: number) => (id === 1 ? { name: 'sig', kind: 'signal' as const } : undefined)

  it('treats a fire of an unknown node as an effect named by id, and only counts effect runs', () => {
    const rec = ingestFires(createRecorder(), [fire(1, 1, 7), fire(9, 2, 7)], info)
    expect(rec.batches).toHaveLength(1)
    expect(rec.batches[0]).toMatchObject({
      rootName: 'sig',
      rootKind: 'signal',
      fires: 2,
      effectRuns: 1,
      end: 2,
    })
    // An older timestamp inside a batch does not move its end or the recorder clock backwards.
    ingestFires(rec, [fire(9, 1.5, 7)], info)
    expect(rec.lastTs).toBe(2)
  })

  it('names an unknown root by its id', () => {
    const rec = ingestFires(createRecorder(), [fire(42, 1, 3)], info)
    expect(rec.batches[0]).toMatchObject({ rootName: '#42', rootKind: 'effect' })
  })

  it('counts a gap when a full ring has wrapped past fires that were never read', () => {
    const rec = ingestFires(createRecorder(), [fire(1, 1, 1)], info)
    const wrapped = Array.from({ length: FIRE_RING }, (_, i) => fire(1, 100 + i, 2 + i))
    ingestFires(rec, wrapped, info)
    expect(rec.gaps).toBe(1)
  })

  it('does nothing for fires it has already seen', () => {
    const rec = ingestFires(createRecorder(), [fire(1, 5, 1)], info)
    expect(ingestFires(rec, [fire(1, 5, 1)], info)).toBe(rec)
    expect(rec.batches).toHaveLength(1)
  })
})
