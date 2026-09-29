// Coverage: emit-kotlin.ts arms the rest of the suite never reached — mostly
// the Flow native port (createFlow seeds + options, the flow-member lowering
// table, the public geometry helpers) plus a set of expression/statement arms
// outside Flow. Each spec pairs the source shape that takes an arm with the
// neighbour that must not, and asserts the EMITTED Kotlin (or the NAMED
// warning), never merely "does not throw".
//
// Kotlin is the target because Compose's type system is nominal and has no
// implicit Int->Double widening: most of these arms exist to build the named
// `PyreonFlow*` constructor (not an anonymous `__ObjN`) or to wrap a numeric
// argument as a Double literal, so the Double spelling is the assertion.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kt = (src: string) => transform(src, { target: 'kotlin' })
const ktCode = (src: string) => kt(src).code
const warns = (src: string) => kt(src).warnings.join('\n')

/** A component with a seeded `createFlow` binding and N buttons whose press handlers are `calls`. */
const FLOW = (calls: string[], extraImports = '') => `
import { createFlow${extraImports} } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
    edges: [{ id: 'e1', source: '1', target: '1' }],
  })
  return (
    <Stack>
      <Text>{flow.nodes().length}</Text>
${calls.map((c, i) => `      <Button onPress={() => ${c}}>b${i}</Button>`).join('\n')}
    </Stack>
  )
}`

