// Branch matrices for the Swift emit's `@pyreon/flow` native port surface —
// the parts that shipped after the earlier cov-swift-* passes:
//
//   * the `createFlow({...})` DECLARATION: every optional node / edge / config
//     field is appended ONLY when the source wrote it (so an unconfigured
//     `createFlow` emits byte-identically), and the config args are re-sorted
//     into the Swift init's declaration order;
//   * the call-site literal rebuilds — `addNode` / `addEdge` / `updateNode` /
//     `updateEdge` / the viewport + waypoint + reconnect family — each paired
//     with the shape that must NOT rebuild (it falls through to generic emit);
//   * the free path helpers (`getBezierPath` & co., `getEdgePath`,
//     `getHandlePosition`, `computeLayout`, the marker helpers), each paired
//     with the non-literal argument that must WARN rather than emit a call to
//     a web-only function.
//
// Emit-shape assertions only — no toolchain calls.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const sw = (src: string) => {
  const r = transform(src, { target: 'swift' })
  return { code: r.code, warnings: [...r.warnings] }
}

const FLOW_IMPORTS = `import { createFlow, computeLayout, getBezierPath, getSmoothStepPath, getStepPath, getStraightPath, getWaypointPath, resolveMarker, markerId, resolveEdgeMarkers, collectEdgeMarkers, getHandlePosition, getEdgePath, Position } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'`

/** A component with one `createFlow` binding and a `run` handler whose body is `body`. */
function flowRun(body: string, config = `nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: []`) {
  return sw(`${FLOW_IMPORTS}
export function App() {
  const flow = createFlow({ ${config} })
  const run = () => {
${body}
  }
  return (<Stack><Button onPress={run}>go</Button><Text>{() => String(flow.nodes().length)}</Text></Stack>)
}`)
}

/** The emitted `@State ... PyreonFlowState<...>(...)` line for a config. */
function flowDecl(config: string): { line: string; warnings: string[] } {
  const r = flowRun('    flow.fitView()', config)
  const line = r.code.split('\n').find((l) => l.includes('PyreonFlowState<')) ?? ''
  return { line, warnings: r.warnings }
}

describe('emit-swift createFlow declaration — optional node fields', () => {
  it('every optional node field is written when present, in the init order', () => {
    const { line } = flowDecl(`nodes: [{ id: '1', type: 'in', position: { x: 0, y: 0 }, data: { label: 'A' }, width: 10, height: 20, draggable: false, selectable: true, connectable: false, focusable: true, ariaLabel: 'n', hidden: false, deletable: true, class: 'c', style: 's', parentId: 'p', extent: [[0, 0], [10, 10]], expandParent: true, group: true, sourceHandles: [{ id: 'a', type: 'source', position: 'top' }], targetHandles: [{ type: 'target', position: 'left' }], zIndex: 3 }], edges: []`)
    expect(line).toContain(
      'PyreonFlowNode(id: "1", type: "in", position: PyreonXYPosition(x: 0, y: 0), data: __Obj0(label: "A"), width: 10, height: 20, draggable: false, selectable: true, connectable: false, focusable: true, ariaLabel: "n", hidden: false, deletable: true, className: "c", style: "s", parentId: "p", extent: PyreonFlowNodeExtent(minX: 0, minY: 0, maxX: 10, maxY: 10), expandParent: true, group: true, sourceHandles: [PyreonFlowHandleConfig(id: "a", type: "source", position: .top)], targetHandles: [PyreonFlowHandleConfig(type: "target", position: .left)], zIndex: 3)',
    )
  })

  it("`extent: 'parent'` becomes extentParent, and a bare node writes none of the optional fields", () => {
    const { line } = flowDecl(`nodes: [{ id: '2', position: { x: 1, y: 1 }, data: { label: 'B' }, extent: 'parent' }, { id: '3', position: { x: 1, y: 1 }, data: { label: 'C' } }], edges: []`)
    expect(line).toContain('data: __Obj0(label: "B"), extentParent: true)')
    expect(line).toContain('PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 1, y: 1), data: __Obj0(label: "C"))')
    expect(line).not.toContain('extent: PyreonFlowNodeExtent')
  })
})

describe('emit-swift createFlow declaration — optional edge fields', () => {
  it('every optional edge field is written, portable data is typed, and a null markerEnd is nil + specified', () => {
    const { line } = flowDecl(`nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [{ id: 'e', source: '1', target: '2', sourceHandle: 'a', targetHandle: 'b', type: 'step', label: 'L', animated: true, focusable: true, ariaLabel: 'x', hidden: false, deletable: true, reconnectable: false, interactionWidth: 4, class: 'k', style: 'st', data: { w: 1, s: 'x', b: true, n: null, a: [1, 2], o: { q: 1 } }, pathOptions: { curvature: 0.5, borderRadius: 2, offset: 3 }, markerStart: { type: 'arrow', color: 'red', width: 1, height: 2, strokeWidth: 3 }, markerEnd: null, waypoints: [{ x: 1, y: 2 }], zIndex: 1 }]`)
    expect(line).toContain('sourceHandle: "a", targetHandle: "b", type: "step", label: "L", animated: true, animatedSpecified: true')
    expect(line).toContain('reconnectable: false, interactionWidth: 4, className: "k", style: "st"')
    expect(line).toContain(
      'data: PyreonFlowData(["w": .number(1), "s": .string("x"), "b": .bool(true), "n": .null, "a": .array([.number(1), .number(2)]), "o": .object(PyreonFlowData(["q": .number(1)]))])',
    )
    expect(line).toContain('curvature: 0.5, borderRadius: 2, pathOffset: 3')
    expect(line).toContain('markerStart: PyreonFlowMarker(type: "arrow", color: "red", width: 1, height: 2, strokeWidth: 3), markerEnd: nil, markerEndSpecified: true')
    expect(line).toContain('waypoints: [PyreonXYPosition(x: 1, y: 2)], zIndex: 1)')
  })

  it('a minimal edge writes only id/source/target', () => {
    const { line } = flowDecl(`nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [{ id: 'e', source: '1', target: '2' }]`)
    expect(line).toContain('PyreonFlowEdge(id: "e", source: "1", target: "2")')
  })
})

describe('emit-swift createFlow declaration — config arguments', () => {
  it('config options are appended and re-sorted into the Swift init order', () => {
    const { line, warnings } = flowDecl(`nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [],
      minZoom: 0.1, maxZoom: 4, snapToGrid: true, snapGrid: 10, nodeExtent: [[0, 0], [100, 100]], defaultMarkerEnd: null,
      nodesDraggable: true, panOnScrollSpeed: 2, zoomable: true, selectionMode: 'full', connectionMode: 'loose', elevateNodesOnSelect: true, autoPanSpeed: 5, multiSelect: true, edgeInteractionWidth: 3, connectionRadius: 9, defaultEdgeType: 'step', connectionLineType: 'bezier',
      fitView: true, fitViewPadding: 0.2, historyLimit: 5, reducedMotion: true, deleteKeys: ['Delete'], multiSelectionKey: null, preventScrolling: false`)
    expect(line).toContain('minZoom: 0.1, maxZoom: 4, snapToGrid: true, snapGrid: 10, nodeExtent: PyreonFlowNodeExtent(minX: 0, minY: 0, maxX: 100, maxY: 100), defaultMarkerEnd: nil')
    // edgeInteractionWidth / connectionRadius were written AFTER panOnScrollSpeed
    // in the source; the init declares them first, so the sort moves them.
    expect(line).toContain('nodesDraggable: true, edgeInteractionWidth: 3, connectionRadius: 9, panOnScrollSpeed: 2, zoomable: true')
    expect(line).toContain('selectionMode: "full", connectionMode: "loose", elevateNodesOnSelect: true, autoPanSpeed: 5, multiSelect: true')
    expect(line).toContain('defaultEdgeType: "step", connectionLineType: "bezier"')
    expect(line).toContain('fitView: true, fitViewPadding: 0.2, historyLimit: 5')
    // The row type has a `label` field → the search accessor is synthesised.
    expect(line).toContain('searchText: { $0.label }')
    expect(line).toContain('reducedMotion: true, deleteKeys: ["Delete"], multiSelectionKey: nil, preventScrolling: false')
    expect(warnings.filter((w) => w.includes('createFlow declaration'))).toEqual([])
  })

  it('a literal marker defaultMarkerEnd and a null deleteKeys lower to their Swift forms', () => {
    const { line } = flowDecl(`nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [], defaultMarkerEnd: { type: 'arrowclosed' }, deleteKeys: null`)
    expect(line).toContain('defaultMarkerEnd: PyreonFlowMarker(type: "arrowclosed")')
    expect(line).toContain('deleteKeys: nil')
  })

  it('defaultEdgeOptions: every field is written when present', () => {
    const { line } = flowDecl(`nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [], defaultEdgeOptions: { type: 'step', label: 'l', animated: true, focusable: true, ariaLabel: 'a', hidden: false, deletable: true, reconnectable: true, interactionWidth: 2, pathOptions: { curvature: 1, borderRadius: 2, offset: 3 }, markerStart: { type: 'arrowclosed' }, markerEnd: null }`)
    expect(line).toContain(
      'defaultEdgeOptions: PyreonFlowDefaultEdgeOptions(type: "step", label: "l", animated: true, focusable: true, ariaLabel: "a", hidden: false, deletable: true, reconnectable: true, interactionWidth: 2, curvature: 1, borderRadius: 2, pathOffset: 3, markerStart: PyreonFlowMarker(type: "arrowclosed"), markerEnd: nil, markerEndSpecified: true)',
    )
  })

  it('defaultEdgeOptions with a literal marker end writes the marker, not nil', () => {
    const { line } = flowDecl(`nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [], defaultEdgeOptions: { markerEnd: { type: 'arrow', color: 'blue' } }`)
    expect(line).toContain('PyreonFlowDefaultEdgeOptions(markerEnd: PyreonFlowMarker(type: "arrow", color: "blue"), markerEndSpecified: true)')
  })

  it('an unrecognized key-modifier value is NAMED rather than emitted', () => {
    const { line, warnings } = flowDecl(`nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [], selectionKey: 'Hyper'`)
    expect(line).not.toContain('selectionKey')
    expect(warnings.some((w) => w.includes('selectionKey (expected shift, ctrl, meta, alt, or null)'))).toBe(true)
  })

  it('an unconfigured createFlow carries no config arguments at all', () => {
    const { line } = flowDecl(`nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: []`)
    // Only the row-derived search accessor, which every labelled row gets.
    expect(line).toMatch(/edges: \[\], searchText: \{ \$0\.label \}\)$/)
  })
})

