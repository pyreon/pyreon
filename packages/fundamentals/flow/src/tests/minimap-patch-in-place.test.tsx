/**
 * P4 — the minimap patches in place; pan/zoom never remounts its SVG.
 *
 * The old MiniMap was ONE reactive accessor reading nodes() + measurements()
 * + viewport() + containerSize() at its top and returning the whole
 * `<div><svg>…` subtree — every pan/zoom frame re-created the full svg
 * (measured: ~306 element creations PER viewport write at 300 nodes). Now the
 * container/svg/rects are mounted statically (keyed `<For>` rows for node
 * rects) and only attr/style thunks re-run.
 *
 * The load-bearing assertions are ELEMENT IDENTITY + zero element creations
 * across viewport writes (the P0 viewport-div discipline — a value-only
 * assertion would pass against the remounting form too).
 *
 * Bisect: revert minimap.tsx to the single-accessor form → every identity
 * assertion here fails (fresh elements per write) and created-count is ≫ 0.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { MiniMap } from '../components/minimap'
import { createFlow } from '../flow'

function makeFlow() {
  return createFlow({
    nodes: [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 200, y: 100 }, data: {} },
      { id: 'c', position: { x: 100, y: 50 }, data: {} }, // interior — moving it keeps bounds
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
  })
}

describe('minimap patches in place (P4)', () => {
  let cleanups: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanups) c()
    cleanups = []
  })

  it('pan/zoom creates ZERO elements and preserves svg/rect identity', () => {
    const flow = makeFlow()
    const { container, cleanup } = mountReactive(
      h(Flow, { instance: flow }, h(MiniMap, {})),
    )
    cleanups.push(cleanup)

    const svgBefore = container.querySelector('.pyreon-flow-minimap svg')
    const vpRectBefore = container.querySelector('.pyreon-flow-minimap-viewport')
    const nodeRects = [...container.querySelectorAll('.pyreon-flow-minimap g rect')]
    expect(svgBefore).toBeTruthy()
    expect(vpRectBefore).toBeTruthy()
    expect(nodeRects).toHaveLength(3)

    const doc = document as unknown as {
      createElement: (...a: unknown[]) => Element
      createElementNS: (...a: unknown[]) => Element
    }
    const origCE = doc.createElement.bind(document)
    const origCENS = doc.createElementNS.bind(document)
    let created = 0
    doc.createElement = (...a: unknown[]) => {
      created++
      return origCE(...a)
    }
    doc.createElementNS = (...a: unknown[]) => {
      created++
      return origCENS(...a)
    }
    const xBefore = vpRectBefore!.getAttribute('x')
    try {
      for (let i = 1; i <= 20; i++) {
        flow.viewport.set({ x: i * 7, y: i * 3, zoom: 1 + i * 0.01 })
      }
    } finally {
      doc.createElement = origCE
      doc.createElementNS = origCENS
    }

    expect(created).toBe(0)
    expect(container.querySelector('.pyreon-flow-minimap svg')).toBe(svgBefore)
    expect(container.querySelector('.pyreon-flow-minimap-viewport')).toBe(vpRectBefore)
    expect([...container.querySelectorAll('.pyreon-flow-minimap g rect')]).toEqual(nodeRects)
    // …and the indicator actually MOVED (identity alone could pass a dead map).
    expect(vpRectBefore!.getAttribute('x')).not.toBe(xBefore)
    flow.dispose()
  })

  it('an interior-node drag patches that node rect in place (attrs move, identity holds)', () => {
    const flow = makeFlow()
    const { container, cleanup } = mountReactive(
      h(Flow, { instance: flow }, h(MiniMap, {})),
    )
    cleanups.push(cleanup)
    const rects = [...container.querySelectorAll('.pyreon-flow-minimap g rect')]
    const cRect = rects[2]! // For order = nodes order → 'c'
    const xBefore = cRect.getAttribute('x')

    // Drag-shaped write: move ONLY interior node 'c' (bounds unchanged).
    flow.nodes.update((nds) =>
      nds.map((n) => (n.id === 'c' ? { ...n, position: { x: 130, y: 60 } } : n)),
    )

    expect([...container.querySelectorAll('.pyreon-flow-minimap g rect')]).toEqual(rects)
    expect(cRect.getAttribute('x')).not.toBe(xBefore)
    flow.dispose()
  })

  it('empty graph renders the minimap shell with the viewport indicator hidden', () => {
    const flow = createFlow({})
    const { container, cleanup } = mountReactive(
      h(Flow, { instance: flow }, h(MiniMap, {})),
    )
    cleanups.push(cleanup)
    expect(container.querySelector('.pyreon-flow-minimap')).toBeTruthy()
    const vpRect = container.querySelector('.pyreon-flow-minimap-viewport')!
    expect(vpRect.getAttribute('style') ?? '').toContain('display: none')
    flow.dispose()
  })

  it('click navigates using the CURRENT bounds (not setup-time values)', () => {
    const flow = makeFlow()
    const { container, cleanup } = mountReactive(
      h(Flow, { instance: flow }, h(MiniMap, {})),
    )
    cleanups.push(cleanup)
    const before = flow.viewport.peek()
    const minimap = container.querySelector<HTMLElement>('.pyreon-flow-minimap')!
    minimap.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 50, clientY: 40 }),
    )
    const after = flow.viewport.peek()
    expect(after).not.toEqual(before)
    flow.dispose()
  })

  it('nodeColor function + custom size props apply', () => {
    const flow = makeFlow()
    const { container, cleanup } = mountReactive(
      h(
        Flow,
        { instance: flow },
        h(MiniMap, {
          width: 111,
          height: 77,
          nodeColor: (n: { id: string }) => (n.id === 'b' ? 'red' : 'blue'),
        }),
      ),
    )
    cleanups.push(cleanup)
    const svg = container.querySelector('.pyreon-flow-minimap svg')!
    expect(svg.getAttribute('width')).toBe('111')
    expect(svg.getAttribute('height')).toBe('77')
    const rects = [...container.querySelectorAll('.pyreon-flow-minimap g rect')]
    expect(rects[0]!.getAttribute('fill')).toBe('blue')
    expect(rects[1]!.getAttribute('fill')).toBe('red')
    flow.dispose()
  })
})
