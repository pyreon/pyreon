/**
 * F6 memory ceilings — GC-observable, so the verdict does not depend on heap
 * sizes, allocator behaviour or machine load.
 *
 * Three contracts at graph scale:
 *
 *   1. A mounted 1,000-node canvas releases every node once it is unmounted
 *      and its instance disposed. The per-node measurement map, the per-id
 *      computed caches and the rendered DOM are all module- or instance-level
 *      structures that could pin a node for the page's lifetime.
 *   2. Nodes REMOVED from a live flow are released while the flow stays
 *      mounted. With history off nothing is meant to keep them, so anything
 *      still holding them is a leak rather than a feature.
 *   3. History is the one deliberate retainer: with it on, an undo must still
 *      be able to bring a removed node back.
 *
 * Needs `--expose-gc` (wired in this package's vitest config) — without it the
 * GC specs SKIP loudly rather than passing vacuously.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'

const hasGc = typeof globalThis.gc === 'function'

async function collectGarbage(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    globalThis.gc!()
    await new Promise((r) => setTimeout(r, 0))
  }
}

interface Row {
  label: string
  payload: { index: number }
}

function grid(count: number, autoHistory = false) {
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    position: { x: (i % 40) * 200, y: Math.floor(i / 40) * 100 },
    data: { label: `N${i}`, payload: { index: i } } as Row,
  }))
  const edges = Array.from({ length: count - 1 }, (_, i) => ({
    id: `e${i}`,
    source: `n${i}`,
    target: `n${i + 1}`,
  }))
  return createFlow<Row>({ nodes, edges, onlyRenderVisibleElements: true, autoHistory })
}

describe('flow scale memory ceilings', () => {
  it('the GC harness is present, so the specs below run rather than skip', () => {
    // A skipped memory spec must never read as coverage.
    expect(hasGc, 'run with --expose-gc (see vitest.config.ts)').toBe(true)
  })

  it.runIf(hasGc)('a mounted 1,000-node canvas releases every node after unmount + dispose', async () => {
    // Everything that could hold the graph — the instance, the vnode, the mount
    // handle — lives inside this function, so after it returns only the
    // WeakRefs are left in the test's own scope.
    const probe = (): { refs: WeakRef<object>[]; instanceRef: WeakRef<object> } => {
      const flow = grid(1000)
      const refs = flow.nodes.peek().map((n) => new WeakRef(n.data.payload))
      const { cleanup } = mountReactive(h(Flow as never, { instance: flow }))
      // One real update through the mounted tree, so the per-id caches are warm.
      flow.updateNodePosition('n0', { x: 5, y: 5 })
      cleanup()
      flow.dispose()
      return { refs, instanceRef: new WeakRef(flow) }
    }
    const { refs, instanceRef } = probe()
    await collectGarbage()
    const alive = refs.filter((r) => r.deref() !== undefined).length
    expect(alive, `${alive} of 1000 node payloads still reachable`).toBe(0)
    expect(instanceRef.deref(), 'the flow instance is still reachable').toBeUndefined()
  })

  it.runIf(hasGc)('nodes removed from a live flow are released while it stays mounted', async () => {
    const flow = grid(1000)
    const { cleanup } = mountReactive(h(Flow as never, { instance: flow }))
    try {
      const removed = flow.nodes.peek().slice(500)
      const refs = removed.map((n) => new WeakRef(n.data.payload))
      flow.removeNodes(removed.map((n) => n.id))
      removed.length = 0
      await collectGarbage()
      expect(flow.nodes.peek()).toHaveLength(500)
      const alive = refs.filter((r) => r.deref() !== undefined).length
      expect(alive, `${alive} of 500 removed payloads still reachable`).toBe(0)
    } finally {
      cleanup()
      flow.dispose()
    }
  })

  it('with history on, an undo restores a removed node from the retained snapshot', () => {
    const flow = grid(50, true)
    const { cleanup } = mountReactive(h(Flow as never, { instance: flow }))
    try {
      flow.removeNodes(['n10'])
      expect(flow.getNode('n10')).toBeUndefined()
      flow.undo()
      expect(flow.getNode('n10')?.data.payload.index).toBe(10)
    } finally {
      cleanup()
      flow.dispose()
    }
  })
})
