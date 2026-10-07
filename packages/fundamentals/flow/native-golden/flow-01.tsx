// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { createFlow, computeLayout, getBezierPath, getSmoothStepPath, getStepPath, getStraightPath, getWaypointPath, resolveMarker, markerId, resolveEdgeMarkers, collectEdgeMarkers, getHandlePosition, getEdgePath, Position } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', type: 'in', position: { x: 0, y: 0 }, data: { label: 'A' }, width: 10, height: 20, draggable: false, selectable: true, connectable: false, focusable: true, ariaLabel: 'n', hidden: false, deletable: true, class: 'c', style: 's', parentId: 'p', extent: [[0, 0], [10, 10]], expandParent: true, group: true, sourceHandles: [{ id: 'a', type: 'source', position: 'top' }], targetHandles: [{ type: 'target', position: 'left' }], zIndex: 3 }], edges: [] })
  const run = () => {
    flow.fitView()
  }
  return (<Stack><Button onPress={run}>go</Button><Text>{() => String(flow.nodes().length)}</Text></Stack>)
}