describe('emit-swift flow path helpers — literal lowering vs named decline', () => {
  const helpers = () =>
    flowRun(`    const a = getBezierPath({ sourceX: 0, sourceY: 0, targetX: 1, targetY: 1, sourcePosition: Position.Left, targetPosition: 'right', curvature: 0.3 })
    const b = getSmoothStepPath({ sourceX: 0, sourceY: 0, targetX: 1, targetY: 1, borderRadius: 4, offset: 2 })
    const c = getStepPath({ sourceX: 0, sourceY: 0, targetX: 1, targetY: 1, offset: 2 })
    const d = getStraightPath({ sourceX: 0, sourceY: 0, targetX: 1, targetY: 1 })
    const w = getWaypointPath({ sourceX: 0, sourceY: 0, targetX: 1, targetY: 1, waypoints: [{ x: 1, y: 2 }] })
    const s = getSmoothStepPath({ sourceX: 0, sourceY: 0, targetX: 1, targetY: 1 })`)

  it('each path helper lowers to its pyreon* twin, defaulting absent positions to bottom/top', () => {
    const { code } = helpers()
    expect(code).toContain('let a = pyreonBezierPath(sourceX: 0, sourceY: 0, sourcePosition: .left, targetX: 1, targetY: 1, targetPosition: .right, curvature: 0.3)')
    expect(code).toContain('let b = pyreonSmoothStepPath(sourceX: 0, sourceY: 0, sourcePosition: .bottom, targetX: 1, targetY: 1, targetPosition: .top, borderRadius: 4, offset: 2)')
    expect(code).toContain('let c = pyreonStepPath(sourceX: 0, sourceY: 0, sourcePosition: .bottom, targetX: 1, targetY: 1, targetPosition: .top, offset: 2)')
    expect(code).toContain('let d = pyreonStraightPath(sourceX: 0, sourceY: 0, targetX: 1, targetY: 1)')
    expect(code).toContain('let w = pyreonWaypointPath(sourceX: 0, sourceY: 0, targetX: 1, targetY: 1, waypoints: [PyreonXYPosition(x: 1, y: 2)])')
    expect(code).toContain('let s = pyreonSmoothStepPath(sourceX: 0, sourceY: 0, sourcePosition: .bottom, targetX: 1, targetY: 1, targetPosition: .top)\n')
  })

  it('a missing required coordinate, an unknown key, a non-literal position and a bad waypoint all WARN', () => {
    const { code, warnings } = flowRun(`    const a = getStraightPath({ sourceX: 0, sourceY: 0, targetX: 1 })
    const b = getBezierPath({ sourceX: 0, sourceY: 0, targetX: 1, targetY: 1, sourcePosition: 'middle' })
    const c = getWaypointPath({ sourceX: 0, sourceY: 0, targetX: 1, targetY: 1, waypoints: [1] })
    const d = getStraightPath({ sourceX: 0, sourceY: 0, targetX: 1, targetY: 1, zz: 1 })
    const e = getWaypointPath({ sourceX: 0, sourceY: 0, targetX: 1, targetY: 1, waypoints: pts })
    const f = getStepPath(opts)`)
    expect(code).not.toContain('let a = pyreon')
    expect(code).not.toContain('let e = pyreon')
    expect(warnings.filter((w) => w === 'getStraightPath requires one supported object-literal parameter to lower natively.')).toHaveLength(2)
    expect(warnings).toContain('getBezierPath requires one supported object-literal parameter to lower natively.')
    expect(warnings).toContain('getWaypointPath requires one supported object-literal parameter to lower natively.')
    expect(warnings).toContain('getStepPath requires one supported object-literal parameter to lower natively.')
  })

  it('a position given as a call expression is passed through verbatim', () => {
    const { code } = flowRun(`    const a = getBezierPath({ sourceX: 0, sourceY: 0, targetX: 1, targetY: 1, sourcePosition: pick(1) })`)
    expect(code).toContain('pyreonBezierPath(sourceX: 0, sourceY: 0, sourcePosition: pick(1), targetX: 1')
  })

  it('getHandlePosition / getEdgePath lower with a literal Position and warn without one', () => {
    const { code, warnings } = flowRun(`    const h = getHandlePosition(Position.Top, 0, 0, 10, 10)
    const h2 = getHandlePosition(side, 0, 0, 10, 10)
    const p = getEdgePath('step', 0, 0, Position.Top, 1, 1, 'bottom', { borderRadius: 2 })
    const p2 = getEdgePath('step', 0, 0, Position.Top, 1, 1, 'bottom')
    const p3 = getEdgePath('step', 0, 0, 3, 1, 1, 'bottom')
    const p4 = getEdgePath('step', 0, 0, 'top', 1, 1, 'bottom', { junk: 1 })`)
    expect(code).toContain('let h = pyreonHandlePosition(.top, nodeX: 0, nodeY: 0, nodeWidth: 10, nodeHeight: 10)')
    expect(code).toContain('let h2 = getHandlePosition(side, 0, 0, 10, 10)')
    expect(code).toContain('let p = pyreonEdgePath(type: "step", sourceX: 0, sourceY: 0, sourcePosition: .top, targetX: 1, targetY: 1, targetPosition: .bottom, borderRadius: 2)')
    expect(code).toContain('let p2 = pyreonEdgePath(type: "step", sourceX: 0, sourceY: 0, sourcePosition: .top, targetX: 1, targetY: 1, targetPosition: .bottom)\n')
    expect(code).not.toContain('let p3 = pyreon')
    expect(code).not.toContain('let p4 = pyreon')
    expect(warnings).toContain('getHandlePosition requires a literal Position value to lower natively.')
    expect(warnings.filter((w) => w.startsWith('getEdgePath requires literal Position values'))).toHaveLength(2)
  })

  it('computeLayout: literal options lower, absent options drop, unsupported options warn', () => {
    const { code, warnings } = flowRun(`    const l = computeLayout(flow.nodes(), flow.edges(), 'layered', { direction: 'DOWN', nodeSpacing: 5 })
    const l2 = computeLayout(flow.nodes(), flow.edges())
    const l3 = computeLayout(flow.nodes(), flow.edges(), 'layered', { bogus: 1 })`)
    expect(code).toContain('let l = pyreonComputeFlowLayout(flow.nodes, edges: flow.edges, algorithm: "layered", options: PyreonFlowLayoutOptions(direction: "DOWN", nodeSpacing: 5))')
    expect(code).toContain('let l2 = pyreonComputeFlowLayout(flow.nodes, edges: flow.edges)\n')
    expect(code).not.toContain('let l3 = pyreon')
    expect(warnings).toContain('computeLayout options must be an object literal using direction/nodeSpacing/layerSpacing/animate/animationDuration to lower natively.')
  })

  it('the marker helpers rebuild string / object / null markers and pass a non-marker through', () => {
    const { code } = flowRun(`    const m1 = resolveMarker('Arrow')
    const m2 = markerId({ type: 'arrowclosed', color: 'red', width: 2 })
    const m3 = resolveEdgeMarkers(flow.edges(), null)
    const m4 = collectEdgeMarkers(flow.edges(), { type: 'dot' })
    const m5 = resolveMarker(MarkerType.ArrowClosed)
    const m6 = markerId({ type: MarkerType.Arrow, height: 3, strokeWidth: 1 })`)
    expect(code).toContain('let m1 = pyreonResolveFlowMarker(PyreonFlowMarker(type: "arrow"))')
    expect(code).toContain('let m2 = pyreonFlowMarkerId(PyreonFlowMarker(type: "arrowclosed", color: "red", width: 2))')
    expect(code).toContain('let m3 = pyreonResolveFlowEdgeMarkers(flow.edges, defaultMarkerEnd: nil)')
    // `dot` is not a native marker type → the literal recognizer declines.
    expect(code).toContain('let m4 = pyreonCollectFlowEdgeMarkers(flow.edges, defaultMarkerEnd: __Obj')
    expect(code).toContain('let m5 = pyreonResolveFlowMarker(PyreonFlowMarker(type: "arrowclosed"))')
    expect(code).toContain('let m6 = pyreonFlowMarkerId(PyreonFlowMarker(type: "arrow", height: 3, strokeWidth: 1))')
  })
})

