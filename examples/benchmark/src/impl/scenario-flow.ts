/**
 * Scenario: **flow diagram — `@pyreon/flow` vs React Flow 12**.
 *
 * The first cross-library measurement for the flow package (2026-09 audit,
 * P0): until now every number about `@pyreon/flow` was internal (frame
 * complexity, fan-out counts) and nothing compared it with the library a
 * user would otherwise reach for. Six ops on one 500-node / 499-edge graph:
 *
 *  1. `mount 500 nodes + 499 edges`     — first render of the whole graph.
 *  2. `drag one node ×60 frames`        — 60 position writes on one node, the
 *     shape a 1-second pointer drag produces; edges must follow.
 *  3. `select node`                     — one node gains the selected state.
 *  4. `add 50 nodes + 50 edges`         — append to the live graph.
 *  5. `pan+zoom ×60`                    — 60 viewport writes (one wheel tick
 *     each), the shape a scroll-zoom produces.
 *  6. `unmount 500 nodes`               — teardown of the mounted graph.
 *
 * FAIRNESS — both arms drive their library through its PUBLIC imperative API,
 * the way an app that owns the graph state would: `createFlow` +
 * `updateNode` / `selectNode` / `addNode` / `viewport.set` on one side,
 * `ReactFlowInstance.updateNode` / `addNodes` / `setViewport` on the other
 * (uncontrolled `defaultNodes`, so React Flow owns its store exactly as
 * Pyreon's instance owns its signals). React Flow writes are wrapped in
 * `flushSync` so the timed region contains the commit — the same commit
 * discipline every React arm in this suite uses. Neither arm synthesises
 * pointer events: a synthetic pointer sequence measures each library's hit
 * testing plus the browser's event path, not the update it produces, and
 * React Flow's drag is d3-drag on real coordinates — un-drivable offscreen.
 *
 * React Flow hides a node until its ResizeObserver has measured it and only
 * then draws its edges; the mount verify therefore WAITS (outside the timed
 * region) for the edges to appear rather than asserting synchronously —
 * asserting immediately would fail React Flow for a property this suite is
 * not measuring. Pyreon draws edges from declared or default dimensions on
 * the first paint; that difference is real and is not smoothed over: the
 * mount op times what the user sees painted on the first frame, so React
 * Flow's number excludes the deferred edge pass.
 *
 * Per-iteration `verify` asserts the EFFECT (node count, node transform, edge
 * path changed, selected class, viewport transform, empty host) so a library
 * that no-ops posts a failure, not a fast number.
 *
 * RIVAL ARMS (2026-11), each on its library's documented imperative API:
 *  - **Svelte Flow 1** (`@xyflow/svelte`) — `FlowSvelte.svelte`: `$state.raw`
 *    nodes/edges bound to `<SvelteFlow>`, `useSvelteFlow().updateNode` /
 *    `setViewport`, array assignment for add/remove (Svelte Flow has no
 *    `addNodes`). Nodes declare `handles` like the React Flow arm, so edges are
 *    drawn without a measuring pass. Each write is followed by Svelte's
 *    `flushSync()`.
 *  - **Vue Flow 1** (`@vue-flow/core`) — `useVueFlow()`'s `updateNode`,
 *    `addNodes`/`addEdges`, `removeNodes`, `setViewport`; each write awaits
 *    `nextTick()` (so 60 drag frames are 60 renders). Vue Flow draws edges only
 *    after a ResizeObserver has measured every node and handle (it has no
 *    declared-handle path), so its MOUNT IS NOT TIMED — the timed window would
 *    hold nodes without edges, the very mismatch #3887 removed from the React
 *    Flow arm. Its other ops run on the measured, fully drawn graph; its `add`
 *    gate counts nodes, and the 50 new edges are drawn after the window closes
 *    (another measuring pass), so that row also times less than the others.
 *  - **JointJS 4** (`@joint/core`, MPL-2.0) — `dia.Graph` + a synchronous
 *    `dia.Paper` (`async: false`, its default), cells built with
 *    `shapes.standard.Rectangle` / `Link`, the initial graph and additions
 *    loaded between `paper.freeze()` / `unfreeze()` (the docs' batching
 *    pattern), moves via `element.position()`, the viewport via
 *    `paper.matrix()`. JointJS core has no selection model; the documented way
 *    to show one is a highlighter, so `select` is
 *    `highlighters.mask.add(view, 'body', 'selection')` and its gate checks
 *    the highlighter's element is in the DOM. Nodes are SVG `<g>` elements,
 *    not HTML.
 *
 * SKIPPED, with the reason:
 *  - **Cytoscape.js** — canvas renderer; `cy.forceRender()` only requests the
 *    next frame and every draw happens in its own `requestAnimationFrame`
 *    loop. No op has a synchronous commit to time, and a frame wait inside the
 *    window is barred by this suite's protocol; timing the model update alone
 *    would exclude all of its drawing while every DOM arm pays its own.
 *  - **Rete.js 2** — every editor op (`addNode`, `area.translate`) returns a
 *    Promise and nodes are drawn by a render plugin that mounts one framework
 *    root per node and commits through that framework's scheduler; there is
 *    no synchronous commit boundary for the same reason.
 *  - **AntV X6** — the brief allowed one of X6 / JointJS; JointJS was chosen.
 */
