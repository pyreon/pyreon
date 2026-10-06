// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [],
    preventScrolling: false, autoHistory: false, historyLimit: 20, fitViewPadding: 0.2, fitView: true,
    defaultEdgeType: 'step', snapToObjects: false, multiSelect: false, autoPanSpeed: 4, connectionMode: 'loose',
    zoomOnPinch: false, panOnScrollSpeed: 0.3, pannable: false, connectionRadius: 9, edgeInteractionWidth: 30,
    nodesDraggable: false, defaultMarkerEnd: null, connectionRules: { a: { outputs: ['b'] } }, snapGrid: 10,
    snapToGrid: true, maxZoom: 3, minZoom: 0.5,
  })
  return (<Stack><Text>{flow.nodes().length}</Text></Stack>)
}