describe('emit-swift flow member calls — addNode / addEdge literal rebuild', () => {
  it('addNode with every optional field, extent parent, and a non-literal handle list', () => {
    const { code, warnings } = flowRun(`    flow.addNode({ id: '9', type: 't', position: { x: 1, y: 2 }, data: { label: 'q' }, width: 1, height: 2, draggable: true, selectable: false, connectable: true, focusable: true, ariaLabel: 'a', hidden: false, deletable: true, class: 'c', style: 's', parentId: 'p', extent: [[0, 0], [1, 1]], expandParent: true, group: true, sourceHandles: [{ id: 'h', type: 'source', position: 'top' }], targetHandles: hs, zIndex: 2 })
    flow.addNode({ id: '8', position: { x: 1, y: 2 }, data: { label: 'q' }, extent: 'parent' })
    flow.addNode({ id: '7', position: { x: 1, y: 2 }, data: { label: 'q' }, extent: 'bad' })`)
    expect(code).toContain(
      'flow.addNode(PyreonFlowNode(id: "9", type: "t", position: PyreonXYPosition(x: 1, y: 2), data: __Obj0(label: "q"), width: 1, height: 2, draggable: true, selectable: false, connectable: true, focusable: true, ariaLabel: "a", hidden: false, deletable: true, className: "c", style: "s", parentId: "p", extent: PyreonFlowNodeExtent(minX: 0, minY: 0, maxX: 1, maxY: 1), expandParent: true, group: true, sourceHandles: [PyreonFlowHandleConfig(id: "h", type: "source", position: .top)], targetHandles: hs, zIndex: Double(2)))',
    )
    expect(code).toContain('flow.addNode(PyreonFlowNode(id: "8", position: PyreonXYPosition(x: 1, y: 2), data: __Obj0(label: "q"), extentParent: true))')
    // A bad extent is dropped AND named.
    expect(code).toContain('flow.addNode(PyreonFlowNode(id: "7", position: PyreonXYPosition(x: 1, y: 2), data: __Obj0(label: "q")))')
    expect(warnings.some((w) => w.includes('addNode(...): node field `extent` must be'))).toBe(true)
  })

  it('addEdge without an id synthesises one from source/target/handles; every optional field lowers', () => {
    const { code } = flowRun(`    flow.addEdge({ source: '1', target: '2', sourceHandle: 'a', targetHandle: 'b', type: 't', label: 'l', animated: true, focusable: true, ariaLabel: 'x', hidden: false, deletable: true, reconnectable: true, interactionWidth: 3, class: 'c', style: 's', data: { k: 1 }, pathOptions: { curvature: 1, offset: 2, bogus: 3 }, markerStart: 'arrow', markerEnd: { type: 'arrowclosed', color: 'red' }, waypoints: [{ x: 1, y: 2 }], zIndex: 1 })`)
    expect(code).toContain('PyreonFlowEdge(id: pyreonFlowEdgeId(source: "1", target: "2", sourceHandle: "a", targetHandle: "b"), source: "1", target: "2", sourceHandle: "a", targetHandle: "b"')
    expect(code).toContain('animated: true, animatedSpecified: true, focusable: true, ariaLabel: "x", hidden: false, deletable: true, reconnectable: true, interactionWidth: 3, className: "c", style: "s"')
    // `offset` is renamed; the unknown pathOptions key is dropped.
    expect(code).toContain('data: PyreonFlowData(["k": .number(1)]), curvature: 1, pathOffset: 2, markerStart: PyreonFlowMarker(type: "arrow")')
    expect(code).not.toContain('bogus')
    expect(code).toContain('markerEnd: PyreonFlowMarker(type: "arrowclosed", color: "red"), markerEndSpecified: true, waypoints: [PyreonXYPosition(x: 1, y: 2)], zIndex: Double(1)))')
  })

  it('non-portable data warns, a null markerStart and an unsupported markerEnd drop, non-literal waypoints pass through', () => {
    const { code, warnings } = flowRun(`    flow.addEdge({ id: 'e', source: '1', target: '2', data: { k: compute() }, markerStart: null, markerEnd: { type: 'dot' }, waypoints: pts })`)
    expect(code).toContain('flow.addEdge(PyreonFlowEdge(id: "e", source: "1", target: "2", waypoints: pts))')
    expect(warnings).toContain('createFlow binding `flow` addEdge(...): edge `data` must be a static JSON-compatible object to lower natively.')
  })

  it('a member-expression marker (MarkerType.Arrow) is recognised on the call site', () => {
    const { code } = flowRun(`    flow.addEdge({ id: 'e', source: '1', target: '2', markerStart: MarkerType.Arrow })`)
    expect(code).toContain('markerStart: PyreonFlowMarker(type: "arrow")')
  })

  it('addNodes / setNodes / addEdges / setEdges rebuild a literal list and fall through when any item cannot', () => {
    const { code } = flowRun(`    flow.addNodes([{ id: '5', position: { x: 1, y: 2 }, data: { label: 'q' } }])
    flow.setNodes([{ id: '5', data: { label: 'q' } }])
    flow.addEdges([{ source: 'a', target: 'b' }])
    flow.setEdges([{ source: 'a' }])
    flow.setNodes(ns)`)
    expect(code).toContain('flow.addNodes([PyreonFlowNode(id: "5", position: PyreonXYPosition(x: 1, y: 2), data: __Obj0(label: "q"))])')
    expect(code).not.toContain('flow.setNodes([PyreonFlowNode')
    expect(code).toContain('flow.addEdges([PyreonFlowEdge(id: pyreonFlowEdgeId(source: "a", target: "b"), source: "a", target: "b")])')
    expect(code).not.toContain('flow.setEdges([PyreonFlowEdge')
    expect(code).toContain('flow.setNodes(ns)')
  })
})

describe('emit-swift flow member calls — updateNode / updateEdge patches', () => {
  it('updateNode maps each patch field to a mutation, and names the id change + dropped field', () => {
    const { code, warnings } = flowRun(`    flow.updateNode('1', { id: 'x', position: { x: 1, y: 2 }, data: { label: 'q' }, sourceHandles: [{ type: 'source', position: 'top' }], extent: 'parent', class: 'c', hidden: true, bogus: 1 })
    flow.updateNode('1', { extent: [[0, 0], [5, 5]], position: p, targetHandles: hs })
    flow.updateNode('1', { extent: 'nope' })`)
    expect(code).toContain(
      'flow.updateNode("1") { node in node.position = PyreonXYPosition(x: 1, y: 2); node.data.label = "q"; node.sourceHandles = [PyreonFlowHandleConfig(type: "source", position: .top)]; node.extent = nil; node.extentParent = true; node.className = "c"; node.hidden = true }',
    )
    // Non-literal position / handles drop their mutation; a static extent resets extentParent.
    expect(code).toContain('flow.updateNode("1") { node in node.extent = PyreonFlowNodeExtent(minX: 0, minY: 0, maxX: 5, maxY: 5); node.extentParent = false }')
    expect(warnings).toContain('createFlow binding `flow` updateNode(...): changing a node id is not supported natively; the original id is preserved.')
    expect(warnings.some((w) => w.includes('updateNode(...): node field `bogus`'))).toBe(true)
    expect(warnings.some((w) => w.includes('updateNode(...): node field `extent` must be'))).toBe(true)
  })

  it('updateEdge maps pathOptions / markers / animated / waypoints / data / class', () => {
    const { code, warnings } = flowRun(`    flow.updateEdge('e', { id: 'y', pathOptions: { curvature: 2, offset: 1, junk: 2 }, markerStart: 'arrow', markerEnd: null, animated: true, waypoints: [{ x: 1, y: 1 }], data: { a: 1 }, class: 'k', hidden: true, zz: 1 })
    flow.updateEdge('e', { data: { a: compute() }, markerStart: compute(), waypoints: pts })`)
    expect(code).toContain(
      'flow.updateEdge("e") { edge in edge.curvature = 2; edge.pathOffset = 1; edge.markerStart = PyreonFlowMarker(type: "arrow"); edge.markerEnd = nil; edge.markerEndSpecified = true; edge.animated = true; edge.animatedSpecified = true; edge.waypoints = [PyreonXYPosition(x: 1, y: 1)]; edge.data = PyreonFlowData(["a": .number(1)]); edge.className = "k"; edge.hidden = true }',
    )
    expect(code).toContain('flow.updateEdge("e") { edge in  }')
    expect(warnings).toContain('createFlow binding `flow` updateEdge(...): changing an edge id is not supported natively; the original id is preserved.')
    expect(warnings).toContain('createFlow binding `flow` updateEdge(...): edge `data` must be a static JSON-compatible object to lower natively.')
  })

  it('updateNodeData: an object patch and a node-reading callback', () => {
    const { code } = flowRun(`    flow.updateNodeData('1', { label: 'z' })
    flow.updateNodeData('1', (n) => ({ label: n.data.label }))`)
    expect(code).toContain('flow.updateNodeData("1") { data in data.label = "z" }')
    expect(code).toContain('flow.updateNodeDataFromNode("1") { node in var data = node.data; data.label = node.data.label; return data }')
  })
})