import { h as ph } from '@pyreon/core'
import { createFlow, Flow, flowStyles, type FlowEdge, type FlowInstance, type FlowNode } from '@pyreon/flow'
import { batch } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import {
  ReactFlow,
  ReactFlowProvider,
  Position,
  type Edge as RfEdge,
  type Node as RfNode,
  type ReactFlowInstance,
} from '@xyflow/react'
import { jsx as reactJsx } from 'react/jsx-runtime'
import { flushSync as reactFlushSync } from 'react-dom'
import * as ReactDOM from 'react-dom/client'
import { dia, highlighters as jHighlighters, shapes as jShapes } from '@joint/core'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { Edge as SvfEdge, Node as SvfNode } from '@xyflow/svelte'
import { flushSync as svelteFlushSync, mount as svelteMount, unmount as svelteUnmount } from 'svelte'
import { createApp, defineComponent, h as vueH, nextTick } from 'vue'
import FlowSvelte from './FlowSvelte.svelte'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'

export const FLOW_FRAMEWORKS = ['Pyreon', 'React Flow 12', 'Svelte Flow 1', 'Vue Flow 1', 'JointJS 4'] as const

const COLS = 25
const N = 500
const ADD = 50
const DRAG_FRAMES = 60
const ZOOM_TICKS = 60
const DRAG_ID = 'n250'

interface GraphNode {
  id: string
  x: number
  y: number
  label: string
}
interface GraphEdge {
  id: string
  source: string
  target: string
}

function buildGraph(count: number, offset = 0): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  for (let i = 0; i < count; i++) {
    const k = offset + i
    nodes.push({ id: `n${k}`, x: (k % COLS) * 180, y: Math.floor(k / COLS) * 80, label: `Node ${k}` })
    if (i > 0) edges.push({ id: `e${k - 1}-${k}`, source: `n${k - 1}`, target: `n${k}` })
  }
  return { nodes, edges }
}

/** Poll a predicate across animation frames (verify-side only, never timed). */
async function waitFor(pred: () => boolean, frames = 60, label = 'condition'): Promise<void> {
  for (let i = 0; i < frames; i++) {
    if (pred()) return
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
  }
  if (!pred()) throw new Error(`[flow] timed out waiting for ${label}`)
}

/** A write either commits synchronously or returns the promise of its commit (Vue: `nextTick`). */
type Commit = void | Promise<void>

interface FlowTarget {
  /** Mount the base graph. Returns the teardown. */
  mount(host: HTMLElement): () => void
  /** Resolves once the library is ready for imperative ops (React Flow: onInit). */
  ready(): Promise<void>
  /** Commit after `mount`, inside the timed region (Vue: `nextTick`). */
  settle?: () => Promise<void>
  /**
   * Edges are drawn only after a ResizeObserver measuring pass (Vue Flow). The
   * mount op is then NOT timed: its window would hold nodes without edges.
   */
  edgesDeferred?: boolean
  nodeCount(host: HTMLElement): number
  edgeCount(host: HTMLElement): number
  nodeTransform(host: HTMLElement, id: string): string
  edgePath(host: HTMLElement): string
  moveNode(id: string, x: number, y: number): Commit
  select(id: string): Commit
  isSelected(host: HTMLElement, id: string): boolean
  clearSelection(): Commit
  addGraph(g: { nodes: GraphNode[]; edges: GraphEdge[] }): Commit
  removeGraph(g: { nodes: GraphNode[]; edges: GraphEdge[] }): Commit
  setViewport(x: number, y: number, zoom: number): Commit
  viewportTransform(host: HTMLElement): string
}

