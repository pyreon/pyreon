// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

import { createFlow } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function WorkflowFlow() {
  const flow = createFlow({
    nodes: [
      { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: '2', position: { x: 200, y: 100 }, data: { label: 'End' } },
    ],
    edges: [{ id: 'e1', source: '1', target: '2', animated: true }],
  })
  return (
    <Stack>
      <Text>{flow.nodes().length}</Text>
      <Text>{flow.zoom()}</Text>
      <Button onPress={() => flow.addNode({ id: '3', position: { x: 100, y: 200 }, data: { label: 'New' } })}>Add</Button>
      <Button onPress={() => flow.selectNode('1')}>Select</Button>
      <Text>{flow.nodeMap().size}</Text>
       <Text>{flow.nodeMap().has('1') ? 'node' : 'none'}</Text>
       <Text>{flow.edgeMap().has('e1') ? 'edge' : 'none'}</Text>
       <Text>{flow.measurements().size}</Text>
    </Stack>
  )
}
