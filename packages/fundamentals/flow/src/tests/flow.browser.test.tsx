import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'
import { MarkerType } from '../types'


// Real-Chromium smoke suite for @pyreon/flow.
//
// Why this exists: <Flow> renders SVG paths + transforms via CSS, uses
// pointer events for drag/pan, and depends on real layout for hit
// testing. happy-dom doesn't compute layout or honor pointer-event
// dispatch the way real browsers do. This suite exercises a small
// graph end-to-end.

describe('flow in real browser', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the configured nodes and edges', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: '2', position: { x: 200, y: 100 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    expect(flow.nodes()).toHaveLength(2)
    expect(flow.edges()).toHaveLength(1)
    // Default node renders a div with the data-nodeid attribute.
    expect(container.querySelectorAll('[data-nodeid]').length).toBeGreaterThanOrEqual(2)
    unmount()
  })

  it('selectNode flips the reactive selectedNodes signal and highlights the node', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: '2', position: { x: 200, y: 100 }, data: { label: 'B' } },
      ],
    })
    const { unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    expect(flow.selectedNodes()).toEqual([])

    flow.selectNode('1')
    await flush()
    expect(flow.selectedNodes()).toEqual(['1'])

    flow.selectNode('2')
    await flush()
    // Non-additive: '1' is replaced.
    expect(flow.selectedNodes()).toEqual(['2'])

    flow.selectNode('1', true)
    await flush()
    expect([...flow.selectedNodes()].sort()).toEqual(['1', '2'])
    unmount()
  })

  it('updateNode mutates position reactively and re-renders without remounting nodes', async () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    const nodeEl = container.querySelector<HTMLElement>('[data-nodeid="1"]')
    expect(nodeEl).not.toBeNull()
    const originalRef = nodeEl

    flow.updateNode('1', { position: { x: 250, y: 175 } })
    await flush()

    // Same DOM element — no remount; position is reactive.
    expect(container.querySelector('[data-nodeid="1"]')).toBe(originalRef)
    expect(flow.nodes()[0]?.position).toEqual({ x: 250, y: 175 })
    unmount()
  })

  it('drags a node via real PointerEvent sequence (down/move/up)', async () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    })
    const seenDragStart: string[] = []
    flow.onNodeDragStart((n) => seenDragStart.push(n.id))

    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    const node = container.querySelector<HTMLElement>('[data-nodeid="1"]')!
    const flowEl = container.querySelector<HTMLElement>('.pyreon-flow')!

    const dispatch = (
      el: Element,
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      x: number,
      y: number,
    ) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          isPrimary: true,
          pointerType: 'mouse',
          button: type === 'pointermove' ? -1 : 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: y,
        }),
      )

    dispatch(node, 'pointerdown', 10, 10)
    // Confirms drag actually started before we move.
    expect(seenDragStart).toEqual(['1'])

    // After setPointerCapture(1) on the flow container, subsequent
    // pointer events for pointerId=1 are routed to the container.
    dispatch(flowEl, 'pointermove', 60, 40)
    dispatch(flowEl, 'pointermove', 110, 80)
    dispatch(flowEl, 'pointerup', 110, 80)
    await flush()

    const pos = flow.nodes()[0]!.position
    expect(pos.x).toBeGreaterThan(0)
    expect(pos.y).toBeGreaterThan(0)
    unmount()
  })

  it('node click selects via real click event (not just selectNode API)', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: '2', position: { x: 200, y: 100 }, data: { label: 'B' } },
      ],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    const node1 = container.querySelector<HTMLElement>('[data-nodeid="1"]')!
    node1.click()
    await flush()
    expect(flow.selectedNodes()).toEqual(['1'])

    // Node click also fires the nodeClick event listener (subscribe API)
    const seen: string[] = []
    flow.onNodeClick((n) => seen.push(n.id))
    container.querySelector<HTMLElement>('[data-nodeid="2"]')!.click()
    await flush()
    expect(seen).toEqual(['2'])
    unmount()
  })

  it('handles empty graph (zero nodes, zero edges) without crashing', async () => {
    const flow = createFlow({ nodes: [], edges: [] })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()
    // Container mounts even for empty graph.
    expect(container.querySelector('.pyreon-flow')).not.toBeNull()
    expect(flow.nodes()).toEqual([])
    unmount()
  })

  it('addNode after mount updates the rendered DOM (live mutation)', async () => {
    const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }] })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()
    expect(container.querySelectorAll('[data-nodeid]')).toHaveLength(1)

    flow.addNode({ id: '2', position: { x: 100, y: 100 }, data: {} })
    await flush()
    expect(container.querySelectorAll('[data-nodeid]')).toHaveLength(2)
    expect(container.querySelector('[data-nodeid="2"]')).not.toBeNull()

    flow.removeNode('1')
    await flush()
    expect(container.querySelectorAll('[data-nodeid]')).toHaveLength(1)
    expect(container.querySelector('[data-nodeid="1"]')).toBeNull()
    unmount()
  })

  it('removing a node also removes its incident edges', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()
    expect(flow.edges()).toHaveLength(1)
    expect(container.querySelector('svg.pyreon-flow-edges path')).not.toBeNull()

    flow.removeNode('2')
    await flush()
    expect(flow.edges()).toHaveLength(0)
    expect(container.querySelector('svg.pyreon-flow-edges path')).toBeNull()
    unmount()
  })

  it('zoom changes viewport and survives bounds (clamp to min/max)', async () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
      minZoom: 0.5,
      maxZoom: 2,
    })
    const { unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    expect(flow.viewport().zoom).toBe(1)
    flow.zoomTo(0.1)
    expect(flow.viewport().zoom).toBe(0.5) // clamped to minZoom
    flow.zoomTo(100)
    expect(flow.viewport().zoom).toBe(2) // clamped to maxZoom
    flow.zoomTo(1.5)
    expect(flow.viewport().zoom).toBe(1.5)
    unmount()
  })

  it('toJSON / fromJSON round-trips graph state', async () => {
    const flow1 = createFlow({
      nodes: [
        { id: 'a', position: { x: 10, y: 20 }, data: { label: 'A' } },
        { id: 'b', position: { x: 30, y: 40 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b' }],
    })
    const json = flow1.toJSON()
    const flow2 = createFlow()
    flow2.fromJSON(json)
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow2 }))
    await flush()

    expect(flow2.nodes().map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(flow2.edges().map((e) => e.id)).toEqual(['e'])
    expect(container.querySelectorAll('[data-nodeid]')).toHaveLength(2)
    unmount()
  })

  it('renders an SVG path between two connected nodes', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: '2', position: { x: 200, y: 100 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'e1', source: '1', target: '2' }],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    const svg = container.querySelector('svg.pyreon-flow-edges')
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg')
    const path = svg?.querySelector('path')
    expect(path).not.toBeNull()
    expect(path?.getAttribute('d')).toBeTruthy()
    unmount()
  })

  it('renders custom node types via nodeTypes registry', async () => {
    const CustomNode = (props: { id: string; data: () => { label: string } }) =>
      h('div', { 'data-custom': props.id, class: 'custom-node' }, () => props.data().label)

    const flow = createFlow({
      nodes: [
        { id: 'c1', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'CUSTOM' } },
      ],
    })
    const { container, unmount } = mountInBrowser(
      h(Flow, { instance: flow, nodeTypes: { custom: CustomNode } }),
    )
    await flush()

    const customEl = container.querySelector<HTMLElement>('[data-custom="c1"]')
    expect(customEl).not.toBeNull()
    expect(customEl?.textContent).toBe('CUSTOM')
    unmount()
  })

  // ── Interaction flags (selectable / nodesSelectable / group) ───────────────
  // These mirror the existing draggable / nodesDraggable guard. A real click on
  // the node div is what the flag gates — programmatic selectNode is unaffected.

  it('node.selectable=false blocks click-selection; programmatic selectNode still works', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' }, selectable: false },
        { id: '2', position: { x: 200, y: 100 }, data: { label: 'B' } },
      ],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    container
      .querySelector<HTMLElement>('[data-nodeid="1"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(flow.selectedNodes()).toEqual([]) // selectable:false → click ignored

    container
      .querySelector<HTMLElement>('[data-nodeid="2"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(flow.selectedNodes()).toEqual(['2']) // default selectable → click selects

    flow.selectNode('1') // programmatic bypasses the interaction gate
    await flush()
    expect([...flow.selectedNodes()].sort()).toEqual(['1'])
    unmount()
  })

  it('config.nodesSelectable=false blocks click-selection globally', async () => {
    const flow = createFlow({
      nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
      nodesSelectable: false,
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    container
      .querySelector<HTMLElement>('[data-nodeid="1"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(flow.selectedNodes()).toEqual([])
    unmount()
  })

  it('node.group=true adds the "group" class to the node element', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'g', position: { x: 0, y: 0 }, data: { label: 'G' }, group: true },
        { id: 'n', position: { x: 100, y: 0 }, data: { label: 'N' } },
      ],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    expect(container.querySelector<HTMLElement>('[data-nodeid="g"]')!.className).toContain('group')
    expect(container.querySelector<HTMLElement>('[data-nodeid="n"]')!.className).not.toContain(
      'group',
    )
    unmount()
  })

  // ── Configurable edge markers (React Flow parity) ────────────────────────

  it('renders configurable, deduped edge markers with the right shapes + colors', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 0 }, data: {} },
        { id: '3', position: { x: 400, y: 0 }, data: {} },
        { id: '4', position: { x: 600, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'def', source: '1', target: '2' }, // default → filled arrowclosed / edge-var colour
        { id: 'open', source: '2', target: '3', markerEnd: MarkerType.Arrow }, // open arrow / edge-var colour
        {
          id: 'red',
          source: '3',
          target: '4',
          markerEnd: { type: MarkerType.Arrow, color: '#ff0000' },
          markerStart: MarkerType.ArrowClosed, // == default config → deduped
        },
        { id: 'none', source: '1', target: '4', markerEnd: null }, // arrowless
      ],
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()

    const svg = container.querySelector('.pyreon-flow-edges')!
    const markers = [...svg.querySelectorAll('defs marker')]
    // Distinct configs: arrowclosed/var (default end + red's start → deduped),
    // arrow/var (open end), arrow/#ff0000 (red end) = 3 defs.
    expect(markers.length).toBe(3)

    // Shape per type: ArrowClosed → filled <polygon>, Arrow → stroked <polyline>.
    // Colour lives in `style` (not a `fill`/`stroke` attribute) so a `var()` can
    // resolve; an unstyled marker defaults to the themeable edge var.
    const closed = markers.find((m) => m.id.includes('-arrowclosed-'))!
    expect(closed.querySelector('polygon')).not.toBeNull()
    expect(closed.querySelector('polygon')!.getAttribute('style')).toContain(
      'fill: var(--pyreon-flow-edge',
    )
    const arrows = markers.filter((m) => m.id.includes('-arrow-'))
    expect(arrows.length).toBe(2)
    arrows.forEach((m) => expect(m.querySelector('polyline')).not.toBeNull())
    const red = arrows.find((m) => m.id.includes('-ff0000-'))!
    // Computed, not the raw attribute: the browser normalizes `#ff0000` → rgb().
    expect(getComputedStyle(red.querySelector('polyline')!).stroke).toBe('rgb(255, 0, 0)')

    // Per-edge refs: 3 of the 4 edge paths carry marker-end; the markerEnd:null
    // edge has none. Exactly one edge carries a marker-start.
    const paths = [...svg.querySelectorAll('path[d]')]
    expect(paths.length).toBe(4)
    const withEnd = paths.filter((p) => p.getAttribute('marker-end'))
    expect(withEnd.length).toBe(3)
    const withStart = paths.filter((p) => p.getAttribute('marker-start'))
    expect(withStart.length).toBe(1)
    // Every marker-* ref resolves to a real <marker id> in the defs.
    const ids = new Set(markers.map((m) => m.id))
    for (const p of [...withEnd, ...withStart]) {
      for (const attr of ['marker-end', 'marker-start']) {
        const ref = p.getAttribute(attr)
        if (ref) expect(ids.has(ref.slice(5, -1))).toBe(true) // strip url(# … )
      }
    }
    unmount()
  })

  it('marker defs update reactively when an edge with a new marker config is added', async () => {
    const flow = createFlow({
      nodes: [
        { id: '1', position: { x: 0, y: 0 }, data: {} },
        { id: '2', position: { x: 200, y: 0 }, data: {} },
        { id: '3', position: { x: 400, y: 0 }, data: {} },
      ],
      edges: [{ id: 'a', source: '1', target: '2' }], // default arrowclosed
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    await flush()
    const svg = container.querySelector('.pyreon-flow-edges')!
    expect(svg.querySelectorAll('defs marker').length).toBe(1)

    // Add an edge with a brand-new marker config → a new def appears.
    flow.addEdge({ id: 'b', source: '2', target: '3', markerEnd: { type: MarkerType.Arrow, color: '#00aa00' } })
    await flush()
    expect(svg.querySelectorAll('defs marker').length).toBe(2)

    // Adding another edge with the SAME config does NOT add a def (deduped).
    flow.addEdge({ id: 'c', source: '1', target: '3', markerEnd: { type: MarkerType.Arrow, color: '#00aa00' } })
    await flush()
    expect(svg.querySelectorAll('defs marker').length).toBe(2)
    unmount()
  })

  // ── Render virtualization (onlyRenderVisibleElements) ────────────────────

  it('onlyRenderVisibleElements culls off-screen nodes and re-filters on pan', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'near', position: { x: 0, y: 0 }, data: {}, width: 100, height: 40 },
        { id: 'far', position: { x: 5000, y: 5000 }, data: {}, width: 100, height: 40 },
      ],
      onlyRenderVisibleElements: true,
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    // Set a deterministic viewport size AFTER the initial flush — the Flow's
    // ResizeObserver fires its first measurement during mount (headless body
    // has 0 intrinsic height), so setting it post-flush wins and isn't
    // overwritten. The pre-measurement guard treats 0×0 as "render all".
    await flush()
    flow.containerSize.set({ width: 800, height: 600 })
    await flush()

    const ids = () =>
      [...container.querySelectorAll('[data-nodeid]')].map((e) => e.getAttribute('data-nodeid'))

    // 'near' sits in the 800×600 viewport; 'far' (5000,5000) is well outside
    // the viewport + margin → culled from the DOM entirely.
    expect(ids()).toEqual(['near'])

    // Pan so 'far' enters view and 'near' leaves → the rendered set re-filters.
    flow.viewport.set({ x: -5000, y: -5000, zoom: 1 })
    await flush()
    expect(ids()).toEqual(['far'])
    unmount()
  })

  it('without onlyRenderVisibleElements, off-screen nodes still render (default)', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'near', position: { x: 0, y: 0 }, data: {} },
        { id: 'far', position: { x: 5000, y: 5000 }, data: {} },
      ],
      // flag omitted → default OFF
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    flow.containerSize.set({ width: 800, height: 600 })
    await flush()
    expect(container.querySelectorAll('[data-nodeid]').length).toBe(2)
    unmount()
  })

  // ── snapToObjects opt-out (drag-frame perf lever) ────────────────────────

  // Drags node A by a raw delta that lands its y within the 5px snap
  // threshold of node B. With snapToObjects on (default), A snaps to B's
  // alignment; off, A lands at the raw position and the O(N) per-frame snap
  // scan is skipped entirely. Asserting the instance position (not DOM
  // transform) keeps the math deterministic.
  async function dragAandReadPos(snapToObjects: boolean): Promise<{ x: number, y: number }> {
    const flow = createFlow({
      nodes: [
        { id: 'A', position: { x: 0, y: 0 }, data: {}, width: 150, height: 40 },
        { id: 'B', position: { x: 400, y: 100 }, data: {}, width: 150, height: 40 },
      ],
      ...(snapToObjects ? {} : { snapToObjects: false }),
    })
    const { container, unmount } = mountInBrowser(h(Flow, { instance: flow }))
    flow.containerSize.set({ width: 800, height: 600 })
    await flush()

    const node = container.querySelector('[data-nodeid="A"]')!
    const root = container.querySelector('.pyreon-flow')!
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

    // Only the delta from pointerdown matters; raw A → (0+10, 0+102).
    ev(node, 'pointerdown', 200, 200)
    ev(root, 'pointermove', 205, 251)
    ev(root, 'pointermove', 210, 302) // dx=10, dy=102
    ev(root, 'pointerup', 210, 302)
    await flush()

    const pos = { ...flow.getNode('A')!.position }
    unmount()
    return pos
  }

  it('snapToObjects default snaps a dragged node to a nearby node (raw y 102 → 100)', async () => {
    expect(await dragAandReadPos(true)).toEqual({ x: 10, y: 100 })
  })

  it('snapToObjects: false drags to the raw position, skipping the snap scan', async () => {
    expect(await dragAandReadPos(false)).toEqual({ x: 10, y: 102 })
  })
})