// ─── Pyreon ─────────────────────────────────────────────────────────────────

function pyreonTarget(base: { nodes: GraphNode[]; edges: GraphEdge[] }): FlowTarget {
  let flow: FlowInstance<Record<string, unknown>> | null = null
  const toNode = (n: GraphNode): FlowNode => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: { label: n.label },
    width: 150,
    height: 40,
  })
  const toEdge = (e: GraphEdge): FlowEdge => ({ id: e.id, source: e.source, target: e.target })
  return {
    mount(host) {
      const inst = createFlow({ nodes: base.nodes.map(toNode), edges: base.edges.map(toEdge) })
      flow = inst
      const unmount = pyreonMount(ph(Flow, { instance: inst }), host)
      return () => {
        unmount()
        inst.dispose()
        if (flow === inst) flow = null
      }
    },
    ready: () => Promise.resolve(),
    nodeCount: (host) => host.querySelectorAll('.pyreon-flow-node').length,
    // The edge `<path>` sits in a `<g>`; marker paths live under `<defs>` and the
    // invisible hit-area path (edge interaction width) is excluded by class.
    edgeCount: (host) => host.querySelectorAll('svg.pyreon-flow-edges g > path:not(.pyreon-flow-edge-interaction)').length,
    nodeTransform: (host, id) =>
      host.querySelector<HTMLElement>(`[data-nodeid="${id}"]`)?.style.transform ?? '',
    edgePath: (host) => host.querySelector('svg.pyreon-flow-edges g > path:not(.pyreon-flow-edge-interaction)')?.getAttribute('d') ?? '',
    moveNode: (id, x, y) => flow!.updateNode(id, { position: { x, y } }),
    select: (id) => flow!.selectNode(id),
    isSelected: (host, id) =>
      host.querySelector(`[data-nodeid="${id}"]`)?.classList.contains('selected') ?? false,
    clearSelection: () => flow!.clearSelection(),
    addGraph: (g) =>
      batch(() => {
        for (const n of g.nodes) flow!.addNode(toNode(n))
        for (const e of g.edges) flow!.addEdge(toEdge(e))
      }),
    removeGraph: (g) =>
      batch(() => {
        for (const n of g.nodes) flow!.removeNode(n.id)
      }),
    setViewport: (x, y, zoom) => flow!.viewport.set({ x, y, zoom }),
    viewportTransform: (host) =>
      host.querySelector<HTMLElement>('.pyreon-flow-viewport')?.style.transform ?? '',
  }
}

// ─── React Flow 12 ──────────────────────────────────────────────────────────

let rfCssInjected = false
async function ensureRfCss(): Promise<void> {
  if (rfCssInjected) return
  rfCssInjected = true
  await import('@xyflow/react/dist/style.css')
}

