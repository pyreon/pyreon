/**
 * F1: createFlow generic over TData
 *
 * Proves that consumer-defined node data types thread end-to-end
 * through createFlow without requiring an `[key: string]: unknown`
 * index signature on the data shape. Before the fix, FlowConfig and
 * FlowInstance defaulted `data` to `Record<string, unknown>` and
 * createFlow was non-generic, so consumers had to widen their data
 * type at the boundary — destroying type narrowing on read sites.
 *
 * These tests are mostly type-level — they verify that the generic
 * threads through the API correctly. Runtime assertions exist to
 * make sure the test code actually executes (vitest needs at least
 * one assertion per test).
 */
import { describe, expect, it } from 'vitest'
import { createFlow } from '../flow'
import type { FlowNode } from '../types'

interface WorkflowData {
  kind: 'trigger' | 'filter' | 'transform' | 'notify'
  label: string
  config?: string
  // Note: NO `[key: string]: unknown` index signature.
}

describe('createFlow generic over TData (F1)', () => {
  it('accepts a typed FlowConfig without an index signature on TData', () => {
    const flow = createFlow<WorkflowData>({
      nodes: [
        {
          id: 'trigger-1',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            kind: 'trigger',
            label: 'Webhook',
          },
        },
      ],
      edges: [],
    })

    expect(flow.nodes()).toHaveLength(1)
    const first = flow.nodes()[0]
    expect(first?.data.kind).toBe('trigger')
    expect(first?.data.label).toBe('Webhook')
  })

  it('threads TData through addNode / getNode / updateNode', () => {
    const flow = createFlow<WorkflowData>()

    flow.addNode({
      id: 'filter-1',
      type: 'workflow',
      position: { x: 100, y: 100 },
      data: { kind: 'filter', label: 'Errors only', config: 'severity = error' },
    })

    const node = flow.getNode('filter-1')
    expect(node).toBeDefined()
    // TData narrowing: kind is the typed union, not `unknown`.
    expect(node?.data.kind).toBe('filter')
    expect(node?.data.config).toBe('severity = error')

    flow.updateNode('filter-1', {
      data: { kind: 'filter', label: 'All errors', config: 'severity in [error, fatal]' },
    })
    expect(flow.getNode('filter-1')?.data.label).toBe('All errors')
  })

  it('threads TData through findNodes / searchNodes', () => {
    const flow = createFlow<WorkflowData>({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Webhook' } },
        { id: 'b', position: { x: 0, y: 0 }, data: { kind: 'filter', label: 'Errors' } },
      ],
    })

    const triggers = flow.findNodes((n) => n.data.kind === 'trigger')
    expect(triggers).toHaveLength(1)
    expect(triggers[0]?.id).toBe('a')

    const found = flow.searchNodes('webhook')
    expect(found).toHaveLength(1)
    expect(found[0]?.data.kind).toBe('trigger')
  })

  it('threads TData through toJSON / fromJSON round-trip', () => {
    const flow = createFlow<WorkflowData>({
      nodes: [
        {
          id: 'a',
          position: { x: 1, y: 2 },
          data: { kind: 'transform', label: 'Enrich', config: 'attach metadata' },
        },
      ],
    })

    const json = flow.toJSON()
    expect(json.nodes).toHaveLength(1)
    expect(json.nodes[0]?.data.kind).toBe('transform')

    const flow2 = createFlow<WorkflowData>()
    flow2.fromJSON(json)
    expect(flow2.nodes()).toHaveLength(1)
    expect(flow2.nodes()[0]?.data.label).toBe('Enrich')
  })

  it('listener callbacks receive typed FlowNode<TData>', () => {
    const flow = createFlow<WorkflowData>()
    let captured: FlowNode<WorkflowData> | null = null

    const unsub = flow.onNodeClick((node) => {
      captured = node
    })

    flow.addNode({
      id: 'a',
      position: { x: 0, y: 0 },
      data: { kind: 'notify', label: 'PagerDuty' },
    })

    // Trigger via internal emitter (the public click path goes
    // through the Flow component's pointer events; we test the
    // listener-typing contract by directly invoking the emit
    // function the runtime uses).
    const node = flow.getNode('a')!
    flow._emit.nodeClick(node)

    expect(captured).not.toBeNull()
    expect((captured as unknown as FlowNode<WorkflowData>).data.kind).toBe('notify')

    unsub()
  })

  it('still works without an explicit generic (defaults to Record<string, unknown>)', () => {
    const flow = createFlow({
      nodes: [{ id: 'x', position: { x: 0, y: 0 }, data: { foo: 'bar' } }],
    })
    expect(flow.nodes()[0]?.data.foo).toBe('bar')
  })
})
