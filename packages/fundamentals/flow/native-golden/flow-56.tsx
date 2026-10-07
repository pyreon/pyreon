// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { createFlow, computeLayout, getBezierPath, getSmoothStepPath, getStepPath, getStraightPath, getWaypointPath, resolveMarker, markerId, resolveEdgeMarkers, collectEdgeMarkers, getHandlePosition, getEdgePath, Position } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  const run = () => {
    flow.updateEdge('e', { id: 'y', pathOptions: { curvature: 2, offset: 1, junk: 2 }, markerStart: 'arrow', markerEnd: null, animated: true, waypoints: [{ x: 1, y: 1 }], data: { a: 1 }, class: 'k', hidden: true, zz: 1 })
    flow.updateEdge('e', { data: { a: compute() }, markerStart: compute(), waypoints: pts })
  }
  return (<Stack><Button onPress={run}>go</Button><Text>{() => String(flow.nodes().length)}</Text></Stack>)
}