function reactFlowTarget(base: { nodes: GraphNode[]; edges: GraphEdge[] }): FlowTarget {
  let inst: ReactFlowInstance | null = null
  let readyPromise: Promise<void> = Promise.resolve()
  const toNode = (n: GraphNode): RfNode => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: { label: n.label },
    width: 150,
    height: 40,
    // Declared handle positions put React Flow on its synchronous edge path.
    // Without them it draws edges only after a ResizeObserver measures each
    // node's handles, a frame after mount, so the timed `mount` window held
    // 500 nodes and ZERO edges for React Flow but the complete graph for
    // Pyreon (measured: edges at mount 0 vs 499). This is React Flow's own
    // documented way to render without measuring (as for SSR), so it is its
    // fastest path, and both arms now time the same finished graph. Verified:
    // 499 edges present at the end of the synchronous mount, for both arms.
    handles: [
      { type: 'target', position: Position.Top, x: 72, y: -3, width: 6, height: 6 },
      { type: 'source', position: Position.Bottom, x: 72, y: 37, width: 6, height: 6 },
    ],
  })
  const toEdge = (e: GraphEdge): RfEdge => ({ id: e.id, source: e.source, target: e.target })
  return {
    mount(host) {
      inst = null
      let resolveReady: () => void = () => {}
      readyPromise = new Promise<void>((r) => {
        resolveReady = r
      })
      const root = ReactDOM.createRoot(host)
      // Automatic-JSX-runtime emit of `<ReactFlowProvider><ReactFlow … /></ReactFlowProvider>`.
      const element = reactJsx(ReactFlowProvider, {
        children: reactJsx(ReactFlow, {
          defaultNodes: base.nodes.map(toNode),
          defaultEdges: base.edges.map(toEdge),
          onInit: (i: ReactFlowInstance) => {
            inst = i
            resolveReady()
          },
          fitView: false,
          proOptions: { hideAttribution: true },
        }),
      })
      reactFlushSync(() => root.render(element))
      return () => {
        root.unmount()
        inst = null
      }
    },
    ready: () => readyPromise,
    nodeCount: (host) => host.querySelectorAll('.react-flow__node').length,
    edgeCount: (host) => host.querySelectorAll('.react-flow__edge').length,
    nodeTransform: (host, id) =>
      host.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)?.style.transform ?? '',
    edgePath: (host) => host.querySelector('.react-flow__edge path')?.getAttribute('d') ?? '',
    moveNode: (id, x, y) => reactFlushSync(() => inst!.updateNode(id, { position: { x, y } })),
    select: (id) => reactFlushSync(() => inst!.updateNode(id, { selected: true })),
    isSelected: (host, id) =>
      host.querySelector(`.react-flow__node[data-id="${id}"]`)?.classList.contains('selected') ??
      false,
    clearSelection: () => reactFlushSync(() => inst!.updateNode(DRAG_ID, { selected: false })),
    addGraph: (g) =>
      reactFlushSync(() => {
        inst!.addNodes(g.nodes.map(toNode))
        inst!.addEdges(g.edges.map(toEdge))
      }),
    removeGraph: (g) => {
      const ids = new Set(g.nodes.map((n) => n.id))
      const eids = new Set(g.edges.map((e) => e.id))
      reactFlushSync(() => {
        inst!.setNodes((ns) => ns.filter((n) => !ids.has(n.id)))
        inst!.setEdges((es) => es.filter((e) => !eids.has(e.id)))
      })
    },
    setViewport: (x, y, zoom) => reactFlushSync(() => void inst!.setViewport({ x, y, zoom })),
    viewportTransform: (host) =>
      host.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '',
  }
}

// ─── Svelte Flow 1 ──────────────────────────────────────────────────────────

let svfCssInjected = false
async function ensureSvfCss(): Promise<void> {
  if (svfCssInjected) return
  svfCssInjected = true
  await import('@xyflow/svelte/dist/style.css')
}

interface SvfHandle {
  updateNode: (id: string, update: Partial<SvfNode>) => void
  setViewport: (v: { x: number; y: number; zoom: number }) => void
  addGraph: (n: SvfNode[], e: SvfEdge[]) => void
  removeGraph: (nodeIds: Set<string>, edgeIds: Set<string>) => void
}

