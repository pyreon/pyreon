import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Controls } from '../components/controls'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'

// Real-Chromium regression suite for the "flow edges don't render / zoom does
// nothing" fixes. These three bugs are ALL layout / pointer-event behaviours
// that happy-dom cannot exercise (no layout, no real pointer routing), so they
// live here rather than in the node-env suites:
//
//  1. The EdgeLayer <svg> collapsed to 0×0 because the viewport div (its
//     containing block) is absolutely positioned + shrink-to-fit → 0 content
//     size. A zero-area svg viewport paints NONE of its content, so edges were
//     invisible even with correct geometry. Fix: size the viewport 100%.
//  2. Edge geometry used a 150×40 fallback for content-sized nodes (no explicit
//     width), so edges started ~70px off the node. Fix: measure the rendered
//     node and anchor to the real size.
//  3. The container pan handler `setPointerCapture`d on a pointerdown over the
//     Controls, swallowing the button's click → zoom/fit "did nothing". Fix:
//     bail the pan when the pointer lands on the flow's UI chrome.

const sized = (child: unknown) =>
  h('div', { style: 'width: 600px; height: 400px;' }, child as never)

describe('flow edge rendering + controls (real browser)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('gives the EdgeLayer svg a non-zero paintable viewport (regression: 0×0 svg)', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 20, y: 40 }, data: { label: 'A' } },
        { id: 'b', position: { x: 260, y: 160 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b' }],
    })
    const { container, unmount } = mountInBrowser(sized(h(Flow, { instance: flow })))
    await flush()

    const svg = container.querySelector('svg.pyreon-flow-edges') as SVGSVGElement
    expect(svg).toBeTruthy()
    const r = svg.getBoundingClientRect()
    // Before the fix this was 0×0 (svg not painted). The paths themselves exist
    // in the DOM either way, so a path COUNT can't catch this — the svg's box
    // is the load-bearing assertion.
    expect(r.width).toBeGreaterThan(0)
    expect(r.height).toBeGreaterThan(0)

    // Viewport opts out of pointer events so it can't swallow panel/pan clicks…
    const vp = container.querySelector('.pyreon-flow-viewport') as HTMLElement
    expect(getComputedStyle(vp).pointerEvents).toBe('none')
    // …and the node re-enables them so drag/select still works.
    const node = container.querySelector('.pyreon-flow-node') as HTMLElement
    expect(getComputedStyle(node).pointerEvents).toBe('auto')

    unmount()
  })

  it('measures content-sized nodes and anchors the edge to the real width', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: 'b', position: { x: 300, y: 0 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b' }],
    })
    const { container, unmount } = mountInBrowser(sized(h(Flow, { instance: flow })))
    await flush()

    const measured = flow.measurements().get('a')
    expect(measured).toBeDefined()
    // The DefaultNode is content-sized (~50–90px for "A"), i.e. NOT the 150
    // fallback the edge used before measurement existed.
    expect(measured!.width).toBeGreaterThan(0)
    expect(measured!.width).toBeLessThan(150)

    // The edge path starts at the source node's real right edge (measured
    // width), not at x = 0 + 150. Read the path `d`'s first moveto x.
    const path = container.querySelector('svg.pyreon-flow-edges path') as SVGPathElement
    const startX = Number.parseFloat((path.getAttribute('d') ?? '').match(/^M([\d.]+)/)?.[1] ?? '0')
    expect(startX).toBeCloseTo(measured!.width, 0)
    expect(startX).toBeLessThan(150)

    unmount()
  })

  it('zoom-in via Controls is not swallowed by the pan handler (regression: dead zoom)', async () => {
    const flow = createFlow({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }],
      edges: [],
    })
    const { container, unmount } = mountInBrowser(
      sized(h(Flow, { instance: flow }, h(Controls, { position: 'bottom-left' }))),
    )
    await flush()

    const before = flow.viewport().zoom
    const btn = container.querySelector(
      '.pyreon-flow-controls button[title="Zoom in"]',
    ) as HTMLButtonElement
    expect(btn).toBeTruthy()

    // A pointerdown over the button must NOT start a container pan. Simulate the
    // pan-trigger sequence: pointerdown on the button, then a pointermove on the
    // container. With the bug, the pointerdown captured the pointer + set the pan
    // origin, so the pointermove would move the viewport (and the real click was
    // eaten). With the fix, the pan bails → the viewport stays put.
    const flowEl = container.querySelector('.pyreon-flow') as HTMLElement
    try {
      btn.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 30, clientY: 370 }),
      )
    } catch {
      // The broken path calls setPointerCapture on a synthetic pointer, which can
      // throw; it still set isPanning=true first, so the pan assertion below holds.
    }
    flowEl.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 200, clientY: 200 }),
    )
    await flush()
    const vpAfterMove = flow.viewport()
    expect(vpAfterMove.x).toBe(0)
    expect(vpAfterMove.y).toBe(0)

    // And the actual click fires zoomIn end-to-end.
    btn.click()
    await flush()
    expect(flow.viewport().zoom).toBeGreaterThan(before)

    unmount()
  })
})