describe('emit-kotlin.ts — createFlow seed + options literal', () => {
  it('a node `extent` tuple, an edge `animated: false`, edge waypoints, and the full defaultEdgeOptions set', () => {
    const out = ktCode(`
import { createFlow } from '@pyreon/flow'
import { Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' }, extent: [[0, 0], [100, 50]] }],
    edges: [{ id: 'e1', source: '1', target: '1', animated: false, waypoints: [{ x: 1, y: 2 }] }],
    defaultMarkerEnd: { type: 'arrowclosed', color: 'red' },
    autoPanSpeed: 12,
    deleteKeys: ['Delete', 'x'],
    defaultEdgeOptions: { focusable: true, ariaLabel: 'edge', hidden: false, deletable: true, reconnectable: false, pathOptions: { curvature: 0.5 }, markerStart: { type: 'arrow' }, markerEnd: { type: 'arrow' } },
  })
  return <Text>{flow.nodes().length}</Text>
}`)
    expect(out).toContain('extent = PyreonFlowNodeExtent(0.0, 0.0, 100.0, 50.0)')
    // `false` still marks the field specified, so the default does not win.
    expect(out).toContain('animated = false, animatedSpecified = true')
    expect(out).toContain('waypoints = listOf(PyreonXYPosition(1.0, 2.0))')
    expect(out).toContain('defaultMarkerEnd = PyreonFlowMarker("arrowclosed", color = "red")')
    expect(out).toContain('autoPanSpeed = 12.0')
    expect(out).toContain('deleteKeys = listOf("Delete", "x")')
    expect(out).toContain(
      'defaultEdgeOptions = PyreonFlowDefaultEdgeOptions(focusable = true, ariaLabel = "edge", hidden = false, deletable = true, reconnectable = false, curvature = 0.5, markerStart = PyreonFlowMarker("arrow"), markerEnd = PyreonFlowMarker("arrow"), markerEndSpecified = true)',
    )
  })

  it('`deleteKeys: null` and a type-less defaultEdgeOptions with a null markerEnd', () => {
    const out = ktCode(`
import { createFlow } from '@pyreon/flow'
import { Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
    edges: [],
    deleteKeys: null,
    defaultEdgeOptions: { interactionWidth: 3, pathOptions: { borderRadius: 2, offset: 4 }, markerEnd: null },
  })
  return <Text>{flow.nodes().length}</Text>
}`)
    expect(out).toContain('deleteKeys = null')
    expect(out).toContain(
      'defaultEdgeOptions = PyreonFlowDefaultEdgeOptions(interactionWidth = 3.0, borderRadius = 2.0, pathOffset = 4.0, markerEnd = null, markerEndSpecified = true)',
    )
    // no `type`/`label`/`animated` given → none emitted
    expect(out).not.toMatch(/PyreonFlowDefaultEdgeOptions\(type/)
  })
})

describe('emit-kotlin.ts — addNode literal (kotlinFlowNodeLiteral)', () => {
  it('zIndex, extent: parent, optional flags, class, and both handle lists lower to named constructors', () => {
    const out = ktCode(
      FLOW([
        `flow.addNode({ id: '3', position: { x: 1, y: 2 }, data: { label: 'N' }, zIndex: 3, extent: 'parent', draggable: false, class: 'k', sourceHandles: [{ id: 'o', type: 'source', position: 'right' }], targetHandles: [{ type: 'target', position: Position.Left }] })`,
      ], ', Position'),
    )
    expect(out).toContain(
      'PyreonFlowNode(id = "3", position = PyreonXYPosition(1.0, 2.0), data = __Obj0(label = "N"), zIndex = 3.0, extentParent = true, draggable = false, className = "k", sourceHandles = listOf(PyreonFlowHandleConfig(id = "o", type = "source", position = PyreonFlowPosition.Right)), targetHandles = listOf(PyreonFlowHandleConfig(type = "target", position = PyreonFlowPosition.Left)))',
    )
  })

  it('a static [[minX, minY], [maxX, maxY]] extent becomes a named PyreonFlowNodeExtent', () => {
    expect(ktCode(FLOW([`flow.addNode({ id: '4', position: { x: 1, y: 2 }, data: { label: 'N' }, extent: [[0, 0], [10, 20]] })`]))).toContain(
      'extent = PyreonFlowNodeExtent(minX = 0.0, minY = 0.0, maxX = 10.0, maxY = 20.0)',
    )
  })

  it('an unsupported extent is NAMED and dropped (not half-emitted)', () => {
    const r = kt(FLOW([`flow.addNode({ id: '5', position: { x: 1, y: 2 }, data: { label: 'N' }, extent: 'bogus' })`]))
    expect(r.warnings.join('\n')).toContain("node field `extent` must be `'parent'` or a static [[minX, minY], [maxX, maxY]] tuple")
    expect(r.code).toContain('PyreonFlowNode(id = "5", position = PyreonXYPosition(1.0, 2.0), data = __Obj0(label = "N"))')
  })

  it('a position missing `y` is not a node literal — falls through to the generic emit', () => {
    expect(ktCode(FLOW([`flow.addNode({ id: '6', position: { x: 1 }, data: { label: 'N' } })`]))).not.toContain('PyreonFlowNode(id = "6"')
  })

  it('a handle list with an unknown position keeps the raw list (no PyreonFlowHandleConfig invented)', () => {
    const out = ktCode(FLOW([`flow.addNode({ id: '7', position: { x: 1, y: 2 }, data: { label: 'N' }, sourceHandles: [{ type: 'source', position: 'middle' }] })`]))
    expect(out).toContain('PyreonFlowNode(id = "7"')
    expect(out).not.toContain('PyreonFlowHandleConfig(type = "source", position = PyreonFlowPosition.Middle')
  })
})

describe('emit-kotlin.ts — addEdge literal (kotlinFlowEdgeLiteral)', () => {
  it('an id-less edge derives its id from source/target/handles; JSON data lowers to PyreonFlowData', () => {
    const out = ktCode(
      FLOW([
        `flow.addEdge({ source: '1', target: '2', sourceHandle: 'a', targetHandle: 'b', zIndex: 2, data: { w: 1, ok: true, n: null, xs: [1, 'a'], o: { k: 'v' } }, pathOptions: { offset: 4, curvature: 0.2, bogus: 1 }, markerStart: null, markerEnd: MarkerType.Arrow, interactionWidth: 8, waypoints: [{ x: 1, y: 2 }] })`,
      ], ', MarkerType'),
    )
    expect(out).toContain('id = pyreonFlowEdgeId(source = "1", target = "2", sourceHandle = "a", targetHandle = "b")')
    expect(out).toContain('zIndex = 2.0')
    expect(out).toContain(
      'data = PyreonFlowData(mapOf("w" to PyreonFlowDataValue.NumberValue(1.0), "ok" to PyreonFlowDataValue.BoolValue(true), "n" to PyreonFlowDataValue.NullValue, "xs" to PyreonFlowDataValue.ArrayValue(listOf(PyreonFlowDataValue.NumberValue(1.0), PyreonFlowDataValue.StringValue("a"))), "o" to PyreonFlowDataValue.ObjectValue(PyreonFlowData(mapOf("k" to PyreonFlowDataValue.StringValue("v"))))))',
    )
    // `offset` is renamed to the native `pathOffset`; the unknown path option is dropped
    expect(out).toContain('pathOffset = 4.0, curvature = 0.2, markerEnd = PyreonFlowMarker("arrow"), markerEndSpecified = true')
    // a null markerStart is the default — nothing emitted for it
    expect(out).not.toContain('markerStart =')
    expect(out).toContain('interactionWidth = 8.0, waypoints = listOf(PyreonXYPosition(1.0, 2.0))')
  })

  it('a non-JSON data object is NAMED; an object marker carries its geometry; non-literal waypoints pass through', () => {
    const r = kt(
      FLOW([
        `flow.addEdge({ source: '1', target: '2', data: { f: foo() }, markerStart: { type: 'arrowclosed', color: 'red', width: 3, height: 4, strokeWidth: 1 }, markerEnd: { type: 'dot' }, waypoints: pts })`,
      ]),
    )
    expect(r.warnings.join('\n')).toContain('edge `data` must be a static JSON-compatible object to lower natively')
    expect(r.code).toContain('markerStart = PyreonFlowMarker("arrowclosed", color = "red", width = 3.0, height = 4.0, strokeWidth = 1.0), waypoints = pts')
    expect(r.code).not.toContain('data = PyreonFlowData')
  })

  it('a string markerStart and a member-typed object markerEnd both resolve to lowercase marker types', () => {
    const out = ktCode(FLOW([`flow.addEdge({ source: '1', target: '2', markerStart: 'arrow', markerEnd: { type: MarkerType.ArrowClosed } })`], ', MarkerType'))
    expect(out).toContain('markerStart = PyreonFlowMarker("arrow"), markerEnd = PyreonFlowMarker("arrowclosed"), markerEndSpecified = true')
  })
})

describe('emit-kotlin.ts — flow member lowering table', () => {
  it('_setNodeMeasurement: 3 args, and a literal handle array → updateNodeMeasurement', () => {
    const out = ktCode(
      FLOW([
        `flow._setNodeMeasurement('1', 10, 20)`,
        `flow._setNodeMeasurement('1', 10, 20, [{ id: 'h', type: 'source', position: 'right', x: 1, y: 2 }])`,
      ]),
    )
    expect(out).toContain('flow.updateNodeMeasurement("1", 10.0, 20.0) }')
    expect(out).toContain(
      'flow.updateNodeMeasurement("1", 10.0, 20.0, listOf(PyreonFlowMeasuredHandle(id = "h", type = "source", position = PyreonFlowPosition.Right, x = 1.0, y = 2.0)))',
    )
  })

  it('_setNodeMeasurement with non-literal / malformed handle geometry is NAMED', () => {
    for (const handles of ['hs', '[7]', "[{ id: 'h', type: 'source', position: Position.Right, x: 1, y: 2 }]"]) {
      expect(warns(FLOW([`flow._setNodeMeasurement('1', 10, 20, ${handles})`], ', Position'))).toContain(
        '`_setNodeMeasurement` handle geometry must be a literal array to lower natively',
      )
    }
  })

  it('paste: a literal point becomes PyreonXYPosition; a non-literal passes through', () => {
    const out = ktCode(FLOW([`flow.paste({ x: 1, y: 2 })`, `flow.paste(pt)`]))
    expect(out).toContain('flow.paste(PyreonXYPosition(1.0, 2.0))')
    expect(out).toContain('flow.paste(pt)')
  })

  it('updateNode: each patch field has its own native spelling; id changes and bad extents are NAMED', () => {
    const r = kt(
      FLOW([
        `flow.updateNode('1', { id: 'z', position: { x: 1, y: 2 }, data: { label: 'q' }, sourceHandles: [{ type: 'source', position: 'top' }], extent: 'parent', class: 'c', width: 3, draggable: true, bogus: 2 })`,
        `flow.updateNode('1', { extent: [[0, 0], [5, 5]] })`,
        `flow.updateNode('1', { extent: 'nope' })`,
      ]),
    )
    expect(r.code).toContain(
      'flow.updateNode("1") { node -> node.copy(position = PyreonXYPosition(1.0, 2.0), data = node.data.copy(label = "q"), sourceHandles = listOf(PyreonFlowHandleConfig(type = "source", position = PyreonFlowPosition.Top)), extent = null, extentParent = true, className = "c", width = 3.0, draggable = true) }',
    )
    expect(r.code).toContain('node.copy(extent = PyreonFlowNodeExtent(minX = 0.0, minY = 0.0, maxX = 5.0, maxY = 5.0), extentParent = false)')
    const w = r.warnings.join('\n')
    expect(w).toContain('updateNode(...): changing a node id is not supported natively')
    expect(w).toContain('updateNode(...): node field `bogus` is NOT carried')
    expect(w).toContain("updateNode(...): node field `extent` must be `'parent'`")
  })

  it('updateNode / updateNodeData with a spread or non-literal patch is emitted as written and NAMED', () => {
    const r = kt(FLOW([`flow.updateNode('1', { ...base })`, `flow.updateNodeData('1', patchFn)`]))
    expect(r.code).toContain('flow.updateNodeData("1", patchFn)')
    const w = r.warnings.join('\n')
    expect(w).toContain('`updateNode` currently lowers only a literal patch object without spreads')
    expect(w).toContain('`updateNodeData` currently lowers only a literal patch object without spreads')
  })

  it('updateNodeData with a node callback → updateNodeDataFromNode, the param renamed to `node`', () => {
    expect(ktCode(FLOW([`flow.updateNodeData('1', (n) => ({ label: n.data.label + '!' }))`]))).toContain(
      'flow.updateNodeDataFromNode("1") { node -> node.data.copy(label = node.data.label + "!") }',
    )
  })

  it('updateEdge: pathOptions / markers / animated / waypoints / data / class / numeric fields', () => {
    const r = kt(
      FLOW([
        `flow.updateEdge('e1', { id: 'z', pathOptions: { offset: 2, curvature: 1, bad: 3 }, markerStart: 'arrow', markerEnd: { type: 'dot' }, animated: true, waypoints: [{ x: 1, y: 2 }], data: { a: 1 }, class: 'c', interactionWidth: 4, label: 'L', bogus: 1 })`,
        `flow.updateEdge('e1', { markerEnd: 'arrowclosed', waypoints: [{ x: 1 }], data: { a: f() } })`,
      ]),
    )
    expect(r.code).toContain(
      'edge.copy(pathOffset = 2.0, curvature = 1.0, markerStart = PyreonFlowMarker("arrow"), animated = true, animatedSpecified = true, waypoints = listOf(PyreonXYPosition(1.0, 2.0)), data = PyreonFlowData(mapOf("a" to PyreonFlowDataValue.NumberValue(1.0))), className = "c", interactionWidth = 4.0, label = "L")',
    )
    expect(r.code).toContain('edge.copy(markerEnd = PyreonFlowMarker("arrowclosed"), markerEndSpecified = true)')
    const w = r.warnings.join('\n')
    expect(w).toContain('updateEdge(...): changing an edge id is not supported natively')
    expect(w).toContain('updateEdge(...): edge `data` must be a static JSON-compatible object')
  })

  // BUG (both emitters): a NON-LITERAL `position` in an updateNode patch is
  // silently DROPPED — `node.copy()` — with no warning, although the
  // same value passes through (`?? emitKotlinExpr`) in `addNode`. The web
  // moves the node; native does nothing. Same class for a non-literal
  // `sourceHandles` / `targetHandles`, and an updateEdge `waypoints` literal
  // with a missing coordinate.
  it.fails('updateNode with a non-literal position must not silently drop the move', () => {
    const r = kt(FLOW([`flow.updateNode('1', { position: pt })`]))
    expect(r.code.includes('position = pt') || r.warnings.some((w) => w.includes('position'))).toBe(true)
  })

  it('viewport members: literal points / durations lower, unsupported shapes fall through', () => {
    const out = ktCode(
      FLOW([
        `flow.panTo({ x: 1, y: 2 })`,
        `flow.panTo(pt)`,
        `flow.zoomTo(2)`,
        `flow.zoomTo(2, { duration: 300 })`,
        `flow.zoomTo(2, { speed: 3 })`,
        `flow.zoomIn({ duration: 100 })`,
        `flow.zoomOut(opts)`,
      ]),
    )
    expect(out).toContain('flow.panTo(PyreonXYPosition(1.0, 2.0))')
    expect(out).toContain('flow.panTo(pt)')
    expect(out).toContain('flow.zoomTo(2.0) }')
    expect(out).toContain('flow.zoomTo(2.0, duration = 300.0)')
    expect(out).toContain('flow.zoomTo(2L, __Obj')
    expect(out).toContain('flow.zoomIn(duration = 100.0)')
    expect(out).toContain('flow.zoomOut(opts)')
  })

  it('waypoint / reconnect / connection members', () => {
    const out = ktCode(
      FLOW([
        `flow.addEdgeWaypoint('e1', { x: 1, y: 2 }, 0)`,
        `flow.addEdgeWaypoint('e1', { x: 1, y: 2 })`,
        `flow.addEdgeWaypoint('e1', p)`,
        `flow.updateEdgeWaypoint('e1', 0, { x: 1, y: 2 })`,
        `flow.updateEdgeWaypoint('e1', 0, p)`,
        `flow.reconnectEdge('e1', { source: '2', targetHandle: 'h' })`,
        `flow.reconnectEdge('e1', { zzz: 1 })`,
        `flow.isValidConnection({ source: 'a', target: 'b', sourceHandle: 's', targetHandle: 't' })`,
        `flow.isValidConnection({ source: 'a' })`,
        `flow.isValidConnection(conn)`,
      ]),
    )
    expect(out).toContain('flow.addEdgeWaypoint("e1", PyreonXYPosition(1.0, 2.0), 0)')
    expect(out).toContain('flow.addEdgeWaypoint("e1", PyreonXYPosition(1.0, 2.0)) }')
    expect(out).toContain('flow.addEdgeWaypoint("e1", p)')
    expect(out).toContain('flow.updateEdgeWaypoint("e1", 0, PyreonXYPosition(1.0, 2.0))')
    expect(out).toContain('flow.updateEdgeWaypoint("e1", 0L, p)')
    expect(out).toContain('flow.reconnectEdge("e1", source = "2", targetHandle = "h")')
    expect(out).not.toContain('flow.reconnectEdge("e1", zzz')
    expect(out).toContain('flow.isValidConnection(PyreonFlowConnection(source = "a", target = "b", sourceHandle = "s", targetHandle = "t"))')
    expect(out).not.toContain('PyreonFlowConnection(source = "a")')
    expect(out).toContain('flow.isValidConnection(conn)')
  })

  it('bulk node/edge members build literal lists; a non-literal or malformed list passes through', () => {
    const out = ktCode(
      FLOW([
        `flow.addNodes([{ id: 'q', position: { x: 1, y: 2 }, data: { label: 'z' } }])`,
        `flow.setNodes([{ id: 'q', data: { label: 'z' } }])`,
        `flow.setNodes(ns)`,
        `flow.addEdges([{ source: 'a', target: 'b' }])`,
        `flow.setEdges([{ source: 'a' }])`,
      ]),
    )
    expect(out).toContain('flow.addNodes(listOf(PyreonFlowNode(id = "q", position = PyreonXYPosition(1.0, 2.0)')
    expect(out).not.toContain('flow.setNodes(listOf(PyreonFlowNode')
    expect(out).toContain('flow.setNodes(ns)')
    expect(out).toContain('flow.addEdges(listOf(PyreonFlowEdge(id = pyreonFlowEdgeId(source = "a", target = "b"), source = "a", target = "b")))')
    expect(out).not.toContain('flow.setEdges(listOf(PyreonFlowEdge')
  })

  it('setViewport / animateViewport / fitView option handling', () => {
    const out = ktCode(
      FLOW([
        `flow.setViewport({ x: 1, y: 2 }, { duration: 5 })`,
        `flow.setViewport({ x: 1, q: 2 })`,
        `flow.setViewport({ x: 1 }, { nope: 1 })`,
        `flow.animateViewport({ x: 1, zoom: 2 }, 300)`,
        `flow.animateViewport({ x: 1 })`,
        `flow.animateViewport(vv)`,
        `flow.fitView(['1'])`,
        `flow.fitView(['1'], 10, { duration: 3 })`,
        `flow.fitView(['1'], 10, { q: 3 })`,
      ]),
    )
    expect(out).toContain('flow.setViewport(x = 1.0, y = 2.0, duration = 5.0)')
    expect(out).not.toContain('flow.setViewport(x = 1.0, q')
    expect(out).toContain('flow.animateViewport(x = 1.0, zoom = 2.0, duration = 300.0)')
    expect(out).toContain('flow.animateViewport(x = 1.0) }')
    expect(out).toContain('flow.animateViewport(vv)')
    expect(out).toContain('flow.fitView(listOf("1")) }')
    expect(out).toContain('flow.fitView(listOf("1"), padding = 10.0, duration = 3.0)')
    expect(out).not.toContain('padding = 10.0, q')
  })

  it('layout: zero / one / literal-options / non-literal-options arities', () => {
    const out = ktCode(
      FLOW([
        `flow.layout()`,
        `flow.layout('tree')`,
        `flow.layout('tree', { direction: 'DOWN', animate: true, nodeSpacing: 3, layerSpacing: 4, animationDuration: 5, bogus: 1 })`,
        `flow.layout('tree', opts)`,
      ]),
    )
    expect(out).toContain('flow.layout() }')
    expect(out).toContain('flow.layout("tree") }')
    expect(out).toContain(
      'flow.layout("tree", PyreonFlowLayoutOptions(direction = "DOWN", animate = true, nodeSpacing = 3.0, layerSpacing = 4.0, animationDuration = 5.0))',
    )
    expect(out).toContain('flow.layout("tree", opts)')
  })

  it('setCenter / setNodeExtent / clampToExtent / getSnapLines', () => {
    const out = ktCode(
      FLOW([
        `flow.setCenter(1, 2)`,
        `flow.setCenter(1, 2, { zoom: 3, duration: 4 })`,
        `flow.setCenter(1, 2, { bad: 1 })`,
        `flow.setNodeExtent(null)`,
        `flow.setNodeExtent(undefined)`,
        `flow.setNodeExtent([[0, 0], [1, 1]])`,
        `flow.setNodeExtent([[0, 0]])`,
        `flow.clampToExtent({ x: 1, y: 2 }, 3, 4)`,
        `flow.clampToExtent(pp)`,
        `flow.getSnapLines('1', { x: 1, y: 2 }, 5)`,
        `flow.getSnapLines('1', { x: 1, y: 2 })`,
        `flow.getSnapLines('1', pp)`,
      ]),
    )
    expect(out).toContain('flow.setCenter(1.0, 2.0) }')
    expect(out).toContain('flow.setCenter(1.0, 2.0, zoom = 3.0, duration = 4.0)')
    expect(out).toContain('flow.setCenter(1L, 2L, __Obj')
    expect(out.match(/flow\.clearNodeExtent\(\)/g)).toHaveLength(2)
    expect(out).toContain('flow.setNodeExtent(minX = 0.0, minY = 0.0, maxX = 1.0, maxY = 1.0)')
    expect(out).toContain('flow.setNodeExtent(listOf(listOf(0L, 0L)))')
    expect(out).toContain('flow.clampToExtent(PyreonXYPosition(1.0, 2.0), 3.0, 4.0)')
    expect(out).toContain('flow.clampToExtent(pp)')
    expect(out).toContain('flow.getSnapLines("1", PyreonXYPosition(1.0, 2.0), 5.0)')
    expect(out).toContain('flow.getSnapLines("1", PyreonXYPosition(1.0, 2.0)) }')
    expect(out).toContain('flow.getSnapLines("1", pp)')
  })
})

describe('emit-kotlin.ts — public Flow geometry helpers', () => {
  const HELPERS = `
import { createFlow, getBezierPath, getSmoothStepPath, getStepPath, getStraightPath, getWaypointPath, getEdgePath, getHandlePosition, getNodeIntersection, getEffectiveDimensions, getFloatingEndpoints, getSmartHandlePositions, resolveHandleAnchor, resolveMarker, markerId, resolveEdgeMarkers, collectEdgeMarkers, Position, MarkerType } from '@pyreon/flow'
import { Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } }], edges: [] })
  const node = flow.nodes()[0]!
  const g1 = getStraightPath({ sourceX: 0, sourceY: 1, targetX: 2 })
  const g2 = getStraightPath({ sourceX: 0, sourceY: 1, targetX: 2, targetY: 3, bogus: 1 })
  const g3 = getWaypointPath({ sourceX: 0, sourceY: 1, targetX: 2, targetY: 3, waypoints: wps })
  const g4 = getWaypointPath({ sourceX: 0, sourceY: 1, targetX: 2, targetY: 3, waypoints: [5] })
  const g5 = getWaypointPath({ sourceX: 0, sourceY: 1, targetX: 2, targetY: 3, waypoints: [{ x: 1 }] })
  const g6 = getBezierPath({ sourceX: 0, sourceY: 1, targetX: 2, targetY: 3 })
  const g8 = getBezierPath({ sourceX: 0, sourceY: 1, targetX: 2, targetY: 3, sourcePosition: 'middle' })
  const g9 = getSmoothStepPath({ sourceX: 0, sourceY: 1, targetX: 2, targetY: 3 })
  const g10 = getStepPath({ sourceX: 0, sourceY: 1, targetX: 2, targetY: 3, sourcePosition: Position.Left })
  const g11 = getStepPath(opts)
  const h1 = getHandlePosition('top', 0, 1, 2, 3)
  const h2 = getHandlePosition(pos, 0, 1, 2, 3)
  const h3 = getHandlePosition(pick(1), 0, 1, 2, 3)
  const p1 = getEdgePath('bezier', 0, 1, Position.Right, 2, 3, Position.Left)
  const p2 = getEdgePath('bezier', 0, 1, Position.Right, 2, 3, Position.Left, { curvature: 2, borderRadius: 1 })
  const p3 = getEdgePath('bezier', 0, 1, pos, 2, 3, Position.Left)
  const p4 = getEdgePath('bezier', 0, 1, Position.Right, 2, 3, Position.Left, { nope: 1 })
  const i1 = getNodeIntersection({ x: 0, y: 0, width: 1 }, { x: 1, y: 2 })
  const i2 = getNodeIntersection({ x: 0, y: 0, width: 1, height: 2 }, { x: 1, z: 2 })
  const d1 = getEffectiveDimensions(node, meas)
  const d2 = getEffectiveDimensions({ width: 1 })
  const d3 = getEffectiveDimensions(node, { width: 1 })
  const f1 = getFloatingEndpoints(node, node, dims)
  const s1 = getSmartHandlePositions(node, node, { sourceW: 1, sourceH: 1, targetW: 1, targetH: 1 })
  const s2 = getSmartHandlePositions(node, node, dims)
  const s3 = getSmartHandlePositions({ a: 1 }, node)
  const r1 = resolveHandleAnchor(node, 'out', 'source', dims, meas)
  const r2 = resolveHandleAnchor(node, 'out', 'source', dims, { a: 1 })
  const r3 = resolveHandleAnchor({ a: 1 }, 'out', 'source', dims)
  const m1 = resolveMarker(MarkerType.Arrow)
  const m2 = markerId(mk)
  const m3 = resolveEdgeMarkers(edge, 'arrow')
  const m4 = collectEdgeMarkers(edges, null)
  return <Text>{g1.path}</Text>
}`
  const r = kt(HELPERS)
  const line = (name: string) => r.code.split('\n').find((l) => l.trimStart().startsWith(`val ${name} =`)) ?? ''
  const w = r.warnings

  it('path builders: missing/unknown fields and malformed waypoints do NOT lower, and each is NAMED', () => {
    for (const name of ['g1', 'g2', 'g3', 'g4', 'g5', 'g8', 'g11']) expect(line(name)).not.toContain('pyreon')
    expect(w.filter((x) => x === 'getStraightPath requires one supported object-literal parameter to lower natively.')).toHaveLength(2)
    expect(w.filter((x) => x === 'getWaypointPath requires one supported object-literal parameter to lower natively.')).toHaveLength(3)
    expect(w).toContain('getBezierPath requires one supported object-literal parameter to lower natively.')
    expect(w).toContain('getStepPath requires one supported object-literal parameter to lower natively.')
  })

  it('path builders: absent positions default to Bottom/Top; an explicit Position member is honoured', () => {
    expect(line('g6')).toContain('pyreonBezierPath(0.0, 1.0, PyreonFlowPosition.Bottom, 2.0, 3.0, PyreonFlowPosition.Top)')
    expect(line('g9')).toContain('pyreonSmoothStepPath(0.0, 1.0, PyreonFlowPosition.Bottom, 2.0, 3.0, PyreonFlowPosition.Top)')
    expect(line('g10')).toContain('pyreonStepPath(0.0, 1.0, PyreonFlowPosition.Left, 2.0, 3.0, PyreonFlowPosition.Top)')
  })

  it('getHandlePosition: a string position and a call lower; a bare identifier is NAMED', () => {
    expect(line('h1')).toContain('pyreonHandlePosition(PyreonFlowPosition.Top, 0.0, 1.0, 2.0, 3.0)')
    expect(line('h2')).toContain('getHandlePosition(pos, 0L, 1L, 2L, 3L)')
    expect(line('h3')).toContain('pyreonHandlePosition(pick(1L), 0.0, 1.0, 2.0, 3.0)')
    expect(w).toContain('getHandlePosition requires a literal Position value to lower natively.')
  })

  it('getEdgePath: options optional; a non-literal position or unknown option is NAMED', () => {
    expect(line('p1')).toContain('pyreonEdgePath("bezier", 0.0, 1.0, PyreonFlowPosition.Right, 2.0, 3.0, PyreonFlowPosition.Left)')
    expect(line('p2')).toContain('PyreonFlowPosition.Left, curvature = 2.0, borderRadius = 1.0)')
    expect(line('p3')).toContain('getEdgePath(')
    expect(line('p4')).toContain('getEdgePath(')
    expect(w.filter((x) => x.startsWith('getEdgePath requires'))).toHaveLength(2)
  })

  it('geometry literals must have EXACTLY the named fields', () => {
    expect(line('i1')).toContain('getNodeIntersection(')
    expect(line('i2')).toContain('getNodeIntersection(')
    expect(w.filter((x) => x.startsWith('getNodeIntersection requires'))).toHaveLength(2)
  })

  it('node-expression helpers refuse anonymous object literals and name it', () => {
    expect(line('d1')).toContain('pyreonEffectiveDimensions(node, meas)')
    expect(line('d2')).toContain('getEffectiveDimensions(')
    expect(line('d3')).toContain('getEffectiveDimensions(node, ')
    expect(w.filter((x) => x.startsWith('getEffectiveDimensions requires'))).toHaveLength(2)
    expect(line('f1')).toContain('getFloatingEndpoints(node, node, dims)')
    expect(w.some((x) => x.startsWith('getFloatingEndpoints requires'))).toBe(true)
    expect(line('s1')).toContain('pyreonGetSmartHandlePositions(node, node, PyreonFlowNodeBoxDimensions(1.0, 1.0, 1.0, 1.0))')
    expect(line('s2')).toContain('getSmartHandlePositions(node, node, dims)')
    expect(line('s3')).toContain('getSmartHandlePositions(')
    expect(w.filter((x) => x.startsWith('getSmartHandlePositions requires'))).toHaveLength(2)
    expect(line('r1')).toContain('pyreonResolveHandleAnchor(node, "out", "source", dims, meas)')
    expect(line('r2')).toContain('resolveHandleAnchor(node, ')
    expect(line('r3')).toContain('resolveHandleAnchor(')
    expect(w.filter((x) => x.startsWith('resolveHandleAnchor requires'))).toHaveLength(2)
  })

  it('marker helpers resolve literal markers and pass other values through', () => {
    expect(line('m1')).toContain('pyreonResolveFlowMarker(PyreonFlowMarker("arrow"))')
    expect(line('m2')).toContain('pyreonFlowMarkerId(mk)')
    expect(line('m3')).toContain('pyreonResolveFlowEdgeMarkers(edge, PyreonFlowMarker("arrow"))')
    expect(line('m4')).toContain('pyreonCollectFlowEdgeMarkers(edges, null)')
  })

  it('computeLayout: no options lowers; unsupported or non-literal options are NAMED', () => {
    const src = (opt: string) => `
import { createFlow, computeLayout } from '@pyreon/flow'
import { Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  return <Button onPress={async () => { const p = await computeLayout(flow.nodes(), flow.edges()${opt}); console.log(p) }}>L</Button>
}`
    expect(ktCode(src(''))).toContain('pyreonComputeFlowLayout(flow.nodes, flow.edges)')
    for (const opt of [", 'tree', { bogus: 1 }", ", 'tree', opts"]) {
      expect(warns(src(opt))).toContain('computeLayout options must be an object literal')
    }
  })
})

describe('emit-kotlin.ts — flow-state signal writes and lookup maps', () => {
  const out = kt(
    FLOW([
      `flow.nodes.set([{ id: 'q', position: { x: 1, y: 2 }, data: { label: 'z' } }])`,
      `flow.edges.set([{ source: 'a', target: 'b' }])`,
      `flow.edges.set(es)`,
      `flow.nodes.update((ns) => ns)`,
      `flow.viewport.set({ x: 1, y: 2, zoom: 3 })`,
      `flow.viewport.set({ x: 1, y: 2 })`,
      `flow.viewport.update((v) => ({ ...v, zoom: 2 }))`,
      `flow.viewport.update((v) => ({ x: 1, y: 2, zoom: 3 }))`,
      `flow.containerSize.set({ width: 1, height: 2 })`,
      `flow.containerSize.update((s) => ({ ...s, width: 3 }))`,
      `flow.containerSize.update((s) => ({ ...other, width: 3 }))`,
      `flow.measurements.set(new Map<string, number>())`,
      `flow.measurements.set(m)`,
      `flow.measurements.update((mm) => mm)`,
      `flow.measurements.update(fn)`,
      `flow.zoom.set(3)`,
    ]).replace(
      '<Text>{flow.nodes().length}</Text>',
      `<Text>{flow.edgeMap().has('e1') ? 'y' : 'n'}</Text>
      <Text>{String(flow.measurements().get('1'))}</Text>`,
    ),
  )

  it('nodes/edges writes route through setNodes/setEdges, building literal lists when they can', () => {
    expect(out.code).toContain('flow.setNodes(listOf(PyreonFlowNode(id = "q"')
    expect(out.code).toContain('flow.setEdges(listOf(PyreonFlowEdge(id = pyreonFlowEdgeId(source = "a", target = "b")')
    expect(out.code).toContain('flow.setEdges(es)')
    expect(out.code).toContain('flow.setNodes({ ns -> ns })')
  })

  it('viewport / containerSize writes become typed constructors; a spread keeps the missing fields from the param', () => {
    expect(out.code).toContain('flow.setViewport(PyreonFlowViewport(x = 1.0, y = 2.0, zoom = 3.0))')
    expect(out.code).toContain('flow.setViewport { v -> PyreonFlowViewport(x = v.x, y = v.y, zoom = 2.0) }')
    expect(out.code).toContain('flow.setViewport { v -> PyreonFlowViewport(x = 1.0, y = 2.0, zoom = 3.0) }')
    expect(out.code).toContain('flow.replaceContainerSize(PyreonFlowContainerSize(width = 1.0, height = 2.0))')
    expect(out.code).toContain('flow.updateContainerSize { s -> PyreonFlowContainerSize(width = 3.0, height = s.height) }')
  })

  it('measurements writes: an empty typed Map → emptyMap(), others replace/update verbatim', () => {
    expect(out.code).toContain('flow.replaceMeasurements(emptyMap())')
    expect(out.code).toContain('flow.replaceMeasurements(m)')
    expect(out.code).toContain('flow.updateMeasurements({ mm -> mm })')
  })

  it('writes the native type cannot take are NAMED (incomplete viewport, foreign spread, non-arrow update, zoom)', () => {
    const w = out.warnings.join('\n')
    expect(w).toContain('`viewport.set(...)` writes the `viewport` signal directly')
    expect(w).toContain('`containerSize.update(...)` writes the `containerSize` signal directly')
    expect(w).toContain('`measurements.update(...)` writes the `measurements` signal directly')
    expect(w).toContain('`zoom.set(...)` writes the `zoom` signal directly')
  })

  it('edgeMap().has / measurements().get read the native lookup maps', () => {
    expect(out.code).toContain('flow.edgeLookup.containsKey("e1")')
    expect(out.code).toContain('flow.measurements.get("1")')
  })
})

describe('emit-kotlin.ts — JS method arities the mapping does not model are not lowered', () => {
  // Each JS method maps to a Kotlin spelling for ONE arity. An extra (or
  // missing) argument must not be squeezed into that spelling — that would
  // silently drop the argument — so the call falls through verbatim.
  const out = ktCode(`
import { Text } from '@pyreon/primitives'
export function App() {
  const m = new Map<string, number>()
  const st = new Set<string>()
  const xs: number[] = [1, 2, 3]
  const s = 'abc'
  const a1 = m.clear(1)
  const a2 = st.clear(1)
  const a3 = xs.some((x) => x > 1, null)
  const a4 = xs.every((x) => x > 1, null)
  const a5 = xs.filter((x) => x > 1, null)
  const a6 = xs.includes(1, 2)
  const a7 = s.charAt()
  const a8 = s.charCodeAt()
  const a9 = xs.join(',', 'x')
  const a10 = xs.concat([1], [2])
  const a11 = xs.fill(0, 1)
  const a12 = xs.at()
  const a13 = xs.findIndex()
  const a14 = s.replace('a')
  const a15 = xs.reverse(1)
  const a16 = s.toUpperCase('tr')
  const a17 = s.toLowerCase('tr')
  const a18 = xs.slice()
  const a19 = s.slice()
  return <Text>{s}</Text>
}`)
  const line = (n: string) => out.split('\n').find((l) => l.trimStart().startsWith(`val ${n} =`))!.trim()

  it('each mismatched arity is emitted as written', () => {
    expect(line('a1')).toBe('val a1 = m.clear(1L)')
    expect(line('a2')).toBe('val a2 = st.clear(1L)')
    expect(line('a3')).toBe('val a3 = xs.some({ x -> x > 1L }, null)')
    expect(line('a4')).toBe('val a4 = xs.every({ x -> x > 1L }, null)')
    expect(line('a5')).toBe('val a5 = xs.filter({ x -> x > 1L }, null)')
    expect(line('a6')).toBe('val a6 = xs.includes(1L, 2L)')
    expect(line('a7')).toBe('val a7 = s.charAt()')
    expect(line('a8')).toBe('val a8 = s.charCodeAt()')
    expect(line('a9')).toBe('val a9 = xs.join(",", "x")')
    expect(line('a10')).toBe('val a10 = xs.concat(listOf(1L), listOf(2L))')
    expect(line('a11')).toBe('val a11 = xs.fill(0L, 1L)')
    expect(line('a12')).toBe('val a12 = xs.at()')
    expect(line('a13')).toBe('val a13 = xs.findIndex()')
    expect(line('a14')).toBe('val a14 = s.replace("a")')
    expect(line('a15')).toBe('val a15 = xs.reverse(1L)')
    expect(line('a16')).toBe('val a16 = s.toUpperCase("tr")')
    expect(line('a17')).toBe('val a17 = s.toLowerCase("tr")')
  })

  it('a zero-arg slice copies a list and is the identity on a string', () => {
    expect(line('a18')).toBe('val a18 = xs.toList()')
    expect(line('a19')).toBe('val a19 = s')
  })
})

describe('emit-kotlin.ts — optional truthiness in conditions (kotlinCondition)', () => {
  const r = kt(`
import { signal } from '@pyreon/reactivity'
import { Text, Stack } from '@pyreon/primitives'
function Badge(props: { n: number }) { return <Text>{props.n}</Text> }
export function Card(props: { on?: boolean; n?: number; s?: string }) {
  const count = signal<number | undefined>(undefined)
  const flag = signal<boolean | undefined>(undefined)
  const name = signal<string | undefined>(undefined)
  const localN: number | undefined = props.n
  const localS: string | undefined = props.s
  const a = props.on ? 'y' : 'n'
  const b = !props.on ? 'y' : 'n'
  const c = flag() ? 'y' : 'n'
  const d = !flag() ? 'y' : 'n'
  const e = localN ? 'y' : 'n'
  const f = !localN ? 'y' : 'n'
  const g = localS ? 'y' : 'n'
  const h = !localS ? 'y' : 'n'
  const i = count() ? 'y' : 'n'
  const i2 = !count() ? 'y' : 'n'
  const j = !name() ? 'y' : 'n'
  return (
    <Stack>
      <Text>{a + b + c + d + e + f + g + h + i + i2 + j}</Text>
      {flag() ? <Text>{String(flag())}</Text> : null}
    </Stack>
  )
}`)
  const line = (n: string) => r.code.split('\n').find((l) => l.trimStart().startsWith(`val ${n} =`))!.trim()

  it('an optional BOOLEAN is truthy only when `== true`', () => {
    expect(line('a')).toBe('val a = if (on == true) "y" else "n"')
    expect(line('b')).toBe('val b = if (on != true) "y" else "n"')
    expect(line('c')).toBe('val c = if (flag == true) "y" else "n"')
    expect(line('d')).toBe('val d = if (flag != true) "y" else "n"')
  })

  it('a STABLE optional number / string keeps the smart-castable `x != null && …` form', () => {
    expect(line('e')).toBe('val e = if (localN != null && localN.toDouble() != 0.0) "y" else "n"')
    expect(line('f')).toBe('val f = if (localN == null || localN.toDouble() == 0.0) "y" else "n"')
    expect(line('g')).toBe('val g = if (localS != null && localS.isNotEmpty()) "y" else "n"')
    expect(line('h')).toBe('val h = if (localS == null || localS.isEmpty()) "y" else "n"')
  })

  it('an UNSTABLE optional string uses the safe-call form', () => {
    expect(line('j')).toBe('val j = if (name?.isNotEmpty() != true) "y" else "n"')
  })

  // BUG FIXED HERE: the safe-call form for a NUMBER was
  // `count?.toDouble() != 0.0 == true`, which Kotlin parses as
  // `(count?.toDouble() != 0.0) == true` — `null != 0.0` is true, so an
  // ABSENT count read as truthy (and `!count()` as falsy), the opposite of
  // JS. Coalescing to 0 first matches JS and the Swift twin `(x ?? 0) != 0`.
  it('an UNSTABLE optional number coalesces to 0 before the test (absent is falsy, like JS)', () => {
    expect(line('i')).toBe('val i = if ((count?.toDouble() ?: 0.0) != 0.0) "y" else "n"')
    expect(line('i2')).toBe('val i2 = if ((count?.toDouble() ?: 0.0) == 0.0) "y" else "n"')
    expect(r.code).not.toContain('toDouble() != 0.0 == true')
  })

  it('a ternary on an optional boolean binds it with takeIf { it }', () => {
    expect(r.code).toContain('when (val flag = flag?.takeIf { it }) { null -> null else -> Text(text = "${(flag).toString()}") }')
  })
})

describe('emit-kotlin.ts — presence tests that cannot narrow are NAMED', () => {
  const r = kt(`
import { signal } from '@pyreon/reactivity'
import { Text, Stack, Button } from '@pyreon/primitives'
type Item = { id: number; name: string }
export function List() {
  const items = signal<Item[]>([])
  const sel = signal<Item | undefined>(undefined)
  return (
    <Stack>
      {items().find((x) => x.id === 1) ? <Text>{items().find((x) => x.id === 1)!.name}</Text> : null}
      {items().find((x) => x.id === 2) && <Text>{items().find((x) => x.id === 2)!.name}</Text>}
      {sel() ? <Button onPress={() => { const sel = 3; console.log(sel) }}>{sel().name}</Button> : <Text>none</Text>}
      {sel() && <Button onPress={() => { const sel = 3; console.log(sel) }}>{sel().name}</Button>}
    </Stack>
  )
}`)
  const w = r.warnings

  it('a re-evaluated call subject (items().find(…)) is named once per distinct subject', () => {
    expect(w.filter((x) => x.includes('is tested for presence and then read again'))).toHaveLength(2)
  })

  it('a branch that shadows the subject cannot be rewritten — named once, deduplicated across both forms', () => {
    expect(w.filter((x) => x.startsWith('`sel`: the branch that follows reads it as NON-optional'))).toHaveLength(1)
    expect(w.join('\n')).toContain('Kotlin cannot smart-cast this value')
  })
})

describe('emit-kotlin.ts — render props / view slots (emitKotlinSlotUse / emitKotlinSlotArg)', () => {
  const r = kt(`
import { Stack, Text } from '@pyreon/primitives'
import type { VNodeChild } from '@pyreon/core'
type User = { name: string; age: number }
function Card(props: { header?: VNodeChild; footer: VNodeChild; row?: (u: User) => VNodeChild; empty: () => VNodeChild }) {
  const u: User = { name: 'a', age: 1 }
  return (
    <Stack>
      {props.header}
      {props.footer}
      {props.row?.(u)}
      {props.empty()}
    </Stack>
  )
}
const renderEmpty = () => <Text>empty</Text>
const renderRow = (u: User) => <Text>{u.name}</Text>
function Wrap(props: { empty: () => VNodeChild }) {
  return <Card footer={<Text>f</Text>} empty={props.empty} />
}
export function App() {
  return (
    <Stack>
      <Card header={<Text>h</Text>} footer={renderEmpty()} row={renderRow} empty={renderEmpty} />
      <Card footer={<Text>f</Text>} row={(u) => { console.log(u); return <Text>x</Text> }} empty={() => <Text>e</Text>} />
      <Card footer={42} empty={() => <Text>e</Text>} />
      <Wrap empty={() => <Text>w</Text>} />
    </Stack>
  )
}`)

  it('an OPTIONAL bare slot and an optional callable slot are invoked with ?.invoke', () => {
    expect(r.code).toContain('header?.invoke()')
    expect(r.code).toContain('row?.invoke(u)')
    expect(r.code).toContain('    footer()')
    expect(r.code).toContain('    empty()')
  })

  it('view helpers at a slot position are WRAPPED in a lambda (never a function reference)', () => {
    expect(r.code).toContain('row = { a0 -> renderRow(a0) }, empty = { renderEmpty() }')
    // a view-rendering CALL is wrapped as a lambda body
    expect(r.code).toMatch(/footer = \{\n\s+renderEmpty\(\)\n\s+\}/)
  })

  it('a zero-arity inline arrow opens a bare `{` lambda; a forwarded slot passes by name', () => {
    expect(r.code).toMatch(/empty = \{\n\s+Text\(text = "e"\)/)
    expect(r.code).toContain('Card(footer = {\n    Text(text = "f")\n  }, empty = empty)')
  })

  it('a block-bodied render callback and a non-view value are NAMED', () => {
    expect(r.code).toContain('row = { u -> }')
    const w = r.warnings.join('\n')
    expect(w).toContain("<Card row={…}>: this render callback's BLOCK body")
    expect(w).toContain('<Card footer={…}>: this render prop is not an inline arrow')
    expect(r.code).toContain('Card(footer = 42L,')
  })
})

describe('emit-kotlin.ts — <Flow> host, its supporting components, and orphan flow components', () => {
  const r = kt(`
import { createFlow, Flow, Background, Controls, MiniMap, Panel, Handle, NodeToolbar, EdgeText, ViewportPortal } from '@pyreon/flow'
import { Text, Stack } from '@pyreon/primitives'
const pick = (n: unknown) => 'red'
function Orphan() {
  return (
    <Stack>
      <Handle type="source" position="right" style="x" class="y" />
      <NodeToolbar style="x" class="y"><Text>t</Text></NodeToolbar>
      <EdgeText x={1} y={2} label="hi" />
      <EdgeText label="hi" />
      <ViewportPortal><Text>p</Text></ViewportPortal>
    </Stack>
  )
}
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  return (
    <Stack>
      <Flow instance={flow} nodeTypes={types} edgeTypes={etypes} connectionLine={makeLine()} style="a" class="b" ariaLabel="graph" colorMode="dark">
        <Background variant="lines" gap={8} size={dyn} />
        <Controls position="top-right" showLock={true}><Text>extra</Text></Controls>
        <MiniMap nodeColor={pick} maskColor={pick} width={120.5} height={dyn} style="s" pannable={false} />
        <Panel position={where} style="q"><Text>p1</Text></Panel>
        <Panel position="bottom-left"><Text>p2</Text></Panel>
        <Panel position="bottom-right"><Text>p3</Text></Panel>
        <Text>other</Text>
      </Flow>
      <Flow instance={flow}>
        <Background variant="cross" />
        <Controls position={cp} />
        <MiniMap nodeColor="#fff" />
      </Flow>
      <Flow instance={flow}>
        <Background variant={bv} />
        <Controls position="bottom-right" />
      </Flow>
      <Flow instance={flow}><Controls position="top-left" /></Flow>
      <Flow />
      <Controls />
      <Controls instance={flow} position="bottom-left"><Text>x</Text></Controls>
      <Orphan />
    </Stack>
  )
}`)
  const w = r.warnings.join('\n')

  it('non-literal nodeTypes / edgeTypes / connectionLine and host CSS are each NAMED; the defaults are used', () => {
    expect(w).toContain('<Flow nodeTypes={…}> must be a literal { type: Component } map')
    expect(w).toContain('<Flow edgeTypes={…}> must be a literal { type: Component } map')
    expect(w).toContain('<Flow connectionLine={…}> must reference a component identifier')
    expect(w).toContain('<Flow style> is browser CSS')
    expect(w).toContain('<Flow class> is browser CSS')
    expect(r.code).not.toContain('customEdgeTypes')
    expect(r.code).not.toContain('customConnectionLineEnabled')
  })

  it('background / controls / minimap styles lower with literal Doubles and dynamic `.toDouble()`', () => {
    expect(r.code).toContain('background = PyreonFlowBackgroundStyle(variant = PyreonFlowBackgroundVariant.Lines, gap = 8.0, size = (dyn).toDouble(), color = null)')
    expect(r.code).toContain('position = PyreonFlowControlsPosition.TopRight), controlsContent = {\n    Text(text = "extra")')
    // a CALLBACK nodeColor travels separately; a callback maskColor falls back to the default
    expect(r.code).toContain('miniMap = PyreonFlowMiniMapStyle(nodeColor = null, maskColor = "#000000", width = 120.5, height = (dyn).toDouble(), pannable = false, zoomable = true), miniMapNodeColor = pick')
    expect(r.code).toContain('ariaLabel = "graph", colorMode = "dark"')
    expect(r.code).toContain('variant = PyreonFlowBackgroundVariant.Cross, gap = 20.0, size = 1.0')
    expect(r.code).toContain('position = pyreonFlowControlsPosition(cp)')
    expect(r.code).toContain('nodeColor = "#fff"')
    expect(r.code).toContain('variant = pyreonFlowBackgroundVariant(bv)')
    expect(r.code).toContain('position = PyreonFlowControlsPosition.BottomRight')
    expect(r.code).toContain('position = PyreonFlowControlsPosition.TopLeft')
    expect(w).toContain('<MiniMap style> is browser CSS')
  })

  it('panels overlay the view per position; colorMode re-wraps the overlay stack; a dynamic position is NAMED', () => {
    expect(r.code).toContain('PyreonFlowColorMode("dark") {\nBox {')
    expect(r.code).toContain('Box(modifier = Modifier.align(Alignment.TopStart).padding(10.dp)) {\n      Text(text = "p1")')
    expect(r.code).toContain('Modifier.align(Alignment.BottomStart)')
    expect(r.code).toContain('Modifier.align(Alignment.BottomEnd)')
    expect(r.code).toContain('    Text(text = "other")')
    expect(w).toContain('<Panel position={…}> must be a string literal to lower natively')
    expect(w).toContain('<Panel style> uses browser CSS')
  })

  it('a <Flow> or standalone <Controls> without `instance` is dropped and NAMED; with it, controls lower standalone', () => {
    expect(w).toContain('<Flow> requires `instance={flow}` for native lowering')
    expect(w).toContain('<Controls> outside <Flow> requires `instance={flow}`')
    expect(r.code).toContain(
      'PyreonStandaloneFlowControls(state = flow, style = PyreonFlowControlsStyle(showZoomIn = true, showZoomOut = true, showFitView = true, showLock = false, position = PyreonFlowControlsPosition.BottomLeft), extraContent = {',
    )
  })

  it('flow components outside a node renderer: CSS NAMED, an incomplete EdgeText and a ViewportPortal dropped', () => {
    expect(w).toContain('<Handle style> is browser CSS')
    expect(w).toContain('<Handle class> is browser CSS')
    expect(w).toContain('<NodeToolbar style> is browser CSS')
    expect(w).toContain('<NodeToolbar class> is browser CSS')
    expect(r.code).toContain('PyreonFlowEdgeText(x = (1L).toDouble(), y = (2L).toDouble(), label = "hi")')
    expect(w).toContain('A native Flow <EdgeText> needs `x`, `y` and `label`; it was dropped.')
    expect(w).toContain('<ViewportPortal> positions arbitrary content in flow coordinates')
  })
})

describe('emit-kotlin.ts — FlowWebView hosts and media flags', () => {
  const r = kt(`
import { FlowWebView } from '@pyreon/flow/webview'
import { Stack, WebView, Video, Audio } from '@pyreon/primitives'
export function App() {
  return (
    <Stack>
      <FlowWebView />
      <FlowWebView graph={g} nodeHeight={30} nodeFill="#abc" labelColor="red" />
      <FlowWebView graph={g} html={h} nodeWidth={3} background="#000" />
      <WebView html="<p/>" paddingX={4} paddingY={2} />
      <Video src="a.mp4" autoPlay loop />
      <Audio src="a.mp3" autoPlay={true} loop={true} />
      <Audio src="a.mp3" />
    </Stack>
  )
}`)
  const w = r.warnings.join('\n')

  it('FlowWebView: missing graph is NAMED; static node geometry / colours are baked into the host page', () => {
    expect(w).toContain('<FlowWebView>: `graph` is required on native; emitting an empty host.')
    expect(r.code).toContain('var NODE_W = 150, NODE_H = 30;')
    expect(r.code).toContain('#abc')
    expect(r.code).toContain('PyreonWebView(html = h, data = PyreonJson.encode(g))')
    expect(w).toContain('<FlowWebView html={…} nodeWidth={…}>: nodeWidth is ignored')
    expect(w).toContain('<FlowWebView html={…} background={…}>: background is ignored')
  })

  it('paddingX / paddingY become horizontal / vertical padding on a web view', () => {
    expect(r.code).toContain('PyreonWebView(html = "<p/>", modifier = Modifier.padding(horizontal = 16.dp).padding(vertical = 8.dp))')
  })

  it('autoPlay / loop flags are passed only when literally true', () => {
    expect(r.code).toContain('PyreonVideoPlayer(url = "a.mp4", autoPlay = true, loop = true)')
    expect(r.code).toContain('PyreonAudioPlayer(url = "a.mp3", autoPlay = true, loop = true, engine = Media3AudioEngine(LocalContext.current))')
    expect(r.code).toContain('PyreonAudioPlayer(url = "a.mp3", engine = Media3AudioEngine(LocalContext.current))')
  })
})

describe('emit-kotlin.ts — assorted expression arms', () => {
  it('createFlow over HETEROGENEOUS node data synthesizes one row class with an optional union field', () => {
    const out = ktCode(`
import { createFlow } from '@pyreon/flow'
import { Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({
    nodes: [
      { id: '1', position: { x: 0, y: 0 }, data: { label: 'A', w: 1 } },
      { id: '2', position: { x: 0, y: 0 }, data: { label: 'B', w: 'x' } },
      { id: '3', position: { x: 0, y: 0 }, data: { label: 'C' } },
    ],
    edges: [],
  })
  return <Text>{flow.nodes().length}</Text>
}`)
    // w is Int in one row, String in another, absent in the third
    expect(out).toContain('data class __Obj0(var label: String, var w: Any? = null)')
    expect(out).toContain('PyreonFlowState<__Obj0>(')
    expect(out).toContain('data = __Obj0(label = "C")')
  })

  it('flow.config reads map to native properties; an unrepresented key is NAMED; MarkerType members are marker strings', () => {
    const r = kt(`
import { createFlow, MarkerType } from '@pyreon/flow'
import { Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  const m = MarkerType.Arrow
  const z = flow.config.minZoom
  const q = flow.config.bogus
  return <Text>{m + String(z) + String(q)}</Text>
}`)
    expect(r.code).toContain('val m = "arrow"')
    expect(r.code).toContain('val z = flow.minZoom')
    expect(r.code).toContain('val q = flow.config.bogus')
    expect(r.warnings.join('\n')).toContain('`config.bogus` is not represented by the native Flow configuration')
  })

  it('useToggle.setFalse and useCounter.set() / reset() lower to clamped field writes', () => {
    const out = ktCode(`
import { useToggle, useCounter } from '@pyreon/hooks'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const t = useToggle(false)
  const c = useCounter(5, { min: 0, max: 10 })
  return (
    <Stack>
      <Button onPress={() => t.setFalse()}>a</Button>
      <Button onPress={() => c.set()}>b</Button>
      <Button onPress={() => c.reset()}>c</Button>
    </Stack>
  )
}`)
    expect(out).toContain('Button(onClick = { t = false })')
    // no argument → 0, clamped into [min, max]
    expect(out).toContain('Button(onClick = { c = minOf(maxOf(0L, 0L), 10L) })')
    // reset → the INITIAL value, clamped
    expect(out).toContain('Button(onClick = { c = minOf(maxOf(5L, 0L), 10L) })')
  })

  it('parseInt with a non-literal radix passes the radix expression through', () => {
    expect(ktCode(`
import { Text } from '@pyreon/primitives'
export function App(props: { s: string; base: number }) {
  const r = parseInt(props.s, props.base)
  return <Text>{r}</Text>
}`)).toContain('((s).toLongOrNull((base).toInt()) ?: 0L)')
  })

  it('Boolean() of an optional string / number follows JS truthiness; Object.keys/values degrade to typed empty lists (NAMED)', () => {
    const r = kt(`
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function App(props: { cfg: Record<string, number> }) {
  const name = signal<string | undefined>(undefined)
  const age = signal<number | undefined>(undefined)
  const k = Object.keys(props.cfg)
  const v = Object.values(props.cfg)
  const b1 = Boolean(name())
  const b2 = Boolean(age())
  return <Text>{String(k.length + v.length) + String(b1) + String(b2)}</Text>
}`)
    expect(r.code).toContain('val b1 = (name ?: "").isNotEmpty()')
    expect(r.code).toContain('val b2 = ((age ?: 0L) != 0L)')
    expect(r.code).toContain('val k = emptyList<String>()')
    expect(r.code).toContain('val v = emptyList<Any>()')
    const w = r.warnings.join('\n')
    expect(w).toContain('Object.keys(...) has no native equivalent')
    expect(w).toContain('Object.values(...) has no native equivalent')
  })

  it('an `Error` parameter is Kotlin `Throwable`; a nested array field names its class in the SINGULAR only when plural', () => {
    const out = ktCode(`
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
function describeErr(err: Error): string { return err.message }
export function App() {
  const tree = signal({ title: 'x', child: [{ id: 1 }], items: [{ id: 2 }] })
  return <Text>{tree().title}</Text>
}`)
    expect(out).toContain('fun describeErr(err: Throwable): String = err.message')
    // `child` does not end in `s`, so it is used as-is; `items` singularizes
    expect(out).toContain('data class AppTreeChild(val id: Long)')
    expect(out).toContain('data class AppTreeItem(val id: Long)')
  })
})

describe('emit-kotlin.ts — <PlotChart> mark option literals (kotlinMarkOptionArgs)', () => {
  const plot = (opts: string) => kt(`import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10 }]
export function C() { const w = signal(1); return <Stack><PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, ${opts})]} height={200} /></Stack> }`)
  const series = (r: ReturnType<typeof kt>) => r.code.split('\n').find((l) => l.includes('Series(kind = "bars"'))

  it('literal gradient stops / direction / shape and a literal pattern all bake into the Series', () => {
    const r = plot("{ gradient: { stops: [{ offset: 0, color: 'red' }, { offset: 1, color: 'blue' }], direction: 'vertical', shape: 'bar' }, pattern: { kind: 'dots', color: 'red', spacing: 4, width: 1 } }")
    expect(r.warnings).toEqual([])
    const s = series(r)!
    expect(s).toContain(
      'gradient = SeriesGradient(stops = listOf(PyreonChartGradientStop(offset = 0.0, color = "red"), PyreonChartGradientStop(offset = 1.0, color = "blue")), direction = "vertical", shape = "bar")',
    )
    expect(s).toContain('pattern = PyreonChartPattern(kind = "dots", color = "red"')
  })

  it.each([
    ['a non-literal pattern', '{ pattern: w() }', '`pattern` needs literal kind/color/spacing/width fields'],
    ['a pattern missing width', "{ pattern: { kind: 'dots', color: 'red', spacing: 4 } }", '`pattern` needs literal kind/color/spacing/width fields'],
    ['a non-literal gradient', '{ gradient: w() }', '`gradient` needs literal stops'],
    ['non-literal stops', '{ gradient: { stops: w() } }', '`gradient` needs literal stops'],
    ['a non-object stop', '{ gradient: { stops: [3] } }', '`gradient` needs literal stops'],
    ['a stop with a non-string colour', '{ gradient: { stops: [{ offset: 0, color: 3 }] } }', '`gradient` needs literal stops'],
    ['a non-string direction', "{ gradient: { stops: [{ offset: 0, color: 'red' }], direction: 3 } }", '`gradient` needs literal stops'],
    ['a non-string shape', "{ gradient: { stops: [{ offset: 0, color: 'red' }], shape: 3 } }", '`gradient` needs literal stops'],
  ])('declines %s — the chart is dropped and the reason NAMED', (_why, opts, expected) => {
    const r = plot(opts)
    expect(series(r)).toBeUndefined()
    expect(r.warnings.join('\n')).toContain(`<PlotChart> mark 1: ${expected}`)
  })
})
