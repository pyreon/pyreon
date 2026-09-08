/**
 * Real-Chromium half of the interaction-parity suite: the invisible hit
 * width is only meaningful against real hit testing (`elementFromPoint`),
 * a reconnect drag needs real handle geometry, and shift+wheel needs a
 * WheelEvent that keeps its modifier.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { Handle } from '../components/handle'
import { createFlow } from '../flow'
import type { NodeComponentProps } from '../types'

function HandledNode(props: NodeComponentProps) {
  return h('div', { style: 'position: relative; width: 150px; height: 40px; background: #eee;' }, [
    h(Handle, { type: 'target', position: 'left' as never }),
    h('span', {}, () => props.id),
    h(Handle, { type: 'source', position: 'right' as never }),
  ])
}

function pev(type: string, x: number, y: number) {
  return new PointerEvent(type, {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    bubbles: true,
    cancelable: true,
  })
}

describe('flow interaction parity in real browser', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function setup(config: Record<string, unknown> = {}) {
    const flow = createFlow({
      nodes: [
        { id: 'a', type: 'h', position: { x: 20, y: 20 }, data: {} },
        { id: 'b', type: 'h', position: { x: 320, y: 20 }, data: {} },
        { id: 'c', type: 'h', position: { x: 320, y: 220 }, data: {} },
      ],
      edges: [{ id: 'ab', source: 'a', target: 'b', type: 'straight', sourceHandle: 'source', targetHandle: 'target' }],
      ...config,
    })
    const mounted = mountInBrowser(
      h(
        'div',
        { style: 'width: 800px; height: 600px; position: relative;' },
        h(Flow, { instance: flow, nodeTypes: { h: HandledNode } }),
      ),
    )
    flow.containerSize.set({ width: 800, height: 600 })
    return { flow, ...mounted }
  }

  it('a click 8px off a hairline edge lands on its interaction path and selects the edge', async () => {
    // Bisect: remove the interaction path → elementFromPoint returns the
    // canvas and the edge stays unselected.
    const { flow, container, unmount } = setup()
    await flush()
    const visible = container.querySelector<SVGPathElement>('svg.pyreon-flow-edges g > path')!
    const box = visible.getBoundingClientRect()
    const midX = box.left + box.width / 2
    const midY = box.top + box.height / 2
    const hit = document.elementFromPoint(midX, midY + 8)!
    expect(hit.classList.contains('pyreon-flow-edge-interaction')).toBe(true)
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: midX, clientY: midY + 8 }))
    expect(flow.selectedEdges()).toEqual(['ab'])
    unmount()
  })

  it('dragging the target updater onto another node handle reconnects the edge with real geometry', async () => {
    const { flow, container, unmount } = setup()
    await flush()
    flow.selectEdge('ab')
    await flush()
    const updater = container.querySelector<SVGCircleElement>('.pyreon-flow-edge-updater-target')!
    expect(updater).toBeTruthy()
    const u = updater.getBoundingClientRect()
    const cHandle = container.querySelector<HTMLElement>('[data-nodeid="c"] .pyreon-flow-handle-target')!
    const t = cHandle.getBoundingClientRect()
    const tx = t.left + t.width / 2
    const ty = t.top + t.height / 2
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    updater.dispatchEvent(pev('pointerdown', u.left + u.width / 2, u.top + u.height / 2))
    canvas.dispatchEvent(pev('pointermove', tx, ty))
    expect(container.querySelector('.pyreon-flow-connection-line')).toBeTruthy()
    canvas.dispatchEvent(pev('pointerup', tx, ty))
    await flush()
    expect(flow.getEdge('ab')).toMatchObject({ source: 'a', target: 'c', targetHandle: 'target' })
    expect(flow.edges()).toHaveLength(1)
    unmount()
  })

  it('shift+wheel pans horizontally under panOnScroll', async () => {
    const { flow, container, unmount } = setup({ panOnScroll: true, panOnScrollSpeed: 1 })
    await flush()
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 25, shiftKey: true, bubbles: true, cancelable: true }))
    expect(flow.viewport()).toEqual({ x: -25, y: 0, zoom: 1 })
    // ctrl+wheel keeps zooming under panOnScroll (zoomActivationKey).
    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: 0, clientY: 0, bubbles: true, cancelable: true }),
    )
    expect(flow.viewport().zoom).toBeCloseTo(1.1, 5)
    unmount()
  })
})
