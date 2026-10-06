// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

import { createFlow } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function C() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [{ id: 'e1', source: '1', target: '1' }],
    
  })
  
        const stopConnect = flow.onConnect(connection => { console.log(connection.target) })
        const stopViewport = flow.onViewportChange(viewport => { console.log(viewport.zoom) })
        flow.onNodeClick(node => { console.log(node.id) })
        flow.onNodeDoubleClick(node => { console.log(node.id) })
        flow.onNodeDragStart(node => { console.log(node.id) })
        flow.onNodeDrag(node => { console.log(node.id) })
        flow.onNodeDragEnd(node => { console.log(node.id) })
        flow.onEdgeClick(edge => { console.log(edge.id) })
        flow.onSelectionChange(selection => { console.log(selection.nodes.length) })
        flow.onNodesDelete(nodes => { console.log(nodes.length) })
        flow.onEdgesDelete(edges => { console.log(edges.length) })
        flow.onNodesChange(changes => { console.log(changes.length) })
        flow.onEdgesChange(changes => { console.log(changes.length) })
        flow.onConnectStart(start => { console.log(start.nodeId) })
        flow.onConnectEnd(connection => { console.log(connection?.target) })
        flow.onPaneClick(event => { console.log(event.position.x) })
      
  return (<Stack><Button onPress={() => { stopConnect(); stopViewport() }}>Stop</Button></Stack>)
}