describe('emit-swift flow member calls — viewport, waypoints, reconnect, extent', () => {
  it('each literal argument is rebuilt with the labelled native parameter', () => {
    const { code } = flowRun(`    flow.onConnectStart(() => {})
    flow.onConnectStart((c) => {})
    flow.fitView(['1'], 10, { duration: 200 })
    flow.paste({ x: 1, y: 2 })
    flow.getIntersectingNodes({ x: 0, y: 0, width: w, height: 5 }, true)
    flow.isNodeIntersecting('1', { x: 0, y: 0, width: 1, height: 1 })
    flow.panTo({ x: 1, y: 2 })
    flow.zoomTo(2, { duration: 100 })
    flow.zoomTo(2)
    flow.zoomIn({ duration: 3 })
    flow.zoomOut()
    flow.addEdgeWaypoint('e', { x: 1, y: 2 }, 0)
    flow.addEdgeWaypoint('e', { x: 1, y: 2 })
    flow.updateEdgeWaypoint('e', 0, { x: 1, y: 2 })
    flow.reconnectEdge('e', { source: 'a', targetHandle: 'b' })
    flow.isValidConnection({ source: 'a', target: 'b', sourceHandle: 'x', targetHandle: 'y' })
    flow.setViewport({ x: 1, y: 2, zoom: 1 }, { duration: 5 })
    flow.setViewport({ x: 1 })
    flow.animateViewport({ x: 1, zoom: 2 }, 300)
    flow.animateViewport({ x: 1 })
    flow.layout()
    flow.layout('tree')
    flow.layout('tree', { direction: 'RIGHT', bogus: 1, animate: true })
    flow.setCenter(1, 2, { zoom: 2 })
    flow.setCenter(1, 2)
    flow.setNodeExtent(null)
    flow.setNodeExtent([[0, 0], [1, 1]])
    flow.clampToExtent({ x: 1, y: 2 }, 3)
    flow.getSnapLines('1', { x: 1, y: 2 }, 4)
    flow.getSnapLines('1', { x: 1, y: 2 })`)
    const want = [
      // A zero-parameter listener still receives the event argument natively.
      'flow.onConnectStart({ _ in',
      'flow.onConnectStart({ c in',
      'flow.fitView(["1"], padding: 10, duration: 200)',
      'flow.paste(PyreonXYPosition(x: 1, y: 2))',
      'flow.getIntersectingNodes(PyreonFlowRect(x: 0, y: 0, width: Double(w), height: 5), partially: true)',
      'flow.isNodeIntersecting("1", PyreonFlowRect(x: 0, y: 0, width: 1, height: 1))\n',
      'flow.panTo(PyreonXYPosition(x: 1, y: 2))',
      'flow.zoomTo(2, duration: 100)',
      'flow.zoomTo(2)\n',
      'flow.zoomIn(duration: 3)',
      'flow.zoomOut()',
      'flow.addEdgeWaypoint("e", PyreonXYPosition(x: 1, y: 2), 0)',
      'flow.addEdgeWaypoint("e", PyreonXYPosition(x: 1, y: 2))\n',
      'flow.updateEdgeWaypoint("e", 0, PyreonXYPosition(x: 1, y: 2))',
      'flow.reconnectEdge("e", source: "a", targetHandle: "b")',
      'flow.isValidConnection(PyreonFlowConnection(source: "a", target: "b", sourceHandle: "x", targetHandle: "y"))',
      'flow.setViewport(x: 1, y: 2, zoom: 1, duration: 5)',
      'flow.setViewport(x: 1)\n',
      'flow.animateViewport(x: 1, zoom: 2, duration: 300)',
      'flow.animateViewport(x: 1)\n',
      'flow.layout()\n',
      'flow.layout("tree")\n',
      // An unsupported layout option is dropped, the supported ones kept.
      'flow.layout("tree", options: PyreonFlowLayoutOptions(direction: "RIGHT", animate: true))',
      'flow.setCenter(1, 2, zoom: 2)',
      'flow.setCenter(1, 2)\n',
      'flow.clearNodeExtent()',
      'flow.setNodeExtent(minX: 0, minY: 0, maxX: 1, maxY: 1)',
      'flow.clampToExtent(PyreonXYPosition(x: 1, y: 2), 3)',
      'flow.getSnapLines("1", PyreonXYPosition(x: 1, y: 2), threshold: 4)',
      'flow.getSnapLines("1", PyreonXYPosition(x: 1, y: 2))\n',
    ]
    for (const w of want) expect(code, w).toContain(w)
  })

  it('a non-literal / unsupported argument falls through to the generic emit', () => {
    const { code } = flowRun(`    flow.fitView(['1'], 10, { zz: 1 })
    flow.paste(pos)
    flow.reconnectEdge('e', { zz: 'a' })
    flow.isValidConnection({ source: 'a' })
    flow.getIntersectingNodes('1')
    flow.setViewport({ x: 1, junk: 2 })
    flow.setCenter(1, 2, { junk: 1 })
    flow.setNodeExtent([[0, 0]])
    flow.layout('tree', opts)`)
    expect(code).not.toContain('padding: 10')
    expect(code).toContain('flow.paste(pos)')
    expect(code).not.toContain('flow.reconnectEdge("e", zz:')
    expect(code).not.toContain('PyreonFlowConnection(source: "a")')
    expect(code).toContain('flow.getIntersectingNodes("1")')
    expect(code).not.toContain('flow.setViewport(x: 1, junk')
    expect(code).not.toContain('flow.setCenter(1, 2, junk')
    expect(code).not.toContain('flow.setNodeExtent(minX')
    expect(code).not.toContain('options: PyreonFlowLayoutOptions')
  })

  it('nodeMap / edgeMap / measurements lookups become dictionary subscripts', () => {
    const { code } = flowRun(`    const v = flow.nodeMap().get('1')
    const hv = flow.edgeMap().has('1')
    const mm = flow.measurements().get('1')`)
    expect(code).toContain('let v = flow.nodeLookup["1"]')
    expect(code).toContain('let hv = (flow.edgeLookup["1"] != nil)')
    expect(code).toContain('let mm = flow.measurements["1"]')
  })

  it('a signal write on nodes / edges rebuilds a literal or forwards the value', () => {
    const { code } = flowRun(`    flow.nodes.set([{ id: '5', position: { x: 1, y: 2 }, data: { label: 'q' } }])
    flow.edges.set(es)`)
    expect(code).toContain('flow.setNodes([PyreonFlowNode(id: "5", position: PyreonXYPosition(x: 1, y: 2), data: __Obj0(label: "q"))])')
    expect(code).toContain('flow.setEdges(es)')
  })
})

describe('emit-swift <Flow> host and flow renderer building blocks', () => {
  const HOST = `import { createFlow, Flow, Handle, NodeToolbar, BaseEdge, EdgeText, ViewportPortal, Background, Controls, MiniMap, Panel, getStraightPath, type EdgeComponentProps } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
function CardNode(props: { id: string }) {
  return <Stack><Handle type="source" position="top" style="color: red" class="h" /><NodeToolbar class="tb" style="x" /><Text>card</Text></Stack>
}
function Loose() { return <NodeToolbar /> }
function Edge1(props: EdgeComponentProps) {
  return <>
    <path d={props.path()} stroke={color()} strokeWidth={width()} fill={fillc()} />
    <path />
    <EdgeText label="t" />
    <EdgeText x={1} y={2} label={name()} />
    <ViewportPortal><Text>x</Text></ViewportPortal>
    <BaseEdge path={pathOf(props)} stroke={color()} strokeWidth={width()} />
    <BaseEdge />
  </>
}
const mm = (n) => '#fff'
export function Diagram() {
  const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  return (<Stack>
    <Flow instance={flow} nodeTypes={{ card: CardNode }} edgeTypes={{ e1: Edge1 }} connectionLine={() => null} ariaLabel="diagram" colorMode="dark">
      <Background variant="lines" gap={g()} size={2} />
      <Controls position={corner()} showLock={true} />
      <MiniMap nodeColor={mm} maskColor={mm} width={w()} />
      <Panel position={pos()}><Text>p</Text></Panel>
      <Panel position="bottom-left"><Text>q</Text></Panel>
      <Text>other</Text>
    </Flow>
    <Flow instance={flow} nodeTypes={types} edgeTypes={etypes}><Background variant={v()} /><Controls position="top-left" /></Flow>
    <Flow />
    <Controls />
    <Controls instance={flow} />
  </Stack>)
}`
  const r = sw(HOST)

  it('<Handle> / <NodeToolbar> browser CSS is named', () => {
    for (const w of ['<Handle style>', '<Handle class>', '<NodeToolbar style>', '<NodeToolbar class>']) {
      expect(r.warnings.some((x) => x.startsWith(w)), w).toBe(true)
    }
  })

  it('custom-edge <path>: an accessor path keeps its segments, dynamic paint is converted, a d-less path is dropped by name', () => {
    expect(r.code).toContain('PyreonFlowCustomEdgePath(result: path(), color: color, width: Double(width), fill: fillc)')
    expect(r.warnings.some((w) => w.startsWith('A native Flow <path> needs a `d` attribute'))).toBe(true)
  })

  it('<EdgeText> without x/y is dropped by name; with them it lowers', () => {
    expect(r.code).toContain('PyreonFlowEdgeText(x: Double(1), y: Double(2), label: name)')
    expect(r.warnings).toContain('A native Flow <EdgeText> needs `x`, `y` and `label`; it was dropped.')
  })

  it('<ViewportPortal> is named; a path-less <BaseEdge> is named; a call-valued path is parsed as SVG data', () => {
    expect(r.warnings.some((w) => w.startsWith('<ViewportPortal> positions arbitrary content'))).toBe(true)
    expect(r.warnings).toContain('A native Flow <BaseEdge> needs a `path`; without one there is nothing to draw.')
    expect(r.code).toContain('PyreonFlowBaseEdgePath(result: PyreonFlowPathResult(svgPath: pathOf(props)), color: nil, width: 1.5)')
  })

  it('host chrome: background / controls / minimap / aria / colour mode / panels / extra children', () => {
    expect(r.code).toContain('background: PyreonFlowBackgroundStyle(variant: .lines, gap: Double(g), size: 2, color: nil)')
    expect(r.code).toContain('position: PyreonFlowControlsPosition.from(corner)')
    // A callback maskColor cannot be a colour → default; a callback nodeColor travels separately.
    expect(r.code).toContain('miniMap: PyreonFlowMiniMapStyle(nodeColor: nil, maskColor: "#000000", width: Double(w), height: 150')
    expect(r.code).toContain('miniMapNodeColor: mm, ariaLabel: "diagram", colorMode: "dark"')
    expect(r.code).toContain('customEdgeTypes: Set(["e1"])')
    expect(r.code).toContain('.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)')
    expect(r.code).toContain('.pyreonFlowColorMode("dark")')
    expect(r.warnings).toContain('<Panel position={…}> must be a string literal to lower natively; top-left is used.')
    expect(r.warnings.some((w) => w.startsWith('<Flow connectionLine={…}> must reference a component identifier'))).toBe(true)
  })

  it('non-literal nodeTypes / edgeTypes maps and a dynamic Background variant', () => {
    expect(r.warnings.some((w) => w.startsWith('<Flow nodeTypes={…}> must be a literal'))).toBe(true)
    expect(r.warnings.some((w) => w.startsWith('<Flow edgeTypes={…}> must be a literal'))).toBe(true)
    expect(r.code).toContain('PyreonFlowBackgroundStyle(variant: .from(v)')
    expect(r.code).toContain('position: .topLeft)')
    expect(r.code).toContain('selected: flow.isNodeSelected(pyreonNode.id))')
  })

  it('<Flow> / standalone <Controls> without an instance are dropped by name', () => {
    expect(r.warnings).toContain('<Flow> requires `instance={flow}` for native lowering — the host was dropped.')
    expect(r.warnings).toContain('<Controls> outside <Flow> requires `instance={flow}` for native lowering; it was dropped.')
    expect(r.code).toContain('PyreonStandaloneFlowControls(state: flow, style: PyreonFlowControlsStyle(')
  })

  // KNOWN BUG (reported): `<path d={p.path}>` where `p` is a LOCAL path-helper
  // result emits `result: path()` — the connection-line accessor spelling — so
  // the edge component references a `path` function it does not have and fails
  // swiftc, with no warning. Kotlin has the same arm. The helper result `p`
  // itself (or `PyreonFlowPathResult(svgPath: p.path)`, which BaseEdge uses)
  // is what should reach `result:`.
  it.fails('a LOCAL helper-result `p.path` reaches result: as the local, not as `path()`', () => {
    const out = sw(`import { createFlow, Flow, getStraightPath, type EdgeComponentProps } from '@pyreon/flow'
function Wire(props: EdgeComponentProps) {
  const p = getStraightPath({ sourceX: props.sourceX(), sourceY: props.sourceY(), targetX: props.targetX(), targetY: props.targetY() })
  return <path d={p.path} />
}
export function Diagram() {
  const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [{ id: 'ab', source: 'a', target: 'a', type: 'w' }] })
  return <Flow instance={flow} edgeTypes={{ w: Wire }} />
}`)
    expect(out.code).not.toContain('result: path()')
  })
})

