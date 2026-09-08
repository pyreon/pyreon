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
 */
import { h as ph } from '@pyreon/core'
import { createFlow, Flow, flowStyles, type FlowEdge, type FlowInstance, type FlowNode } from '@pyreon/flow'
import { batch } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import {
  ReactFlow,
  ReactFlowProvider,
  type Edge as RfEdge,
  type Node as RfNode,
  type ReactFlowInstance,
} from '@xyflow/react'
import * as React from 'react'
import { flushSync as reactFlushSync } from 'react-dom'
import * as ReactDOM from 'react-dom/client'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'

export const FLOW_FRAMEWORKS = ['Pyreon', 'React Flow 12'] as const

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

interface FlowTarget {
  /** Mount the base graph. Returns the teardown. */
  mount(host: HTMLElement): () => void
  /** Resolves once the library is ready for imperative ops (React Flow: onInit). */
  ready(): Promise<void>
  nodeCount(host: HTMLElement): number
  edgeCount(host: HTMLElement): number
  nodeTransform(host: HTMLElement, id: string): string
  edgePath(host: HTMLElement): string
  moveNode(id: string, x: number, y: number): void
  select(id: string): void
  isSelected(host: HTMLElement, id: string): boolean
  clearSelection(): void
  addGraph(g: { nodes: GraphNode[]; edges: GraphEdge[] }): void
  removeGraph(g: { nodes: GraphNode[]; edges: GraphEdge[] }): void
  setViewport(x: number, y: number, zoom: number): void
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
      const element = React.createElement(
        ReactFlowProvider,
        null,
        React.createElement(ReactFlow, {
          defaultNodes: base.nodes.map(toNode),
          defaultEdges: base.edges.map(toEdge),
          onInit: (i: ReactFlowInstance) => {
            inst = i
            resolveReady()
          },
          fitView: false,
          proOptions: { hideAttribution: true },
        }),
      )
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

  // ── Op 1: mount ───────────────────────────────────────────────────────────
  let teardown: (() => void) | null = null
  await bench(
    `mount ${N} nodes + ${N - 1} edges`,
    suite,
    () => {
      teardown = target.mount(host)
    },
    {
      reset: () => {
        if (teardown) {
          teardown()
          teardown = null
        }
        host.innerHTML = ''
      },
      verify: verifyMounted,
    },
  )
  if (teardown) {
    ;(teardown as () => void)()
    teardown = null
  }
  host.innerHTML = ''

  // Steady-state graph for the update ops.
  teardown = target.mount(host)
  await target.ready()
  await verifyMounted()

  // ── Op 2: drag one node × 60 frames ───────────────────────────────────────
  const dragBase = base.nodes.find((n) => n.id === DRAG_ID)!
  let dragEnd = { x: dragBase.x, y: dragBase.y }
  let pathBefore = ''
  await bench(
    `drag one node ×${DRAG_FRAMES} frames (edges follow)`,
    suite,
    () => {
      for (let f = 1; f <= DRAG_FRAMES; f++) {
        dragEnd = { x: dragBase.x + f * 2, y: dragBase.y + f }
        target.moveNode(DRAG_ID, dragEnd.x, dragEnd.y)
      }
    },
    {
      reset: () => {
        target.moveNode(DRAG_ID, dragBase.x, dragBase.y)
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
  target.moveNode(DRAG_ID, dragBase.x, dragBase.y)

  // ── Op 3: select ──────────────────────────────────────────────────────────
  await bench(
    'select node',
    suite,
    () => {
      target.select(DRAG_ID)
    },
    {
      reset: () => target.clearSelection(),
      verify: () => {
        if (!target.isSelected(host, DRAG_ID)) throw new Error('[flow] node not selected')
      },
    },
  )
  target.clearSelection()

  // ── Op 4: add 50 nodes + 50 edges ─────────────────────────────────────────
  await bench(
    `add ${ADD} nodes + ${extra.edges.length} edges`,
    suite,
    () => {
      target.addGraph(extra)
    },
    {
      reset: () => {
        if (target.nodeCount(host) > N) target.removeGraph(extra)
      },
      verify: () => {
        if (target.nodeCount(host) !== N + ADD) {
          throw new Error(`[flow] expected ${N + ADD} nodes after add, got ${target.nodeCount(host)}`)
        }
      },
    },
  )
  if (target.nodeCount(host) > N) target.removeGraph(extra)

  // ── Op 5: pan + zoom × 60 ─────────────────────────────────────────────────
  let lastZoom = 1
  await bench(
    `pan+zoom ×${ZOOM_TICKS} ticks`,
    suite,
    () => {
      for (let t = 1; t <= ZOOM_TICKS; t++) {
        lastZoom = 1 + t * 0.01
        target.setViewport(-t * 3, -t * 2, lastZoom)
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
  target.setViewport(0, 0, 1)

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
