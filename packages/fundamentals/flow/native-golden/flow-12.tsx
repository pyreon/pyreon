// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { createFlow, getNodeIntersection, getEffectiveDimensions, getFloatingEndpoints, getSmartHandlePositions, resolveHandleAnchor, resolveMarker, collectEdgeMarkers } from '@pyreon/flow'
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
}
