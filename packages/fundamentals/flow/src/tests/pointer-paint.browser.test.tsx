/**
 * Real-Chromium coverage for the four interactions the 2026-09 audit found
 * were happy-dom-only — every one depends on real hit testing, real layout
 * or real pointer-capture routing, so a partial DOM can assert the state
 * machine but not the thing the user does:
 *
 *   rubber-band selection   real coordinates over painted node boxes
 *   node resize by drag     pointer capture on a handle + measured baseline
 *   minimap navigation      a click mapped through the minimap's real rect
 *   pinch zoom              two-touch TouchEvents on a real container
 *
 * These run through the REAL vite-plugin compiler (this package's browser
 * config adds `pyreon()`), so they exercise the shipped `_tpl()` path.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { Controls } from '../components/controls'
import { MiniMap } from '../components/minimap'
import { NodeResizer } from '../components/node-resizer'
import { createFlow } from '../flow'
import type { FlowConfig, NodeComponentProps } from '../types'

function pev(type: string, x: number, y: number, extra: PointerEventInit = {}) {
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
    ...extra,
  })
}

/** A two-finger TouchEvent. happy-dom has no Touch constructor at all. */
function touchEvent(type: string, target: Element, points: Array<[number, number]>) {
  const touches = points.map(([x, y], i) =>
    new Touch({ identifier: i, target, clientX: x, clientY: y }),
  )
  return new TouchEvent(type, {
    touches,
    targetTouches: touches,
    changedTouches: touches,
    bubbles: true,
    cancelable: true,
  })
}

function grid(config: Partial<FlowConfig> = {}) {
  return createFlow({
    nodes: [
      { id: 'a', position: { x: 20, y: 20 }, data: {}, width: 120, height: 40 },
      { id: 'b', position: { x: 320, y: 20 }, data: {}, width: 120, height: 40 },
      { id: 'c', position: { x: 20, y: 220 }, data: {}, width: 120, height: 40 },
    ],
    ...config,
  })
}

