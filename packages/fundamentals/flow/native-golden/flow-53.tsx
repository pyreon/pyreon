// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { createFlow, computeLayout, getBezierPath, getSmoothStepPath, getStepPath, getStraightPath, getWaypointPath, resolveMarker, markerId, resolveEdgeMarkers, collectEdgeMarkers, getHandlePosition, getEdgePath, Position } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  const run = () => {
    flow.fitView(['1'], 10, { zz: 1 })
    flow.paste(pos)
    flow.reconnectEdge('e', { zz: 'a' })
    flow.isValidConnection({ source: 'a' })
    flow.getIntersectingNodes('1')
    flow.setViewport({ x: 1, junk: 2 })
    flow.setCenter(1, 2, { junk: 1 })
    flow.setNodeExtent([[0, 0]])
    flow.layout('tree', opts)
  }
  return (<Stack><Button onPress={run}>go</Button><Text>{() => String(flow.nodes().length)}</Text></Stack>)
}
