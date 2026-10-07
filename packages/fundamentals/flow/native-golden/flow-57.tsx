// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { createFlow, computeLayout, getBezierPath, getSmoothStepPath, getStepPath, getStraightPath, getWaypointPath, resolveMarker, markerId, resolveEdgeMarkers, collectEdgeMarkers, getHandlePosition, getEdgePath, Position } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  const run = () => {
    const h = getHandlePosition(Position.Top, 0, 0, 10, 10)
    const h2 = getHandlePosition(side, 0, 0, 10, 10)
    const p = getEdgePath('step', 0, 0, Position.Top, 1, 1, 'bottom', { borderRadius: 2 })
    const p2 = getEdgePath('step', 0, 0, Position.Top, 1, 1, 'bottom')
    const p3 = getEdgePath('step', 0, 0, 3, 1, 1, 'bottom')
    const p4 = getEdgePath('step', 0, 0, 'top', 1, 1, 'bottom', { junk: 1 })
  }
  return (<Stack><Button onPress={run}>go</Button><Text>{() => String(flow.nodes().length)}</Text></Stack>)
}
