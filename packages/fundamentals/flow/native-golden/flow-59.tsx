// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

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
}