/** A component rendering chart hosts with row data in scope. */
function charts(els: string) {
  return sw(`import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { RadarChart, BoxplotChart } from '@pyreon/charts'
import { HeatmapChart, CandlestickChart, PlotChart, bars, visualMap } from '@pyreon/charts/engine'
export function C() {
  const rows = signal<{ x: string; y: string; v: number; o: number; h: number; l: number; c: number; vals: number[]; name: string }[]>([])
  const axes = signal<string[]>(['a', 'b'])
  const k = 'stripe'
  return (<Stack>${els}</Stack>)
}`)
}

describe('emit-swift <PlotChart> mark options — literal lowering vs named decline', () => {
  it('pattern and gradient (with direction + shape) lower in Series field order', () => {
    const { code, warnings } = charts(`<PlotChart data={rows()} marks={[bars((d) => d.v, { pattern: { kind: 'stripe', color: '#000', spacing: 4, width: 1 }, gradient: { stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }], direction: 'vertical', shape: 'radial' } })]} />`)
    expect(code).toContain(
      'gradient: SeriesGradient(stops: [PyreonChartGradientStop(offset: 0.0, color: "#fff"), PyreonChartGradientStop(offset: 1.0, color: "#000")], direction: "vertical", shape: "radial"), pattern: PyreonChartPattern(kind: "stripe", color: "#000", spacing: 4.0, width: 1.0)',
    )
    expect(warnings).toEqual([])
  })

  const declines: [string, string][] = [
    [`{ pattern: { kind: k, color: '#000', spacing: 4, width: 1 } }`, '`pattern` needs literal'],
    [`{ pattern: pp }`, '`pattern` needs literal'],
    [`{ gradient: gg }`, '`gradient` needs literal stops'],
    [`{ gradient: { stops: ss } }`, '`gradient` needs literal stops'],
    [`{ gradient: { stops: [sx] } }`, '`gradient` needs literal stops'],
    [`{ gradient: { stops: [{ offset: k, color: '#f' }] } }`, '`gradient` needs literal stops'],
    [`{ gradient: { stops: [], direction: k } }`, '`gradient` needs literal stops'],
    [`{ gradient: { stops: [], shape: k } }`, '`gradient` needs literal stops'],
    [`{ width: k }`, '`width` must be a number literal'],
  ]
  for (const [opts, needle] of declines) {
    it(`declines ${opts} by name`, () => {
      const { code, warnings } = charts(`<PlotChart data={rows()} marks={[bars((d) => d.v, ${opts})]} />`)
      expect(code).toContain('EmptyView()')
      expect(code).not.toContain('PyreonChartCanvas')
      expect(warnings.some((w) => w.includes(needle)), JSON.stringify(warnings)).toBe(true)
    })
  }

  it('spread options are declined as a non-literal options object', () => {
    const { warnings } = charts(`<PlotChart data={rows()} marks={[bars((d) => d.v, ...rest)]} />`)
    expect(warnings.some((w) => w.includes('options must be an object literal on native'))).toBe(true)
  })
})

describe('emit-swift accessor chart hosts — the per-host accessor declines', () => {
  const bail = (el: string, needle: string) => {
    const { code, warnings } = charts(el)
    expect(code).toContain('EmptyView()')
    expect(code).not.toContain('PyreonChartCanvas')
    expect(warnings.some((w) => w.includes(needle)), JSON.stringify(warnings)).toBe(true)
  }

  it('Candlestick: a block-bodied x accessor declines; a well-formed one with a width renders', () => {
    bail(`<CandlestickChart data={rows()} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} x={(d) => { const q = d.x; return q }} />`, '<CandlestickChart x>: only a single-expression arrow')
    expect(charts(`<CandlestickChart data={rows()} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} x={(d) => d.x} width={320} />`).code).toContain('renderCandlestickChart(pyreonCandles, 320.0, 200.0')
  })

  it('Boxplot: a 3-param x and a block summary decline; a width + format renders and names the formatter', () => {
    bail(`<BoxplotChart data={rows()} values={(d) => d.vals} x={(d, i, z) => d.x} />`, '<BoxplotChart x>')
    bail(`<BoxplotChart data={rows()} summary={(d) => { const s = d; return s }} />`, '<BoxplotChart summary>')
    const ok = charts(`<BoxplotChart data={rows()} values={(d) => d.vals} x={(d) => d.x} width={300} format={(n) => String(n)} />`)
    expect(ok.code).toContain('renderBoxplotChart(pyreonBoxes, 300.0, 240.0')
    expect(ok.warnings).toContain('<BoxplotChart format>: a formatter is not lowered on native; the axis prints plain numbers.')
  })

  it('Heatmap: a 3-param value declines; a visualMap swaps in the strip stops unless colors are given', () => {
    bail(`<HeatmapChart data={rows()} x={(d) => d.x} y={(d) => d.y} value={(d, i, j) => d.v} />`, '<HeatmapChart value>')
    expect(charts(`<HeatmapChart data={rows()} x={(d) => d.x} y={(d) => d.y} value={(d) => d.v} width={400} visualMap={visualMap({ domain: [0, 10] })} />`).code).toContain('pyreonTheme, pyreonStrip.stops, 1.0')
    const tapped = charts(`<HeatmapChart data={rows()} x={(d) => d.x} y={(d) => d.y} value={(d) => d.v} visualMap={visualMap({ domain: [0, 10] })} onSelectIndex={(i) => {}} colors={['#fff', '#000']} />`).code
    expect(tapped).toContain('pyreonTheme, ["#fff", "#000"], 1.0')
  })

  it('Radar: bad color / legend-label accessors decline; a missing legend label is named', () => {
    bail(`<RadarChart data={rows()} axes={axes()} values={(d) => d.vals} color={(d, i, z) => '#f00'} />`, '<RadarChart color>')
    bail(`<RadarChart data={rows()} axes={axes()} values={(d) => d.vals} width={300} showLegend={true} label={(d, i, z) => d.name} />`, '<RadarChart label>')
    bail(`<RadarChart data={rows()} axes={axes()} values={(d) => d.vals} showLegend={true} />`, '<RadarChart showLegend>: needs a `label` accessor')
  })

  it('Radar: dynamic rings / showLabels pass through; a non-literal theme is named', () => {
    const { code, warnings } = charts(`<RadarChart data={rows()} axes={axes()} values={(d) => d.vals} rings={ringsN()} showLabels={sl()} theme="dark" />`)
    expect(code).toContain('RadarOptions(rings: ringsN,')
    expect(code).toContain('showLabels: sl)')
    expect(warnings.some((w) => w.startsWith('<RadarChart theme>: only an object literal'))).toBe(true)
  })
})

