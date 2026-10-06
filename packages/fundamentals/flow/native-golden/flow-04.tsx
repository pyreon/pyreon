// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { createFlow, computeLayout, getBezierPath, getSmoothStepPath, getStepPath, getStraightPath, getWaypointPath, resolveMarker, markerId, resolveEdgeMarkers, collectEdgeMarkers, getHandlePosition, getEdgePath, Position } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  const run = () => {
    flow.onConnectStart(() => {})
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
    flow.getSnapLines('1', { x: 1, y: 2 })
  }
  return (<Stack><Button onPress={run}>go</Button><Text>{() => String(flow.nodes().length)}</Text></Stack>)
}
