// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { createFlow, computeLayout, getBezierPath, getSmoothStepPath, getStepPath, getStraightPath, getWaypointPath, resolveMarker, markerId, resolveEdgeMarkers, collectEdgeMarkers, getHandlePosition, getEdgePath, Position } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  const run = () => {
    flow.updateNode('1', { id: 'x', position: { x: 1, y: 2 }, data: { label: 'q' }, sourceHandles: [{ type: 'source', position: 'top' }], extent: 'parent', class: 'c', hidden: true, bogus: 1 })
    flow.updateNode('1', { extent: [[0, 0], [5, 5]], position: p, targetHandles: hs })
    flow.updateNode('1', { extent: 'nope' })
  }
  return (<Stack><Button onPress={run}>go</Button><Text>{() => String(flow.nodes().length)}</Text></Stack>)
}
