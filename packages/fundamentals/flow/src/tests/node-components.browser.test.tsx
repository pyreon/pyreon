/**
 * Real-Chromium regression tests for @pyreon/flow component bugs found in the
 * round-2 review. Each maps to a fix:
 *   1. <Flow> injects its instance into MiniMap / Controls via context — the
 *      documented `<Flow instance={flow}><MiniMap/></Flow>` pattern (no
 *      instance on the child) previously rendered NOTHING.
 *   2. NodeToolbar's show-on-select is reactive — `selected` accepts an
 *      accessor and the toolbar mounts / unmounts as selection flips (was a
 *      static `return null` at setup → never reacted).
 *   3. NodeResizer handle offsets scale with `handleSize` (was hardcoded -4px).
 *   4. Drag-to-connect creates an edge — pointerup hit-tests the cursor
 *      position (e.target is the capturing container under pointer capture).
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { Controls } from '../components/controls'
import { Flow } from '../components/flow-component'
import { Handle } from '../components/handle'
import { MiniMap } from '../components/minimap'
import { NodeResizer } from '../components/node-resizer'
import { NodeToolbar } from '../components/node-toolbar'
import { createFlow } from '../flow'
import { type NodeComponentProps, Position } from '../types'

describe('flow node components (round-2 bug fixes)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('<Flow> injects its instance into MiniMap + Controls via context (no explicit instance)', async () => {
    const flow = createFlow({
      nodes: [{ id: 'a', position: { x: 10, y: 10 }, data: {}, width: 100, height: 40 }],
      edges: [],
    })
    // NOTE: neither child is passed `instance` — exactly the documented shape.
    const { container, unmount } = mountInBrowser(
      h(Flow, { instance: flow }, [h(MiniMap, {}), h(Controls, {})]),
    )
    flow.containerSize.set({ width: 800, height: 600 })
    await flush()

    expect(container.querySelector('.pyreon-flow-minimap')).toBeTruthy()
    expect(container.querySelector('.pyreon-flow-controls')).toBeTruthy()
    // The fit-view control button proves Controls rendered its body, not null.
    expect(container.querySelector('button[title="Zoom in"]')).toBeTruthy()
    unmount()
  })

  it('NodeToolbar shows/hides reactively as the selected accessor flips', async () => {
    const selected = signal(false)
    const { container, unmount } = mountInBrowser(
      h(NodeToolbar, { selected: () => selected() }, h('button', { type: 'button' }, 'Delete')),
    )
    await flush()
    // Hidden when not selected (showOnSelect defaults true).
    expect(container.querySelector('.pyreon-flow-node-toolbar')).toBeNull()

    selected.set(true)
    await flush()
    expect(container.querySelector('.pyreon-flow-node-toolbar')).toBeTruthy()
    expect(container.querySelector('.pyreon-flow-node-toolbar button')?.textContent).toBe('Delete')

    selected.set(false)
    await flush()
    expect(container.querySelector('.pyreon-flow-node-toolbar')).toBeNull()
    unmount()
  })

  it('NodeResizer handle offsets scale with handleSize (centered on the corner)', async () => {
    const flow = createFlow({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {}, width: 120, height: 60 }],
      edges: [],
    })
    const { container, unmount } = mountInBrowser(
      h(NodeResizer, { nodeId: 'a', instance: flow, handleSize: 16 }),
    )
    await flush()
    const nw = container.querySelector('.pyreon-flow-resizer-nw') as HTMLElement | null
    expect(nw).toBeTruthy()
    // Half of handleSize=16 → -8px so the 16px handle is centered on the corner.
    expect(nw!.style.top).toBe('-8px')
    expect(nw!.style.left).toBe('-8px')
    unmount()
  })

  it('NodeResizer default handleSize (8) offsets by -4px', async () => {
    const flow = createFlow({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {}, width: 120, height: 60 }],
      edges: [],
    })
    const { container, unmount } = mountInBrowser(h(NodeResizer, { nodeId: 'a', instance: flow }))
    await flush()
    const se = container.querySelector('.pyreon-flow-resizer-se') as HTMLElement | null
    expect(se!.style.bottom).toBe('-4px')
    expect(se!.style.right).toBe('-4px')
    unmount()
  })

  // ── Drag-to-connect ──────────────────────────────────────────────────────

  function HandledNode(props: NodeComponentProps) {
    return h(
      'div',
      { style: 'width: 100px; height: 40px; position: relative; background: #eee;' },
      [
        h(Handle, { type: 'target', position: Position.Left }),
        'n',
        h(Handle, { type: 'source', position: Position.Right }),
      ],
    )
  }

  it('drag-to-connect: dragging from a source handle onto a target handle creates an edge', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', type: 'h', position: { x: 0, y: 0 }, data: {}, width: 100, height: 40 },
        { id: 'b', type: 'h', position: { x: 300, y: 0 }, data: {}, width: 100, height: 40 },
      ],
      edges: [],
    })
    // Sized wrapper so the flow root (width/height 100%, overflow: hidden)
    // actually paints both nodes — otherwise the far node is clipped and
    // elementFromPoint can't hit its handle.
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { style: 'width: 800px; height: 600px; position: relative;' },
        h(Flow, { instance: flow, nodeTypes: { h: HandledNode } }),
      ),
    )
    flow.containerSize.set({ width: 800, height: 600 })
    await flush()

    const sourceHandle = container.querySelector(
      '[data-nodeid="a"] .pyreon-flow-handle-source',
    ) as HTMLElement
    const targetHandle = container.querySelector(
      '[data-nodeid="b"] .pyreon-flow-handle-target',
    ) as HTMLElement
    expect(sourceHandle).toBeTruthy()
    expect(targetHandle).toBeTruthy()

    const root = container.querySelector('.pyreon-flow') as HTMLElement
    const tRect = targetHandle.getBoundingClientRect()
    const tx = tRect.left + tRect.width / 2
    const ty = tRect.top + tRect.height / 2
    const ev = (
      target: Element,
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      x: number,
      y: number,
    ) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'mouse',
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          bubbles: true,
          cancelable: true,
        }),
      )

    expect(flow.edges().length).toBe(0)
    // Start the connection on the source handle, drag over to the target
    // handle's center, release. Pointer capture routes events to the container,
    // so the drop target is resolved via document.elementFromPoint(clientX,Y).
    // Start the connection on the source handle, drag over to the target
    // handle's center, release. Pointer capture routes events to the container,
    // so the drop target is resolved via document.elementFromPoint(clientX,Y).
    ev(sourceHandle, 'pointerdown', 50, 20)
    ev(root, 'pointermove', tx, ty)
    ev(root, 'pointerup', tx, ty)
    await flush()

    expect(flow.edges().length).toBe(1)
    expect(flow.edges()[0]!.source).toBe('a')
    expect(flow.edges()[0]!.target).toBe('b')
    unmount()
  })

  // ── Keyboard shortcuts vs editable node fields (round-3) ─────────────────

  function InputNode(_props: NodeComponentProps) {
    return h('div', { style: 'position: relative; padding: 8px;' }, [
      h('input', { 'data-testid': 'node-input', type: 'text' }),
    ])
  }

  it('keyboard shortcuts are suppressed while typing in an editable node field', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'k1', type: 'inp', position: { x: 20, y: 20 }, data: {}, width: 120, height: 40 },
      ],
      edges: [],
    })
    const { container, unmount } = mountInBrowser(
      h(Flow, { instance: flow, nodeTypes: { inp: InputNode } }),
    )
    flow.containerSize.set({ width: 800, height: 600 })
    await flush()
    flow.selectNode('k1')
    await flush()

    const input = container.querySelector('[data-testid="node-input"]') as HTMLInputElement
    const root = container.querySelector('.pyreon-flow') as HTMLElement
    expect(input).toBeTruthy()

    const key = (target: Element, k: string) =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
      )

    // Delete WHILE the node's input is focused → must NOT delete the node
    // (the browser deletes text instead). Pre-fix this deleted the node.
    input.focus()
    key(input, 'Delete')
    await flush()
    expect(flow.nodes().length).toBe(1)

    // Delete on the canvas (non-editable target) WITH the node selected →
    // deletes it. Proves the shortcut still works when not typing.
    key(root, 'Delete')
    await flush()
    expect(flow.nodes().length).toBe(0)
    unmount()
  })
})
