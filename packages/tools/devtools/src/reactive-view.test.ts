import { describe, expect, it } from 'vitest'
import { bucketFires, layoutGraph } from './reactive-view'
import type { ReactiveGraph } from './types'

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
      g(
        [{ id: 1, kind: 'signal' }],
        [
          { from: 1, to: 99 },
          { from: 1, to: 1 },
        ],
      ),
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

describe('bucketFires', () => {
  it('empty → single empty frame, max ≥ 1 (safe divisor)', () => {
    const b = bucketFires([])
    expect(b.frames).toEqual([0])
    expect(b.max).toBe(1)
    expect(b.total).toBe(0)
  })

  it('buckets by frame window and counts total', () => {
    const b = bucketFires(
      [
        { id: 1, ts: 0 },
        { id: 1, ts: 50 },
        { id: 2, ts: 150 },
        { id: 2, ts: 999 },
      ],
      100,
    )
    expect(b.total).toBe(4)
    expect(b.frames[0]).toBe(2) // ts 0 + 50
    expect(b.frames[1]).toBe(1) // ts 150
    expect(b.frames.reduce((a, c) => a + c, 0)).toBe(4)
    expect(b.max).toBeGreaterThanOrEqual(2)
  })

  it('clamps to maxFrames', () => {
    const fires = Array.from({ length: 500 }, (_, i) => ({ id: 1, ts: i * 100 }))
    const b = bucketFires(fires, 100, 60)
    expect(b.frames.length).toBeLessThanOrEqual(60)
    expect(b.total).toBe(500)
  })

  it('out-of-range timestamps clamp into the first/last frame', () => {
    const b = bucketFires(
      [
        { id: 1, ts: 100 },
        { id: 1, ts: 100 },
        { id: 1, ts: 300 },
      ],
      100,
    )
    expect(b.total).toBe(3)
    expect(b.frames.reduce((a, c) => a + c, 0)).toBe(3)
  })
})