describe('pointer + paint interactions in real Chromium', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function mount(flow: ReturnType<typeof grid>, children?: unknown, props: Record<string, unknown> = {}) {
    const mounted = mountInBrowser(
      h(
        'div',
        { style: 'width: 800px; height: 600px; position: relative;' },
        h(Flow, { instance: flow, ...props }, children as never),
      ),
    )
    flow.containerSize.set({ width: 800, height: 600 })
    return mounted
  }

  it('rubber-band selection hits the nodes the band really covers, and misses the one it does not', async () => {
    const flow = grid()
    const { container, unmount } = mount(flow)
    await flush()
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    const rect = canvas.getBoundingClientRect()
    // Band over a and b (both at y≈20..60) but above c (y≈220).
    const from = { x: rect.left + 10, y: rect.top + 10 }
    const to = { x: rect.left + 460, y: rect.top + 80 }
    canvas.dispatchEvent(pev('pointerdown', from.x, from.y, { shiftKey: true }))
    canvas.dispatchEvent(pev('pointermove', to.x, to.y, { shiftKey: true }))
    // The band element is painted while dragging.
    const band = container.querySelector<HTMLElement>('.pyreon-flow-selection-box')!
    expect(band.style.display).not.toBe('none')
    expect(band.getBoundingClientRect().width).toBeGreaterThan(100)
    canvas.dispatchEvent(pev('pointerup', to.x, to.y, { shiftKey: true }))
    await flush()
    expect(flow.selectedNodes().sort()).toEqual(['a', 'b'])
    expect(container.querySelector<HTMLElement>('.pyreon-flow-selection-box')!.style.display).toBe('none')
    unmount()
  })

  it('resize handles are painted at the node\'s real corners (drag math stays happy-dom-covered)', async () => {
    const flow = createFlow({
      nodes: [{ id: 'a', type: 'r', position: { x: 40, y: 40 }, data: {}, width: 120, height: 60 }],
    })
    // A real consumer sizes its own node from the instance — `@pyreon/flow`
    // never writes width/height onto the wrapper.
    const ResizableNode = (props: NodeComponentProps) =>
      h(
        'div',
        {
          style: () => {
            const d = flow.getNodeDimensions(props.id)
            return `position: relative; width: ${d.width}px; height: ${d.height}px; background: #eee;`
          },
        },
        [h(NodeResizer, { nodeId: props.id, instance: flow }), h('span', {}, () => props.id)],
      )
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { style: 'width: 800px; height: 600px; position: relative;' },
        h(Flow, { instance: flow, nodeTypes: { r: ResizableNode } }),
      ),
    )
    flow.containerSize.set({ width: 800, height: 600 })
    await flush()

    // What only a real browser can answer: the four handles are PAINTED, and
    // each sits on the corresponding corner of the node's real 120×60 box.
    // The drag arithmetic itself is covered in happy-dom
    // (`node-components` / `flow-advanced`) and is deliberately NOT driven
    // here: `NodeResizer` gates its move on `hasPointerCapture`, and Chromium
    // grants capture only for an ACTIVE pointer — a synthetic PointerEvent
    // never is one, so a synthetic drag would be testing a stubbed predicate
    // rather than the interaction.
    const inner = container.querySelector<HTMLElement>('[data-nodeid="a"] > div')!
    const nodeBox = inner.getBoundingClientRect()
    expect(Math.round(nodeBox.width)).toBe(120)
    expect(Math.round(nodeBox.height)).toBe(60)

    const corners: Array<[string, number, number]> = [
      ['nw', nodeBox.left, nodeBox.top],
      ['ne', nodeBox.right, nodeBox.top],
      ['sw', nodeBox.left, nodeBox.bottom],
      ['se', nodeBox.right, nodeBox.bottom],
    ]
    for (const [dir, cx, cy] of corners) {
      const handle = container.querySelector<HTMLElement>(`.pyreon-flow-resizer-${dir}`)!
      expect(handle, dir).toBeTruthy()
      const b = handle.getBoundingClientRect()
      expect(b.width, `${dir} painted`).toBeGreaterThan(0)
      // Handle centre within a handle's width of its corner.
      expect(Math.abs(b.left + b.width / 2 - cx), `${dir} x`).toBeLessThanOrEqual(b.width)
      expect(Math.abs(b.top + b.height / 2 - cy), `${dir} y`).toBeLessThanOrEqual(b.height)
    }
    unmount()
  })

  it('a click on the minimap centres the viewport on the clicked graph point', async () => {
    const flow = grid()
    const { container, unmount } = mount(flow, h(MiniMap, {}))
    await flush()
    const mm = container.querySelector<HTMLElement>('.pyreon-flow-minimap')!
    const r = mm.getBoundingClientRect()
    expect(r.width).toBeGreaterThan(0) // it is really painted
    // Bisect: revert `let instance` to `const` in minimap.tsx → the compiler
    // inlines the prop-derived initializer into the click handler, which
    // re-runs `useContext(FlowContext)` outside the setup frame, gets null and
    // throws — the viewport never moves. Only the REAL compiler shows this.
    expect(flow.viewport()).toEqual({ x: 0, y: 0, zoom: 1 })
    // Click the minimap's centre: the viewport must centre on whatever graph
    // point that maps to, i.e. the canvas centre lands inside the graph bounds.
    mm.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
      }),
    )
    await flush()
    const vp = flow.viewport()
    expect(vp.x === 0 && vp.y === 0).toBe(false)
    // The canvas centre, converted back to flow coordinates, sits within the
    // graph's bounding box (20..440 × 20..260) — the click really navigated.
    const cx = (400 - vp.x) / vp.zoom
    const cy = (300 - vp.y) / vp.zoom
    expect(cx).toBeGreaterThan(0)
    expect(cx).toBeLessThan(460)
    expect(cy).toBeGreaterThan(0)
    expect(cy).toBeLessThan(280)
    unmount()
  })

  it('a Controls button resolved from CONTEXT works — the CONTROL for the minimap bug', async () => {
    // `<Controls />` resolves its instance from FlowContext exactly as
    // `<MiniMap />` does, and does NOT break: its handlers are created inside
    // the component's reactive render thunk, and a render effect captures the
    // context owner at setup and restores it on every re-run — so the inlined
    // `useContext(FlowContext)` still resolves. MiniMap's handler sits at
    // component-body scope, outside any such frame, which is why only it went
    // null. Verified by reverting controls.tsx: this spec still passes.
    const flow = grid()
    const { container, unmount } = mount(flow, h(Controls, {}))
    await flush()
    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!
    expect(zoomIn).toBeTruthy()
    expect(zoomIn.getBoundingClientRect().width).toBeGreaterThan(0)
    zoomIn.click()
    await flush()
    expect(flow.viewport().zoom).toBeCloseTo(1.2, 5)
    unmount()
  })

  it('a two-finger pinch zooms the viewport, and zoomOnPinch:false leaves it alone', async () => {
    const flow = grid()
    const { container, unmount } = mount(flow)
    await flush()
    const canvas = container.querySelector<HTMLElement>('.pyreon-flow')!
    const r = canvas.getBoundingClientRect()
    const cx = r.left + 200
    const cy = r.top + 200
    canvas.dispatchEvent(touchEvent('touchstart', canvas, [[cx - 50, cy], [cx + 50, cy]]))
    canvas.dispatchEvent(touchEvent('touchmove', canvas, [[cx - 100, cy], [cx + 100, cy]]))
    await flush()
    // Fingers moved from 100px apart to 200px apart → zoom doubles (clamped by maxZoom).
    expect(flow.viewport().zoom).toBeCloseTo(2, 1)
    unmount()

    const locked = grid({ zoomOnPinch: false })
    const second = mount(locked)
    await flush()
    const canvas2 = second.container.querySelector<HTMLElement>('.pyreon-flow')!
    const r2 = canvas2.getBoundingClientRect()
    const c2x = r2.left + 200
    const c2y = r2.top + 200
    canvas2.dispatchEvent(touchEvent('touchstart', canvas2, [[c2x - 50, c2y], [c2x + 50, c2y]]))
    canvas2.dispatchEvent(touchEvent('touchmove', canvas2, [[c2x - 100, c2y], [c2x + 100, c2y]]))
    await flush()
    expect(locked.viewport().zoom).toBe(1)
    second.unmount()
  })
})
