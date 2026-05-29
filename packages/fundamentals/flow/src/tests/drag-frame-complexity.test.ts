/**
 * Drag-frame accessor complexity — locks the documented "O(1) per frame"
 * contract for node + edge accessors during a drag.
 *
 * A node drag writes the WHOLE `nodes()` array every pointermove frame
 * (flow-component.tsx onPointerMove → `nodes.update(nds => nds.map(...))`),
 * which notifies EVERY node + edge style/class/path `_bind` thunk — even
 * for a single-node drag, because they all subscribe to the one `nodes()`
 * signal. Before the `nodeMap`/`edgeMap` fix, each thunk did an O(N)/O(E)
 * `Array.prototype.find` → O(N²) (nodes) + O(E×(2N+E)) (edges) PER FRAME,
 * contradicting CLAUDE.md's "a 60fps drag in a 1000-node graph is O(1) per
 * frame" claim. The fix routes every accessor through the shared
 * `instance.nodeMap()`/`edgeMap()` computeds (O(1) `Map.get`), so a drag
 * frame does ZERO per-accessor finds — just one map rebuild (a `for` loop).
 *
 * This counts `Array.prototype.find` calls during ONE drag-frame
 * `nodes.set` and asserts it stays tiny and does NOT scale with N/E.
 * Bisect: revert the fix (accessors back to `.find`) → the count jumps to
 * ~2N + ~3E and both assertions fail.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'

function buildGraph(n: number, e: number) {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: 'n' + i,
    position: { x: i * 10, y: 0 },
    data: {},
  }))
  const edges = Array.from({ length: e }, (_, i) => ({
    id: 'e' + i,
    source: 'n' + i,
    target: 'n' + ((i + 1) % n),
  }))
  return createFlow({ nodes, edges })
}

// Move node n0 by writing a fresh array — exactly what the real
// onPointerMove drag handler does once per frame.
function dragFrame(flow: ReturnType<typeof buildGraph>) {
  flow.nodes.set(
    flow.nodes
      .peek()
      .map((n) =>
        n.id === 'n0'
          ? { ...n, position: { x: n.position.x + 1, y: n.position.y } }
          : n,
      ),
  )
}

function countFindsDuring(fn: () => void): number {
  const orig = Array.prototype.find
  let finds = 0
  // biome-ignore lint: intentional temporary instrumentation, restored in finally
  Array.prototype.find = function (this: unknown[], ...a: unknown[]) {
    finds++
    // @ts-expect-error spread to native find
    return orig.apply(this, a)
  }
  try {
    fn()
  } finally {
    Array.prototype.find = orig
  }
  return finds
}

describe('flow drag-frame accessor complexity (nodeMap/edgeMap)', () => {
  let cleanups: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanups) c()
    cleanups = []
  })

  it('a single drag frame does O(1)-per-accessor lookups, not O(N) finds', () => {
    const flow = buildGraph(60, 40)
    const { cleanup } = mountReactive(h(Flow as never, { instance: flow }))
    cleanups.push(cleanup)

    const finds = countFindsDuring(() => dragFrame(flow))

    // Post-fix: accessors use Map.get → ~0 finds from the flow layer.
    // Pre-fix: ~2×60 node finds + ~3×40 edge finds ≈ 240.
    expect(finds).toBeLessThan(30)
  })

  it('drag-frame find count does NOT scale with graph size (O(1)-per-accessor)', () => {
    const small = buildGraph(20, 15)
    const c1 = mountReactive(h(Flow as never, { instance: small }))
    cleanups.push(c1.cleanup)
    const findsSmall = countFindsDuring(() => dragFrame(small))

    const large = buildGraph(120, 90)
    const c2 = mountReactive(h(Flow as never, { instance: large }))
    cleanups.push(c2.cleanup)
    const findsLarge = countFindsDuring(() => dragFrame(large))

    // 6× the nodes / edges must NOT mean ~6× the finds. Pre-fix the ratio
    // tracks graph size (O(N) finds, each O(N)); post-fix both are ~0 so the
    // delta stays within a tiny constant regardless of size.
    expect(findsLarge - findsSmall).toBeLessThan(20)
  })
})
