// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

import { createFlow } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function C() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [{ id: 'e1', source: '1', target: '1' }],

  })

  return (<Stack><Button onPress={() => { flow.updateNode('1', { hidden: true, class: 'active-node', style: 'background: red', position: { x: 8, y: 9 }, data: { label: 'Node' } }); flow.updateNodeData('1', { label: 'Updated' }); flow.updateEdge('e1', { label: 'Edge', class: 'active-edge', style: 'stroke: red', animated: false, pathOptions: { offset: 12 }, markerEnd: null }); flow.selectNodes(['1'], true); flow.moveSelectedNodes(2, 3); flow.removeEdges(['e1']); flow.removeNodes(['missing']); flow.focusNode('1', 2); flow.panTo({ x: 4, y: 5 }) }}>Act</Button><Text>{flow.getNodes().length}</Text><Text>{flow.getEdges().length}</Text><Text>{flow.getViewport().zoom}</Text><Text>{flow.screenToFlowPosition({ x: 10, y: 20 }).x}</Text><Text>{flow.flowToScreenPosition({ x: 1, y: 2 }).y}</Text><Text>{flow.isNodeVisible('1')}</Text><Text>{flow.getChildNodes('root').length}</Text><Text>{flow.getAbsolutePosition('1').x}</Text></Stack>)
}