describe('emit-swift member-method arity guards', () => {
  // Each lowered JS method checks the arity it models. A call with a DIFFERENT
  // arity (a `thisArg`, a `fromIndex`, a forgotten argument) must not take the
  // lowering built for the modelled one.
  const run = sw(`import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const xs = signal<number[]>([1, 2])
  const s = signal<string>('abc')
  const run = () => {
    const a1 = xs().some((x) => x > 1, null)
    const a2 = xs().every((x) => x > 1, null)
    const a3 = xs().filter((x) => x > 1, null)
    const a4 = xs().find((x) => x > 1, null)
    const a5 = xs().findLast((x) => x > 1, null)
    const a6 = xs().includes(1, 1)
    const a8 = s().lastIndexOf('a', 1)
    const a9 = s().indexOf('a', 1)
    const a10 = s().charCodeAt(0, 1)
    const a11 = s().endsWith('a', 2)
    const a12 = s().substring(1, 2, 3)
    const a13 = xs().findIndex((x) => x > 1, null)
    const a15 = s().toLowerCase(1)
    const a16 = s().charCodeAt()
    const a17 = xs().some()
    const a14 = xs().reduce((a, x) => a + x)
    const a18 = s().substring(1)
    const a19 = s().substring(1, 2)
  }
  return (<Stack><Button onPress={run}>go</Button></Stack>)
}`).code
  const line = (name: string) => run.split('\n').find((l) => l.includes(`let ${name} = `)) ?? ''

  it('a thisArg / fromIndex / extra argument declines the one-argument lowering', () => {
    expect(line('a1')).not.toContain('contains(where:')
    expect(line('a2')).not.toContain('allSatisfy')
    expect(line('a4')).not.toContain('first(where:')
    expect(line('a5')).not.toContain('last(where:')
    expect(line('a6')).not.toContain('contains(1)')
    expect(line('a11')).not.toContain('hasSuffix')
    expect(line('a13')).not.toContain('firstIndex(where:')
    expect(line('a10')).not.toContain('utf16')
    expect(line('a15')).not.toContain('lowercased()')
    for (const n of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a8', 'a9', 'a10', 'a11', 'a12', 'a13', 'a15', 'a16', 'a17']) expect(line(n), n).not.toBe('')
  })

  it('the modelled arities still lower: seedless reduce, one- and two-argument substring', () => {
    expect(line('a14')).toContain('let a14 = xs.dropFirst().reduce(xs[0], { a, x in a + x })')
    expect(line('a18')).toContain('let a18 = String(s.dropFirst(1))')
    expect(line('a19')).toContain('let a19 = String(s.dropFirst(1).prefix(max(0, (2) - (1))))')
  })
})

describe('emit-swift JS truthiness of an OPTIONAL string / number / boolean', () => {
  it('each primitive kind gets its own present / absent test', () => {
    const { code } = sw(`import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
type U = { nick?: string; age?: number; ok?: boolean }
export function App() {
  const u = signal<U>({ nick: 'a' })
  const run = () => {
    const b1 = u().nick ? 1 : 2
    const b2 = !u().age ? 1 : 2
    const b3 = u().ok ? 1 : 2
    const b4 = !u().nick ? 1 : 2
    const b5 = u().age ? 1 : 2
    const b6 = !u().ok ? 1 : 2
  }
  return (<Stack><Button onPress={run}>go</Button></Stack>)
}`)
    // '' / 0 / false are falsy in JS — a bare `!= nil` would take the branch on them.
    expect(code).toContain('let b1 = u.nick?.isEmpty == false ? 1 : 2')
    expect(code).toContain('let b2 = (u.age ?? 0) == 0 ? 1 : 2')
    expect(code).toContain('let b3 = u.ok == true ? 1 : 2')
    expect(code).toContain('let b4 = u.nick?.isEmpty != false ? 1 : 2')
    expect(code).toContain('let b5 = (u.age ?? 0) != 0 ? 1 : 2')
    expect(code).toContain('let b6 = u.ok != true ? 1 : 2')
  })
})

describe('emit-swift <FlowWebView> hosts', () => {
  const r = sw(`import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { FlowWebView } from '@pyreon/flow/webview'
type G = { nodes: { id: string }[] }
export function App() {
  const g = signal<G>({ nodes: [{ id: 'a' }] })
  const h = signal('<p/>')
  const w = signal(3)
  return (<Stack>
    <FlowWebView />
    <FlowWebView graph={g()} nodeWidth={w()} nodeHeight={50} nodeFill="#abc<>" labelColor="#123" background="red" />
    <FlowWebView graph={g()} nodeWidth={120} html={h()} commands={cmds()} onSelect={handler} onMessage={(m) => log(m)} />
  </Stack>)
}`)

  it('a missing graph is named and an empty payload is sent', () => {
    expect(r.warnings).toContain('<FlowWebView>: `graph` is required on native; emitting an empty host.')
  })

  it('flow host styling: a static node size / colours / background are baked, a dynamic one is named', () => {
    expect(r.warnings).toContain('<FlowWebView nodeWidth={…}>: native host styling must be statically resolvable; using the documented default.')
    expect(r.code).toContain('var NODE_W = 150, NODE_H = 50;')
    // The colour is sanitised of markup characters before it is spliced in.
    expect(r.code).toContain('#abc')
    expect(r.code).not.toContain('#abc<>')
    expect(r.code).toContain('background:red}')
  })

  it('custom flow host HTML names the ignored styling; commands wrap the graph; a bare handler is invoked with the message', () => {
    expect(r.warnings).toContain('<FlowWebView html={…} nodeWidth={…}>: nodeWidth is ignored because custom host HTML owns its presentation.')
    expect(r.code).toContain('PyreonWebView(html: h, data: pyreonFlowWebViewData(graph: PyreonJSON.encode(g), commands: PyreonJSON.encode(cmds)), onMessage: { pyreonMsg in pyreonDispatchFlowWebViewMessage(pyreonMsg, onSelect: { pyreonMsg in handler(pyreonMsg) }, onMessage: { m in log(m) }) })')
  })
})

describe('emit-swift render-prop VALUES at a call site', () => {
  const HEAD = `import { Stack, Text } from '@pyreon/primitives'
import type { VNodeChild } from '@pyreon/core'
type User = { name: string; age: number }
function Row(props: { render: (u: User, i: number) => VNodeChild; empty: () => VNodeChild }) {
  const u: User = { name: 'Ada', age: 3 }
  return <Stack>{props.render(u, 0)}{props.empty()}</Stack>
}
const hello = () => <Text>hi</Text>
const cell = (u: User) => <Text>{u.name}</Text>
`
  const r = sw(`${HEAD}export function A() {
  return <Stack>
    <Row render={((u) => <Text>{u.name}</Text>)} empty={hello} />
    <Row render={(u) => { const n = u.name; return <Text>{n}</Text> }} empty={() => { return <Text>x</Text> }} />
    <Row render={cell} empty={<Text>bare</Text>} />
    <Row render={(u) => <Text>{u.name}</Text>} empty={42} />
  </Stack>
}
export function B(props: { render: (u: User, i: number) => VNodeChild; empty: () => VNodeChild }) {
  return <Row render={props.render} empty={props.empty} />
}`)

  it('a parenthesised arrow is padded to the slot arity; a zero-arity helper is wrapped', () => {
    expect(r.code).toContain('Row(render: { u, _ in')
    expect(r.code).toContain('empty: { hello() })')
  })

  it('a simple BLOCK-bodied render callback lowers to view-builder statements, not an empty view', () => {
    expect(r.code).toContain('Row(render: { u, _ in\n        let n = u.name\n        Text(verbatim: "\\(n)")\n      }, empty: {\n        Text("x")\n      })')
    expect(r.warnings.some((w) => w.startsWith('<Row render={…}>: a render callback with a BLOCK body'))).toBe(false)
  })

  // Regression (fixed here): a view helper taking FEWER parameters than the
  // slot passes was wrapped as `{ a0 in cell(a0) }` — a swiftc arity error
  // against a `(User, Int) -> C` slot. The inline-arrow branch already padded.
  it('a view helper with fewer params than the slot is padded with `_`', () => {
    expect(r.code).toContain('Row(render: { a0, _ in cell(a0) }')
  })

  it('a bare element becomes a zero-arg builder; a non-view value is named and passed verbatim', () => {
    expect(r.code).toContain('empty: {\n        Text("bare")')
    expect(r.code).toContain('empty: 42)')
    expect(r.warnings.some((w) => w.startsWith('<Row empty={…}>: this render prop is not an inline arrow'))).toBe(true)
  })

  it("forwarding the enclosing component's own render prop passes the closure through", () => {
    expect(r.code).toContain('Row(render: render, empty: empty)')
  })

  // KNOWN BUG (Kotlin twin, reported — emit-kotlin.ts is not this file's scope):
  // the same helper-arity padding is missing, so Kotlin emits `{ a0 -> cell(a0) }`
  // for a two-parameter @Composable slot.
  it.fails('Kotlin twin: a view helper with fewer params than the slot is padded', () => {
    const k = transform(`${HEAD}export function A() { return <Row render={cell} empty={hello} /> }`, { target: 'kotlin' }).code
    expect(k).toContain('{ a0, _ -> cell(a0) }')
  })
})

describe('emit-swift flow geometry helpers and engine-internal members', () => {
  const r = sw(`import { createFlow, getNodeIntersection, getEffectiveDimensions, getFloatingEndpoints, getSmartHandlePositions, resolveHandleAnchor, resolveMarker, collectEdgeMarkers } from '@pyreon/flow'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  const run = () => {
    const n = flow.getNodes()[0]
    const g1 = getNodeIntersection({ x: 0, y: 0, width: 1, height: 1 }, { x: 1, y: 1 })
    const g2 = getNodeIntersection(box, { x: 1, y: 1 })
    const d1 = getEffectiveDimensions(n)
    const d2 = getEffectiveDimensions(n, m)
    const d3 = getEffectiveDimensions({ width: 1 })
    const f1 = getFloatingEndpoints(n, n, { sourceW: 1, sourceH: 2, targetW: 3, targetH: 4 })
    const f2 = getFloatingEndpoints(n, n, dims)
    const s1 = getSmartHandlePositions(n, n)
    const s2 = getSmartHandlePositions(n, n, { sourceW: 1, sourceH: 2, targetW: 3, targetH: 4 })
    const s3 = getSmartHandlePositions({ id: 'x' }, n)
    const r1 = resolveHandleAnchor(n, 'h', 'source', dims)
    const r2 = resolveHandleAnchor(n, 'h', 'source', dims, m)
    const r3 = resolveHandleAnchor(n, 'h', 'source', { w: 1 })
    const m1 = resolveMarker(mk)
    const m2 = collectEdgeMarkers(flow.edges(), mk)
    const e = flow.getEdges()
    const v = flow.getViewport()
    flow._clearNodeMeasurement('1')
    flow._setNodeMeasurement('1', 10, 20)
    flow._setNodeMeasurement('1', 10, 20, [{ id: 'h', type: 'source', position: 'top', x: 1, y: 2 }])
    flow._setNodeMeasurement('1', 10, 20, hs)
    flow._setNodeMeasurement('1', 10, 20, [{ id: 'h' }])
    flow.updateNode('1', patch)
    flow.updateEdge('e', { ...base })
    flow.updateNodeData('1', (n) => ({ ...n.data, label: 'z' }))
    flow.frobnicate(1)
    flow.viewport.set({ x: 1, y: 2, zoom: 1 })
    flow.viewport.update((v) => ({ ...v, zoom: 2 }))
    flow.containerSize.set({ width: 1, height: 2 })
    flow.containerSize.update((c) => ({ width: 3, height: c.height }))
    flow.measurements.set(new Map<string, number>())
    flow.measurements.set(mm)
    flow.measurements.update((x) => x)
  }
  return (<Stack><Button onPress={run}>go</Button></Stack>)
}`)

  it('each geometry helper lowers with literal / engine-typed arguments', () => {
    const want = [
      'let g1 = pyreonNodeIntersection(PyreonFlowRect(x: 0, y: 0, width: 1, height: 1), toward: PyreonXYPosition(x: 1, y: 1))',
      'let d1 = pyreonEffectiveDimensions(n)\n',
      'let d2 = pyreonEffectiveDimensions(n, measurement: m)',
      'let f1 = pyreonGetFloatingEndpoints(n, targetNode: n, dimensions: PyreonFlowNodeBoxDimensions(sourceW: 1, sourceH: 2, targetW: 3, targetH: 4))',
      'let s1 = pyreonGetSmartHandlePositions(n, targetNode: n)\n',
      'let s2 = pyreonGetSmartHandlePositions(n, targetNode: n, dimensions: PyreonFlowNodeBoxDimensions(',
      'let r1 = pyreonResolveHandleAnchor(n, handleId: "h", type: "source", dimensions: dims)\n',
      'let r2 = pyreonResolveHandleAnchor(n, handleId: "h", type: "source", dimensions: dims, measurement: m)',
      // A non-literal marker is passed through to the runtime resolver.
      'let m1 = pyreonResolveFlowMarker(mk)',
      'let m2 = pyreonCollectFlowEdgeMarkers(flow.edges, defaultMarkerEnd: mk)',
    ]
    for (const w of want) expect(r.code, w).toContain(w)
  })

  it('an anonymous object where an engine value is needed is NAMED, not lowered', () => {
    for (const helper of ['getNodeIntersection', 'getEffectiveDimensions', 'getFloatingEndpoints', 'getSmartHandlePositions', 'resolveHandleAnchor']) {
      expect(r.warnings.some((w) => w.startsWith(`${helper} requires`)), helper).toBe(true)
    }
    expect(r.code).not.toContain('let g2 = pyreon')
    expect(r.code).not.toContain('let d3 = pyreon')
    expect(r.code).not.toContain('let f2 = pyreon')
    expect(r.code).not.toContain('let s3 = pyreon')
    expect(r.code).not.toContain('let r3 = pyreon')
  })

  it('getters drop to properties; the measurement internals lower (handles only when literal)', () => {
    expect(r.code).toContain('let n = flow.nodes[0]')
    expect(r.code).toContain('let e = flow.edges\n')
    expect(r.code).toContain('let v = flow.viewport\n')
    expect(r.code).toContain('flow.clearNodeMeasurement("1")')
    expect(r.code).toContain('flow.updateNodeMeasurement("1", width: 10, height: 20)\n')
    expect(r.code).toContain('flow.updateNodeMeasurement("1", width: 10, height: 20, handles: [PyreonFlowMeasuredHandle(id: "h", type: "source", position: .top, x: 1, y: 2)])')
    expect(r.warnings.filter((w) => w.includes('`_setNodeMeasurement` handle geometry must be a literal array'))).toHaveLength(2)
  })

  it('a non-literal / spread patch and an unported member are named', () => {
    for (const m of ['updateNode', 'updateEdge', 'updateNodeData']) {
      expect(r.warnings.some((w) => w.includes(`\`${m}\` currently lowers only a literal patch object`)), m).toBe(true)
    }
    expect(r.warnings.some((w) => w.includes('`frobnicate` is NOT ported to the native PyreonFlowState'))).toBe(true)
  })

  it('viewport / containerSize / measurements signal writes route to the engine setters', () => {
    expect(r.code).toContain('flow.setViewport(PyreonFlowViewport(x: 1, y: 2, zoom: 1))')
    expect(r.code).toContain('flow.setViewport { v in PyreonFlowViewport(x: v.x, y: v.y, zoom: 2) }')
    expect(r.code).toContain('flow.replaceContainerSize(PyreonFlowContainerSize(width: 1, height: 2))')
    expect(r.code).toContain('flow.updateContainerSize { c in PyreonFlowContainerSize(width: 3, height: c.height) }')
    expect(r.code).toContain('flow.replaceMeasurements([:])')
    expect(r.code).toContain('flow.replaceMeasurements(mm)')
    expect(r.code).toContain('flow.updateMeasurements({ x in x })')
  })
})

describe('emit-swift <PlotChart> host — per-mark accessor declines and the full-data (a11y) series', () => {
  const plot = (els: string) =>
    sw(`import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars, bubble, band, sma } from '@pyreon/charts/engine'
export function C() {
  const rows = signal<{ x: string; y: number; r: number; lo: number }[]>([])
  return (<Stack>${els}</Stack>)
}`)
  const bail = (el: string, needle: string) => {
    const { code, warnings } = plot(el)
    expect(code).toContain('EmptyView()')
    expect(code).not.toContain('PyreonChartCanvas')
    expect(warnings.some((w) => w.includes(needle)), JSON.stringify(warnings)).toBe(true)
  }

  it('a block-bodied bubble radius / band lower bound / x / xValue accessor declines by name', () => {
    bail(`<PlotChart data={rows()} marks={[bubble((d) => d.y, (d) => { const q = d.r; return q })]} />`, '<PlotChart> mark 1 radius: only a single-expression arrow')
    bail(`<PlotChart data={rows()} marks={[band((d) => { const q = d.lo; return q }, (d) => d.y)]} />`, '<PlotChart> mark 1 lower bound: only a single-expression arrow')
    bail(`<PlotChart data={rows()} marks={[bars((d) => d.y)]} x={(d, i, z) => d.x} />`, '<PlotChart> x: only a single-expression arrow')
    bail(`<PlotChart data={rows()} marks={[bars((d) => d.y)]} xValue={(d, i, z) => d.y} />`, '<PlotChart> xValue: only a single-expression arrow')
  })

  it('an xValue accessor maps the numeric x channel', () => {
    expect(plot(`<PlotChart data={rows()} marks={[bars((d) => d.y)]} xValue={(d) => d.y} />`).code).toContain('let pyreonXValues: [Double] = ')
  })

  it('maxPoints thins the drawn rows but keeps a FULL-data series set for every mark kind', () => {
    const { code, warnings } = plot(`<PlotChart data={rows()} marks={[bars((d) => d.y, { errorLow: (d) => d.lo, errorHigh: (d) => d.y }), bubble((d) => d.y, (d) => d.r), band((d) => d.lo, (d) => d.y), sma((d) => d.y, 3)]} maxPoints={100} x={(d) => d.x} />`)
    expect(warnings).toEqual([])
    for (const name of ['pyreonKeep', 'pyreonA11yErrLow0', 'pyreonA11yErrHigh0', 'pyreonA11yRRaw1', 'pyreonA11yLow2', 'pyreonA11yValues3', 'pyreonA11yCats', 'pyreonA11ySeriesSource']) {
      expect(code, name).toContain(`let ${name}`)
    }
    expect(code).toContain('Series(kind: "bars", values: pyreonA11yValues0, color: "#4f7df3", width: 2.0, radius: 3.0, label: "Series 1", showValues: false, errLow: pyreonA11yErrLow0, errHigh: pyreonA11yErrHigh0)')
    expect(code).toContain('Series(kind: "points", values: pyreonA11yValues1')
    expect(code).toContain('Series(kind: "band", values: pyreonA11yValues2')
  })

  it('a non-literal indicator window declines by name', () => {
    bail(`<PlotChart data={rows()} marks={[sma((d) => d.y, win)]} maxPoints={10} />`, '`sma` needs a NUMERIC LITERAL window')
  })
})

describe('emit-swift small expression arms', () => {
  it('MarkerType members, flow map sizes, config reads and Math constants', () => {
    const { code, warnings } = sw(`import { createFlow } from '@pyreon/flow'
import { Stack, Button, WebView } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  const run = () => {
    const t = MarkerType.Arrow
    const t2 = MarkerType.ArrowClosed
    const c1 = flow.nodeMap().size
    const c2 = flow.edgeMap().size
    const c3 = flow.measurements().size
    const z = flow.config.minZoom
    const q = flow.config.bogusKey
    const e = Math.E
  }
  return (<Stack><Button onPress={run}>go</Button>
    <WebView html="<p/>" onMessage={() => { log(1); log(2) }} />
  </Stack>)
}`)
    expect(code).toContain('let t = "arrow"')
    expect(code).toContain('let t2 = "arrowclosed"')
    expect(code).toContain('let c1 = flow.nodeLookup.count')
    expect(code).toContain('let c2 = flow.edgeLookup.count')
    expect(code).toContain('let c3 = flow.measurements.count')
    expect(code).toContain('let z = flow.minZoom')
    expect(code).toContain('let e = 2.718281828459045')
    expect(warnings).toContain('createFlow binding `flow`: `config.bogusKey` is not represented by the native Flow configuration.')
    // A zero-param BLOCK-bodied message handler binds the ignored message as `_`.
    expect(code).toContain('PyreonWebView(html: "<p/>", onMessage: { _ in')
  })

  it('an optional-chained call on an optional function prop keeps the `?`', () => {
    const { code } = sw(`import { Stack, Button } from '@pyreon/primitives'
export function Pick(props: { onPick?: (n: number) => void }) {
  const go = () => { props.onPick?.(1) }
  return (<Stack><Button onPress={go}>go</Button></Stack>)
}`)
    expect(code).toContain('var onPick: ((Int) -> Void)? = nil')
    expect(code).toContain('onPick?(1)')
  })

  it('a chart pattern carries its literal texture extras; a shape point missing a coordinate defaults it to 0', () => {
    const { code } = sw(`import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts/engine'
export function C() {
  const rows = signal<{ x: string; y: number }[]>([])
  return (<Stack><PlotChart data={rows()} marks={[bars((d) => d.y, { pattern: { kind: 'symbol', color: '#000', spacing: 4, width: 1, angle: 45, symbol: 'star', spacingY: 3, image: 'a.png', repeat: 'x', shape: [{ x: 1 }, { x: 2, y: 3 }], shapeRings: [1, 2] } })]} /></Stack>)
}`)
    expect(code).toContain(
      'pattern: PyreonChartPattern(kind: "symbol", color: "#000", spacing: 4.0, width: 1.0, angle: 45.0, symbol: "star", spacingY: 3.0, image: "a.png", repeat: "x", shape: [PyreonChartPt(x: 1.0, y: 0.0), PyreonChartPt(x: 2.0, y: 3.0)], shapeRings: [1.0, 2.0])',
    )
  })
})

describe('emit-swift flow node <svg>, <BaseEdge> style, and the remaining chrome variants', () => {
  const r = sw(`import { createFlow, Flow, BaseEdge, MiniMap, Controls, Background, getStraightPath, type EdgeComponentProps, type NodeComponentProps } from '@pyreon/flow'
import { Stack } from '@pyreon/primitives'
function IconNode(props: NodeComponentProps<{ size: number; c: string }>) {
  return <Stack>
    <svg width={props.data().size} height={props.data().size} preserveAspectRatio="none" viewBox="0 0 24 24">
      <path d="M 0 0 L 1 1" stroke={props.data().c} strokeWidth={props.data().size} fill={props.data().c} />
    </svg>
    <svg></svg>
  </Stack>
}
function E(props: EdgeComponentProps) {
  const p = getStraightPath({ sourceX: props.sourceX(), sourceY: props.sourceY(), targetX: props.targetX(), targetY: props.targetY() })
  return <BaseEdge path={p.path} style="stroke: none; stroke-width: 2" />
}
function fnColor(n) { return '#f00' }
export function Diagram() {
  const flow = createFlow({ nodes: [{ id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: { size: 20, c: 'red' } }], edges: [] })
  return <Stack>
    <Flow instance={flow} nodeTypes={{ icon: IconNode }} edgeTypes={{ e: E }}><MiniMap nodeColor={fnColor} maskColor={fnColor} height={120} pannable={false} /><Controls position="bottom-right" /><Background variant="cross" /></Flow>
    <Flow instance={flow}><Controls position="top-right" /><Background variant="dots" /><MiniMap nodeColor="#abc" /></Flow>
  </Stack>
}`)

  it('a node <svg>: dynamic size and paint are converted, preserveAspectRatio="none" stretches, an empty svg has no shapes', () => {
    expect(r.code).toContain('PyreonFlowSvg(width: Double(data().size), height: Double(data().size), viewBox: [0, 0, 24, 24], stretch: true, shapes: [')
    expect(r.code).toContain('PyreonFlowSvgShape(result: PyreonFlowPathResult(svgPath: "M 0 0 L 1 1"), stroke: data().c, strokeWidth: Double(data().size), fill: data().c)')
    expect(r.code).toContain('PyreonFlowSvg(shapes: [])')
    expect(r.warnings.some((w) => w.startsWith('A native Flow <svg> with no width or height'))).toBe(true)
  })

  it('a BaseEdge `stroke: none` style draws a transparent stroke at the styled width', () => {
    expect(r.code).toContain('PyreonFlowBaseEdgePath(result: PyreonFlowPathResult(svgPath: p.path), color: "#00000000", width: 2)')
  })

  it('a function-declaration colour callback is not a colour; literal chrome variants map to their cases', () => {
    expect(r.code).toContain('miniMap: PyreonFlowMiniMapStyle(nodeColor: nil, maskColor: "#000000", width: 200, height: 120, pannable: false, zoomable: true), miniMapNodeColor: fnColor')
    expect(r.code).toContain('variant: .cross')
    expect(r.code).toContain('position: .bottomRight)')
    expect(r.code).toContain('variant: .dots')
    expect(r.code).toContain('position: .topRight)')
    expect(r.code).toContain('PyreonFlowMiniMapStyle(nodeColor: "#abc"')
  })
})

describe('emit-swift flow <NodeToolbar> / <NodeResizer> static extraction', () => {
  const r = sw(`import { createFlow, Flow, NodeToolbar, NodeResizer, type NodeComponentProps } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
function A(props: NodeComponentProps<{ label: string }>) {
  return <Stack>
    <NodeToolbar selected={props.selected} nodeId={props.id}><Text>a</Text></NodeToolbar>
    <NodeToolbar selected={selected} nodeId={nodeId} position="bottom" align="start" offset={4} showOnSelect={false}><Text>b</Text></NodeToolbar>
    <NodeToolbar selected={true} nodeId="n1"><Text>c</Text></NodeToolbar>
    <NodeResizer minWidth={mw()} />
    <Text>x</Text>
  </Stack>
}
function B(props: NodeComponentProps<{ label: string }>) {
  return <Stack><NodeToolbar position={pos()} offset="x"><Text>d</Text></NodeToolbar><Text>y</Text></Stack>
}
export function D() {
  const flow = createFlow({ nodes: [{ id: 'a', type: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  return <Flow instance={flow} nodeTypes={{ a: A, b: B }} />
}`)

  it("a toolbar's selected / nodeId that read the NODE's own state need no override; literals become overrides", () => {
    expect(r.code).toContain(
      'case "a": return [PyreonFlowNodeToolbarConfig(position: "top", align: "center", offset: 8, showOnSelect: true), PyreonFlowNodeToolbarConfig(position: "bottom", align: "start", offset: 4, showOnSelect: false), PyreonFlowNodeToolbarConfig(position: "top", align: "center", offset: 8, showOnSelect: true, selectedOverride: true, nodeIdOverride: "n1")]',
    )
  })

  it('non-literal toolbar placement and a dynamic resizer size are named and fall back to defaults', () => {
    expect(r.warnings).toContain('<Flow nodeTypes> component `B`: <NodeToolbar> requires literal position, align, offset, and showOnSelect props on native; unsupported values use native defaults.')
    expect(r.warnings).toContain('<Flow nodeTypes> component `A`: <NodeResizer> size and edge-handle options must be literals for native extraction; dynamic values use native defaults.')
    expect(r.code).toContain('case "a": return PyreonFlowNodeResizerConfig(minWidth: 50, minHeight: 30, handleSize: 8, showEdgeHandles: false)')
  })
})

describe('emit-swift createFlow — HETEROGENEOUS node data rows', () => {
  const rows = (second: string) =>
    sw(`import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A', w: 1 } }, { id: '2', position: { x: 0, y: 0 }, data: ${second} }, { id: '3', position: { x: 0, y: 0 }, data: { label: 'D', w: 3 } }], edges: [] })
  return (<Stack><Text>{() => String(flow.nodes().length)}</Text></Stack>)
}`)

  it('a field some rows omit becomes an optional member of ONE shared row struct', () => {
    const { code } = rows(`{ label: 'C' }`)
    expect(code).toContain('struct __Obj0: Codable {\n  var label: String\n  var w: Int? = nil\n}')
    expect(code).toContain('PyreonFlowState<__Obj0>(nodes: [')
    expect(code).toContain('data: __Obj0(label: "C"))')
  })

  // KNOWN BUGS (reported): row-type unification looks at field NAMES, not
  // value types, so a field whose type DIFFERS across rows breaks the build
  // silently — two distinct ways:
  //   * same field set, different types → the rows keep their OWN structs
  //     (`__Obj0` / `__Obj1`) while the state is `PyreonFlowState<__Obj0>`, so
  //     the second node's `data:` does not type-check;
  //   * a field that also goes MISSING somewhere → the merged struct types it
  //     `Any?`, which is not `Codable`, so the row struct does not conform.
  // Either should lower to one consistent row type, or be named in a warning.
  it.fails('same field set, differing types: every node data literal uses the state row type', () => {
    const { code, warnings } = rows(`{ label: 'B', w: 'wide' }`)
    const row = /PyreonFlowState<(\w+)>/.exec(code)?.[1]
    const dataTypes = [...code.matchAll(/data: (__Obj\d+)\(/g)].map((m) => m[1])
    expect(dataTypes.every((t) => t === row) || warnings.length > 0).toBe(true)
  })

  it.fails('a field typed differently AND missing somewhere is not silently `Any?` in a Codable struct', () => {
    const { code, warnings } = sw(`import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A', w: 1 } }, { id: '2', position: { x: 0, y: 0 }, data: { label: 'B', w: 'wide' } }, { id: '3', position: { x: 0, y: 0 }, data: { label: 'C' } }], edges: [] })
  return (<Stack><Text>{() => String(flow.nodes().length)}</Text></Stack>)
}`)
    expect(code.includes('var w: Any?') && warnings.length === 0).toBe(false)
  })
})

describe('emit-swift useSortable key extractor', () => {
  const sortable = (by: string) =>
    sw(`import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
type Row = { id: number; name: string }
export function App() {
  const items = signal<Row[]>([{ id: 1, name: 'a' }])
  const s = useSortable({ items: () => items(), by: ${by}, onReorder: (x) => items.set(x) })
  return (<Stack><Text>x</Text></Stack>)
}`).code

  it('a key that is already a String passes through; any other key is interpolated into one', () => {
    // The native engine keys on String while the web `by` returns string | number.
    expect(sortable('(r) => `k-${r.id}`')).toContain('by: { r in "k-\\(r.id)" },')
    expect(sortable('(r) => r.id')).toContain('by: { r in "\\(r.id)" },')
  })
})

describe('emit-swift remaining flow / parse arms', () => {
  it('non-literal markers, an empty viewport with a duration, map reads, and a dynamic parseInt radix', () => {
    const { code } = flowRun(`    const a = markerId(mk)
    const b = resolveEdgeMarkers(flow.edges(), mk)
    flow.setViewport({}, { duration: 5 })
    const em = flow.edgeMap()
    const ms = flow.measurements()
    const n = parseInt(txt, base)`)
    expect(code).toContain('let a = pyreonFlowMarkerId(mk)')
    expect(code).toContain('let b = pyreonResolveFlowEdgeMarkers(flow.edges, defaultMarkerEnd: mk)')
    expect(code).toContain('flow.setViewport(duration: 5)')
    expect(code).toContain('let em = flow.edgeLookup')
    expect(code).toContain('let ms = flow.measurements\n')
    expect(code).toContain('let n = (Int(txt, radix: base) ?? 0)')
  })
})
