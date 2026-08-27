import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlowNode } from '../types'

/**
 * The non-animated layout branch applies engine positions to nodes. It used
 * `positions.find((p) => p.id === node.id)` inside `nds.map(...)` — O(nodes²).
 * The animated branch already indexed positions into a Map; this pins that the
 * non-animated branch now does too (O(n)). Bisect: the old find-per-node form
 * calls `Array.prototype.find` N times; the indexed form calls it 0.
 */
describe('flow layout — indexed (O(n)) non-animated position application', () => {
  afterEach(() => vi.restoreAllMocks())

  it('applies positions without a find-per-node scan', async () => {
    vi.resetModules()
    const N = 30
    const nodes: FlowNode[] = Array.from({ length: N }, (_, i) => ({
      id: `n${i}`,
      position: { x: 0, y: 0 },
      data: {},
    })) as FlowNode[]
    vi.doMock('../layout', () => ({
      computeLayout: vi.fn(async (ns: FlowNode[]) =>
        ns.map((n, i) => ({ id: n.id, position: { x: i * 10, y: i * 5 } })),
      ),
    }))
    const { createFlow } = await import('../flow')
    const flow = createFlow({ nodes })

    const findSpy = vi.spyOn(Array.prototype, 'find')
    findSpy.mockClear()
    await flow.layout('layered', { animate: false })
    const findCalls = findSpy.mock.calls.length
    findSpy.mockRestore()

    expect(flow.getNode('n0')!.position).toEqual({ x: 0, y: 0 })
    expect(flow.getNode('n29')!.position).toEqual({ x: 290, y: 145 })
    // Indexed application does zero find-per-node; the old form did N.
    expect(findCalls).toBeLessThan(N)
  })
})