function svelteFlowTarget(base: { nodes: GraphNode[]; edges: GraphEdge[] }): FlowTarget {
  let api: SvfHandle | null = null
  const toNode = (n: GraphNode): SvfNode => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: { label: n.label },
    width: 150,
    height: 40,
    // Same declared-handle path as the React Flow arm (shared @xyflow/system):
    // edges are drawn on the first render instead of after a measuring pass.
    handles: [
      { type: 'target', position: Position.Top, x: 72, y: -3, width: 6, height: 6 },
      { type: 'source', position: Position.Bottom, x: 72, y: 37, width: 6, height: 6 },
    ],
  } as SvfNode)
  const toEdge = (e: GraphEdge): SvfEdge => ({ id: e.id, source: e.source, target: e.target })
  const write = (fn: () => void): void => {
    fn()
    svelteFlushSync()
  }
  return {
    mount(host) {
      api = null
      const app = svelteMount(FlowSvelte, {
        target: host,
        props: {
          initialNodes: base.nodes.map(toNode),
          initialEdges: base.edges.map(toEdge),
          onReady: (h: SvfHandle) => {
            api = h
          },
        },
      })
      svelteFlushSync()
      return () => {
        void svelteUnmount(app)
        api = null
      }
    },
    ready: () => Promise.resolve(),
    nodeCount: (host) => host.querySelectorAll('.svelte-flow__node').length,
    edgeCount: (host) => host.querySelectorAll('.svelte-flow__edge').length,
    nodeTransform: (host, id) =>
      host.querySelector<HTMLElement>(`.svelte-flow__node[data-id="${id}"]`)?.style.transform ?? '',
    edgePath: (host) => host.querySelector('.svelte-flow__edge path')?.getAttribute('d') ?? '',
    moveNode: (id, x, y) => write(() => api!.updateNode(id, { position: { x, y } })),
    select: (id) => write(() => api!.updateNode(id, { selected: true })),
    isSelected: (host, id) =>
      host.querySelector(`.svelte-flow__node[data-id="${id}"]`)?.classList.contains('selected') ?? false,
    clearSelection: () => write(() => api!.updateNode(DRAG_ID, { selected: false })),
    addGraph: (g) => write(() => api!.addGraph(g.nodes.map(toNode), g.edges.map(toEdge))),
    removeGraph: (g) =>
      write(() => api!.removeGraph(new Set(g.nodes.map((n) => n.id)), new Set(g.edges.map((e) => e.id)))),
    setViewport: (x, y, zoom) => write(() => api!.setViewport({ x, y, zoom })),
    viewportTransform: (host) =>
      host.querySelector<HTMLElement>('.svelte-flow__viewport')?.style.transform ?? '',
  }
}

// ─── Vue Flow 1 ─────────────────────────────────────────────────────────────

let vfCssInjected = false
async function ensureVfCss(): Promise<void> {
  if (vfCssInjected) return
  vfCssInjected = true
  // Both sheets, as https://vueflow.dev/guide/theming.html prescribes.
  await import('@vue-flow/core/dist/style.css')
  await import('@vue-flow/core/dist/theme-default.css')
}

// https://vueflow.dev/guide/vue-flow/state.html — `useVueFlow(id)` actions
// (`updateNode`, `addNodes`, `addEdges`, `removeNodes`, `setViewport`).
// The root renders `<VueFlow>` with one `h()` call: there is no list in this
// component for a compiled template to optimise; Vue Flow's own node and edge
// renderers are its shipped compiled components.
function vueFlowTarget(base: { nodes: GraphNode[]; edges: GraphEdge[] }): FlowTarget {
  type VfApi = ReturnType<typeof useVueFlow>
  let api: VfApi | null = null
  const toNode = (n: GraphNode) => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: { label: n.label },
    label: n.label,
    width: 150,
    height: 40,
  })
  const toEdge = (e: GraphEdge) => ({ id: e.id, source: e.source, target: e.target })
  const write = async (fn: () => unknown): Promise<void> => {
    await fn()
    await nextTick()
  }
  return {
    edgesDeferred: true,
    mount(host) {
      api = null
      const App = defineComponent({
        setup() {
          api = useVueFlow('bench')
          return () =>
            vueH(VueFlow, {
              id: 'bench',
              nodes: base.nodes.map(toNode),
              edges: base.edges.map(toEdge),
              fitViewOnInit: false,
            })
        },
      })
      const app = createApp(App)
      app.mount(host)
      return () => {
        app.unmount()
        api = null
      }
    },
    ready: () => Promise.resolve(),
    settle: () => nextTick(),
    nodeCount: (host) => host.querySelectorAll('.vue-flow__node').length,
    edgeCount: (host) => host.querySelectorAll('.vue-flow__edge').length,
    nodeTransform: (host, id) =>
      host.querySelector<HTMLElement>(`.vue-flow__node[data-id="${id}"]`)?.style.transform ?? '',
    edgePath: (host) => host.querySelector('.vue-flow__edge path')?.getAttribute('d') ?? '',
    moveNode: (id, x, y) => write(() => api!.updateNode(id, { position: { x, y } })),
    // Vue Flow's selection actions (`updateNode` does not take `selected`).
    select: (id) => write(() => api!.addSelectedNodes([api!.findNode(id)!])),
    isSelected: (host, id) =>
      host.querySelector(`.vue-flow__node[data-id="${id}"]`)?.classList.contains('selected') ?? false,
    clearSelection: () => write(() => api!.removeSelectedNodes([api!.findNode(DRAG_ID)!])),
    addGraph: (g) =>
      write(() => {
        api!.addNodes(g.nodes.map(toNode))
        api!.addEdges(g.edges.map(toEdge))
      }),
    removeGraph: (g) =>
      write(() => {
        api!.removeNodes(g.nodes.map((n) => n.id))
      }),
    setViewport: (x, y, zoom) => write(() => api!.setViewport({ x, y, zoom })),
    viewportTransform: (host) =>
      host.querySelector<HTMLElement>('.vue-flow__transformationpane')?.style.transform ?? '',
  }
}

