// The context-menu and hover listeners, at the engine: the renderer calls
// `_emit.*`, and the context-menu emitters report whether anyone listened, so
// the browser's own menu is suppressed only when an app handles the event.
// The DOM wiring is covered in real Chromium (interaction-parity.browser);
// this locks the engine contract every renderer relies on.

import { describe, expect, it } from 'vitest'
import { createFlow } from '../flow'

const setup = () =>
  createFlow({
    nodes: [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 200, y: 0 }, data: {} },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b' }],
  })

describe('context-menu listeners', () => {
  it('report false with no listener, so the browser menu stays', () => {
    const flow = setup()
    expect(flow._emit.nodeContextMenu(flow.getNode('a')!)).toBe(false)
    expect(flow._emit.edgeContextMenu(flow.getEdge('ab')!)).toBe(false)
    expect(flow._emit.paneContextMenu({ x: 1, y: 2 })).toBe(false)
  })

  it('deliver the payload and report true while a listener exists', () => {
    const flow = setup()
    const seen: string[] = []
    const offNode = flow.onNodeContextMenu((n) => seen.push(`node ${n.id}`))
    const offEdge = flow.onEdgeContextMenu((e) => seen.push(`edge ${e.id}`))
    const offPane = flow.onPaneContextMenu((p) => seen.push(`pane ${p.x},${p.y}`))
    expect(flow._emit.nodeContextMenu(flow.getNode('a')!)).toBe(true)
    expect(flow._emit.edgeContextMenu(flow.getEdge('ab')!)).toBe(true)
    expect(flow._emit.paneContextMenu({ x: 1, y: 2 })).toBe(true)
    expect(seen).toEqual(['node a', 'edge ab', 'pane 1,2'])
    offNode()
    offEdge()
    offPane()
    expect(flow._emit.nodeContextMenu(flow.getNode('a')!)).toBe(false)
    expect(flow._emit.edgeContextMenu(flow.getEdge('ab')!)).toBe(false)
    expect(flow._emit.paneContextMenu({ x: 1, y: 2 })).toBe(false)
    expect(seen).toHaveLength(3)
  })
})

describe('hover listeners', () => {
  it('deliver enter and leave for nodes and edges, and stop after unsubscribe', () => {
    const flow = setup()
    const seen: string[] = []
    const offs = [
      flow.onNodeMouseEnter((n) => seen.push(`enter ${n.id}`)),
      flow.onNodeMouseLeave((n) => seen.push(`leave ${n.id}`)),
      flow.onEdgeMouseEnter((e) => seen.push(`enter ${e.id}`)),
      flow.onEdgeMouseLeave((e) => seen.push(`leave ${e.id}`)),
    ]
    flow._emit.nodeMouseEnter(flow.getNode('b')!)
    flow._emit.nodeMouseLeave(flow.getNode('b')!)
    flow._emit.edgeMouseEnter(flow.getEdge('ab')!)
    flow._emit.edgeMouseLeave(flow.getEdge('ab')!)
    expect(seen).toEqual(['enter b', 'leave b', 'enter ab', 'leave ab'])
    for (const off of offs) off()
    flow._emit.nodeMouseEnter(flow.getNode('b')!)
    flow._emit.edgeMouseLeave(flow.getEdge('ab')!)
    expect(seen).toHaveLength(4)
  })

  it('dispose() clears every one of these listeners', () => {
    const flow = setup()
    let calls = 0
    flow.onNodeContextMenu(() => calls++)
    flow.onNodeMouseEnter(() => calls++)
    flow.onEdgeMouseLeave(() => calls++)
    flow.dispose()
    expect(flow._emit.nodeContextMenu(flow.getNode('a')!)).toBe(false)
    flow._emit.nodeMouseEnter(flow.getNode('a')!)
    flow._emit.edgeMouseLeave(flow.getEdge('ab')!)
    expect(calls).toBe(0)
  })
})
