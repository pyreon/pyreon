/**
 * Production invariants from the 2026-09 flow deep audit. Each spec names its
 * bisect: the source line that makes it pass, and the failure when reverted.
 */
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'

function two() {
  return createFlow({
    nodes: [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 200, y: 0 }, data: {} },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
  })
}

describe('flow invariants', () => {
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it('addNode with a duplicate id is IGNORED and warns naming the id', () => {
    // Bisect: remove the `nodeMap.peek().has(node.id)` guard in flow.ts:addNode
    // → nodes() has 3 entries (two "a") and no warning; this fails.
    const flow = two()
    flow.addNode({ id: 'a', position: { x: 999, y: 999 }, data: { dup: true } })
    expect(flow.nodes()).toHaveLength(2)
    expect(flow.getNode('a')?.position).toEqual({ x: 0, y: 0 })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('addNode: a node with id "a" already exists')
    flow.dispose()
  })

  it('addEdge with a missing endpoint keeps the edge but warns naming the missing node', () => {
    // Bisect: remove the `missing` check in flow.ts:addEdge → no warning; fails.
    const flow = two()
    flow.addEdge({ id: 'e2', source: 'a', target: 'ghost' })
    expect(flow.edges()).toHaveLength(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('"ghost"')
    expect(String(warn.mock.calls[0]![0])).toContain('addEdge("e2")')
    flow.dispose()
  })

  it('dispose() releases the undo/redo snapshots', () => {
    // Bisect: drop `undoStack.length = 0 / redoStack.length = 0` from
    // flow.ts:dispose → canUndo() stays true after dispose; fails.
    const flow = two()
    flow.pushHistory()
    flow.updateNode('a', { position: { x: 10, y: 10 } })
    flow.dispose()
    flow.undo()
    // With the stack released, undo has nothing to restore.
    expect(flow.getNode('a')?.position).toEqual({ x: 10, y: 10 })
    flow.redo()
    expect(flow.getNode('a')?.position).toEqual({ x: 10, y: 10 })
  })

  it('<Flow> warns ONCE per unknown nodeTypes key and renders the default node', () => {
    // Bisect: remove the `warnedNodeTypes` block in flow-component.tsx NodeLayer
    // → zero warnings; fails.
    const flow = createFlow({
      nodes: [
        { id: 'a', type: 'nope', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', type: 'nope', position: { x: 100, y: 0 }, data: {} },
      ],
    })
    const { container, cleanup } = mountReactive(h(Flow, { instance: flow }))
    expect(container.querySelectorAll('.pyreon-flow-node')).toHaveLength(2)
    const hits = warn.mock.calls.filter((c: unknown[]) => String(c[0]).includes('nodeTypes has no such key'))
    expect(hits).toHaveLength(1)
    expect(String(hits[0]![0])).toContain('"nope"')
    cleanup()
    flow.dispose()
  })

  it('the shared node ResizeObserver is disconnected when the last node unmounts', () => {
    // Bisect: drop the `measureCallbacks.size === 0` disconnect in
    // flow-component.tsx:unobserveNode → disconnects stays 0 after the last
    // node leaves; fails.
    const OrigRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    let disconnects = 0
    class CountingRO {
      constructor(_cb: unknown) {}
      observe() {}
      unobserve() {}
      disconnect() {
        disconnects++
      }
    }
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = CountingRO
    try {
      const flow = two()
      const { cleanup } = mountReactive(h(Flow, { instance: flow }))
      expect(disconnects).toBe(0)
      flow.removeNode('a')
      expect(disconnects).toBe(0) // one node still observed
      flow.removeNode('b')
      expect(disconnects).toBe(1) // the shared observer released
      cleanup()
      flow.dispose()
    } finally {
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = OrigRO
    }
  })

  it('renderToString(<Flow>) produces nodes at their positions and an edge path (SSR smoke)', async () => {
    // Guards the "no browser API at setup" contract documented under
    // "SSR and hydration" in docs/flow.md. happy-dom defines window, so this
    // asserts the RENDER path, not a Node-only environment; the load-bearing
    // half is that nothing in setup throws and the markup carries real
    // geometry rather than an empty shell.
    const flow = two()
    const html = await renderToString(h(Flow, { instance: flow }))
    expect(typeof html).toBe('string')
    expect(html).toContain('pyreon-flow-node')
    expect(html).toContain('translate(0px, 0px)')
    expect(html).toContain('translate(200px, 0px)')
    expect(html).toContain('pyreon-flow-edges')
    expect(html).toMatch(/<path d="M150,20 C[^"]+200,20"/)
    flow.dispose()
  })
})