// ─── JointJS 4 ──────────────────────────────────────────────────────────────

// https://docs.jointjs.com/learn/quickstart/ (Graph + Paper, standard shapes),
// https://docs.jointjs.com/learn/features/performance (freeze/unfreeze batching),
// https://docs.jointjs.com/learn/features/highlighters (selection highlight).
function jointTarget(base: { nodes: GraphNode[]; edges: GraphEdge[] }): FlowTarget {
  let graph: dia.Graph | null = null
  let paper: dia.Paper | null = null
  const toNode = (n: GraphNode) =>
    new jShapes.standard.Rectangle({
      id: n.id,
      position: { x: n.x, y: n.y },
      size: { width: 150, height: 40 },
      attrs: { label: { text: n.label } },
    })
  // Bottom-centre → top-centre anchors: the same geometry as the other arms'
  // source/target handles (https://docs.jointjs.com/learn/features/shapes/links/anchors).
  const toEdge = (e: GraphEdge) =>
    new jShapes.standard.Link({
      id: e.id,
      source: { id: e.source, anchor: { name: 'bottom' } },
      target: { id: e.target, anchor: { name: 'top' } },
    })
  /** `translate(x,y)` / `matrix(a,b,c,d,e,f)` → numbers. */
  const nums = (t: string | null | undefined): number[] =>
    (t ?? '').replace(/^[a-z]+\(|\)$/g, '').split(/[\s,]+/).filter(Boolean).map(Number)
  return {
    mount(host) {
      graph = new dia.Graph({}, { cellNamespace: jShapes })
      // The paper owns (and on `remove()` detaches) its element, so it gets
      // its own child of the host.
      const el = document.createElement('div')
      host.appendChild(el)
      paper = new dia.Paper({
        el,
        model: graph,
        width: 800,
        height: 600,
        async: false,
        cellViewNamespace: jShapes,
        defaultConnectionPoint: { name: 'anchor' },
        interactive: true,
      })
      paper.freeze()
      graph.resetCells([...base.nodes.map(toNode), ...base.edges.map(toEdge)])
      paper.unfreeze()
      const p = paper
      const g = graph
      return () => {
        p.remove()
        g.clear()
        if (paper === p) {
          paper = null
          graph = null
        }
      }
    },
    ready: () => Promise.resolve(),
    nodeCount: (host) => host.querySelectorAll('.joint-element').length,
    edgeCount: (host) => host.querySelectorAll('.joint-link').length,
    nodeTransform: (host, id) => {
      const [x, y] = nums(host.querySelector(`.joint-element[model-id="${id}"]`)?.getAttribute('transform'))
      return x === undefined ? '' : `translate(${x}px, ${y}px)`
    },
    edgePath: (host) => host.querySelector('.joint-link path[joint-selector="line"]')?.getAttribute('d') ?? '',
    moveNode: (id, x, y) => {
      ;(graph!.getCell(id) as dia.Element).position(x, y)
    },
    select: (id) => {
      jHighlighters.mask.add(paper!.findViewByModel(id)!, 'body', 'selection')
    },
    isSelected: (_host, id) => {
      const view = paper?.findViewByModel(id)
      const hl = view ? jHighlighters.mask.get(view, 'selection') : null
      return hl !== null && hl !== undefined && (hl as unknown as { el: Element }).el.isConnected
    },
    clearSelection: () => {
      const view = paper?.findViewByModel(DRAG_ID)
      if (view) jHighlighters.mask.remove(view, 'selection')
    },
    addGraph: (g) => {
      paper!.freeze()
      graph!.addCells([...g.nodes.map(toNode), ...g.edges.map(toEdge)])
      paper!.unfreeze()
    },
    removeGraph: (g) => {
      // Removing an element removes its links (JointJS default).
      graph!.removeCells(g.nodes.map((n) => graph!.getCell(n.id)!).filter(Boolean))
    },
    setViewport: (x, y, zoom) => {
      paper!.matrix({ a: zoom, b: 0, c: 0, d: zoom, e: x, f: y })
    },
    viewportTransform: (host) => {
      const [a, , , , e, f] = nums(host.querySelector('.joint-layers')?.getAttribute('transform'))
      return a === undefined ? '' : `translate(${e}px, ${f}px) scale(${a})`
    },
  }
}

