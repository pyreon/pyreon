/**
 * P5 — drag-session snap precompute (`_createSnapSession`).
 *
 * `getSnapLines` re-scans EVERY node (O(N) getNode find + N nodeDims
 * allocations) on EVERY pointermove, with object snapping ON by default. The
 * session flattens all candidates into primitive arrays once at dragStart;
 * each `move` is a tight numeric scan that never touches the graph again.
 *
 * Bisect: revert the drag handler to `instance.getSnapLines(...)` (or gut the
 * session's candidate arrays) → the zero-rescan spec fails (nodes.peek called
 * per move); the equivalence sweep fails if the candidate math diverges.
 */
import { describe, expect, it } from 'vitest'
import { createFlow } from '../flow'

function grid(n: number) {
  return createFlow({
    nodes: Array.from({ length: n }, (_, i) => ({
      id: 'n' + i,
      position: { x: (i % 5) * 137, y: Math.floor(i / 5) * 91 },
      data: {},
    })),
  })
}

describe('snap session (P5)', () => {
  it('is result-identical to getSnapLines for a single-node drag (position sweep)', () => {
    const flow = grid(20)
    const session = flow._createSnapSession('n0')!
    expect(session).toBeTruthy()
    // Sweep positions that hit center/left/right/top/bottom candidates at
    // sub-threshold offsets, plus far-away misses.
    const probes: Array<{ x: number; y: number }> = []
    for (const base of [0, 137, 274, 91, 182]) {
      for (const off of [-4.5, -1, 0, 1, 4.5, 6, 80.5]) {
        probes.push({ x: base + off, y: base + off })
        probes.push({ x: base + off - 75, y: base + off - 20 })
      }
    }
    for (const p of probes) {
      expect(session.move(p)).toEqual(flow.getSnapLines('n0', p))
    }
    flow.dispose()
  })

  it('move() never rescans the graph (zero nodes.peek per move)', () => {
    const flow = grid(50)
    const session = flow._createSnapSession('n0')!
    const orig = flow.nodes.peek
    let peeks = 0
    ;(flow.nodes as { peek: () => unknown }).peek = () => {
      peeks++
      return orig.call(flow.nodes)
    }
    try {
      for (let i = 0; i < 50; i++) session.move({ x: i * 3, y: i * 2 })
    } finally {
      ;(flow.nodes as { peek: () => unknown }).peek = orig
    }
    expect(peeks).toBe(0)
    flow.dispose()
  })

  it('excludes co-dragged nodes from the candidate set (multi-drag)', () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 300, y: 0 }, data: {} },
        { id: 'c', position: { x: 600, y: 600 }, data: {} },
      ],
    })
    // 'b' is co-dragged → not a candidate; only 'c' can produce guides.
    const session = flow._createSnapSession('a', new Set(['a', 'b']))!
    // At x=301 the primary would snap to b's left edge (300) if b were a
    // candidate — it must NOT.
    const nearB = session.move({ x: 301, y: 250 })
    expect(nearB.x).toBeNull()
    expect(nearB.snappedPosition.x).toBe(301)
    // c still produces guides (drag left edge aligns with c's edges/center —
    // both nodes are 150 wide, so all three candidate targets resolve to 600;
    // last match wins, so the reported guide LINE is c's right edge at 750).
    const nearC = session.move({ x: 601, y: 250 })
    expect(nearC.x).not.toBeNull()
    expect(nearC.snappedPosition.x).toBe(600)
    flow.dispose()
  })

  it('respects a custom threshold', () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 500, y: 500 }, data: {} },
      ],
    })
    const tight = flow._createSnapSession('a', undefined, 1)!
    expect(tight.move({ x: 503, y: 100 }).x).toBeNull()
    expect(tight.move({ x: 503, y: 100 }).snappedPosition.x).toBe(503)
    const loose = flow._createSnapSession('a', undefined, 10)!
    expect(loose.move({ x: 503, y: 100 }).x).not.toBeNull()
    expect(loose.move({ x: 503, y: 100 }).snappedPosition.x).toBe(500)
    flow.dispose()
  })

  it('returns null for an unknown drag node', () => {
    const flow = grid(3)
    expect(flow._createSnapSession('missing')).toBeNull()
    flow.dispose()
  })

  it('re-resolves the DRAG node dims per move (a measurement landing mid-drag applies)', () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 400, y: 0 }, data: {} },
      ],
    })
    const session = flow._createSnapSession('a')!
    // Default drag width 150: the right-edge candidate (b.right = 550) has
    // target 550 − 150 = 400, so x=449 is a MISS.
    expect(session.move({ x: 449, y: 100 }).x).toBeNull()
    // Measurement lands mid-drag: drag width 100 → that target becomes
    // 550 − 100 = 450, so x=449 now snaps.
    flow._setNodeMeasurement('a', 100, 40)
    expect(session.move({ x: 449, y: 100 }).snappedPosition.x).toBe(450)
    flow.dispose()
  })
})