// ─── Runner ─────────────────────────────────────────────────────────────────

export async function runFlow(frameworkName: string, container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: frameworkName, container, results: [] }
  const base = buildGraph(N)
  const extra = buildGraph(ADD, N)
  // The chain edge from the last base node into the first added node makes the
  // add op exercise the "edge to a node arriving in the same batch" path.
  extra.edges.unshift({ id: `e${N - 1}-${N}`, source: `n${N - 1}`, target: `n${N}` })

  let target: FlowTarget
  switch (frameworkName) {
    case 'Pyreon': {
      target = pyreonTarget(base)
      if (!document.getElementById('pyreon-flow-bench-styles')) {
        const style = document.createElement('style')
        style.id = 'pyreon-flow-bench-styles'
        style.textContent = flowStyles
        document.head.appendChild(style)
      }
      break
    }
    case 'React Flow 12': {
      await ensureRfCss()
      target = reactFlowTarget(base)
      break
    }
    case 'Svelte Flow 1': {
      await ensureSvfCss()
      target = svelteFlowTarget(base)
      break
    }
    case 'Vue Flow 1': {
      await ensureVfCss()
      target = vueFlowTarget(base)
      break
    }
    case 'JointJS 4': {
      target = jointTarget(base)
      break
    }
    default:
      throw new Error(`[flow] unknown framework: ${frameworkName}`)
  }

  // Both libraries size themselves from their host; a zero-sized host makes
  // React Flow refuse to render its viewport.
  const host = document.createElement('div')
  host.style.cssText = 'width: 800px; height: 600px; position: relative;'
  container.appendChild(host)

  const verifyMounted = async () => {
    if (target.nodeCount(host) !== N) throw new Error(`[flow] expected ${N} nodes, got ${target.nodeCount(host)}`)
    await waitFor(() => target.edgeCount(host) === N - 1, 120, `${N - 1} edges`)
  }
  /**
   * The timed mount's gate: every edge must already be drawn when the timed
   * window closes (no frame has run since). This is what fails an arm whose
   * mount window holds nodes without edges.
   */
  const verifyMountedNow = () => {
    if (target.nodeCount(host) !== N) throw new Error(`[flow] expected ${N} nodes, got ${target.nodeCount(host)}`)
    if (target.edgeCount(host) !== N - 1)
      throw new Error(`[flow] ${target.edgeCount(host)} of ${N - 1} edges drawn when the mount window closed`)
  }

  // ── Op 1: mount ───────────────────────────────────────────────────────────
  let teardown: (() => void) | null = null
  if (!target.edgesDeferred) {
    await bench(
      `mount ${N} nodes + ${N - 1} edges`,
      suite,
      async () => {
        teardown = target.mount(host)
        if (target.settle) await target.settle()
      },
      {
        reset: () => {
          if (teardown) {
            teardown()
            teardown = null
          }
          host.innerHTML = ''
        },
        verify: verifyMountedNow,
      },
    )
    if (teardown) {
      ;(teardown as () => void)()
      teardown = null
    }
    host.innerHTML = ''
  }

  // Steady-state graph for the update ops.
  teardown = target.mount(host)
  if (target.settle) await target.settle()
  await target.ready()
  await verifyMounted()

  // ── Op 2: drag one node × 60 frames ───────────────────────────────────────
  const dragBase = base.nodes.find((n) => n.id === DRAG_ID)!
  let dragEnd = { x: dragBase.x, y: dragBase.y }
  let pathBefore = ''
  await bench(
    `drag one node ×${DRAG_FRAMES} frames (edges follow)`,
    suite,
    async () => {
      for (let f = 1; f <= DRAG_FRAMES; f++) {
        dragEnd = { x: dragBase.x + f * 2, y: dragBase.y + f }
        // Awaited only when the write returns its commit, so synchronous arms take no extra microtask hop.
        const c = target.moveNode(DRAG_ID, dragEnd.x, dragEnd.y)
        if (c) await c
      }
    },
    {
      reset: async () => {
        await target.moveNode(DRAG_ID, dragBase.x, dragBase.y)
        pathBefore = target.edgePath(host)
      },
      verify: () => {
        const t = target.nodeTransform(host, DRAG_ID)
        if (!t.includes(`${dragEnd.x}px`) || !t.includes(`${dragEnd.y}px`)) {
          throw new Error(`[flow] drag did not land: transform=${t}`)
        }
        if (target.edgePath(host) === pathBefore && pathBefore !== '') {
          // The first edge (n0→n1) is untouched by design; assert on the
          // touching edge instead via a d-attribute change on ANY edge.
          const paths = [...host.querySelectorAll('path')].map((p) => p.getAttribute('d'))
          if (!paths.some((d) => d && d !== pathBefore && d.includes(String(dragEnd.y)))) {
            throw new Error('[flow] no edge path followed the dragged node')
          }
        }
      },
    },
  )
  await target.moveNode(DRAG_ID, dragBase.x, dragBase.y)

  // ── Op 3: select ──────────────────────────────────────────────────────────
  await bench(
    'select node',
    suite,
    async () => {
      const c = target.select(DRAG_ID)
      if (c) await c
    },
    {
      reset: () => target.clearSelection(),
      verify: () => {
        if (!target.isSelected(host, DRAG_ID)) throw new Error('[flow] node not selected')
      },
    },
  )
  await target.clearSelection()

  // ── Op 4: add 50 nodes + 50 edges ─────────────────────────────────────────
  await bench(
    `add ${ADD} nodes + ${extra.edges.length} edges`,
    suite,
    async () => {
      const c = target.addGraph(extra)
      if (c) await c
    },
    {
      reset: async () => {
        if (target.nodeCount(host) > N) await target.removeGraph(extra)
      },
      verify: () => {
        if (target.nodeCount(host) !== N + ADD) {
          throw new Error(`[flow] expected ${N + ADD} nodes after add, got ${target.nodeCount(host)}`)
        }
      },
    },
  )
  if (target.nodeCount(host) > N) await target.removeGraph(extra)

  // ── Op 5: pan + zoom × 60 ─────────────────────────────────────────────────
  let lastZoom = 1
  await bench(
    `pan+zoom ×${ZOOM_TICKS} ticks`,
    suite,
    async () => {
      for (let t = 1; t <= ZOOM_TICKS; t++) {
        lastZoom = 1 + t * 0.01
        const c = target.setViewport(-t * 3, -t * 2, lastZoom)
        if (c) await c
      }
    },
    {
      reset: () => target.setViewport(0, 0, 1),
      verify: () => {
        const tr = target.viewportTransform(host)
        if (!tr.includes(`scale(${lastZoom}`)) throw new Error(`[flow] viewport did not land: ${tr}`)
      },
    },
  )
  await target.setViewport(0, 0, 1)

  // ── Op 6: unmount ─────────────────────────────────────────────────────────
  await bench(
    `unmount ${N} nodes`,
    suite,
    () => {
      if (teardown) {
        ;(teardown as () => void)()
        teardown = null
      }
    },
    {
      reset: async () => {
        host.innerHTML = ''
        teardown = target.mount(host)
        if (target.settle) await target.settle()
        await target.ready()
        await verifyMounted()
      },
      verify: () => {
        if (target.nodeCount(host) !== 0) throw new Error('[flow] nodes survived unmount')
      },
    },
  )
  if (teardown) (teardown as () => void)()
  host.innerHTML = ''
  return suite
}
