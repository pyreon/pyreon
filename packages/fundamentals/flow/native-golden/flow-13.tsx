// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

import { createFlow } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function C() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [{ id: 'e1', source: '1', target: '1' }],

  })

  return (<Stack><Button onPress={() => { flow.addNodes([{ id: '2', position: { x: 10, y: 20 }, data: { label: 'B' } }]); flow.addEdges([{ id: 'e2', source: '1', target: '2' }]); flow.setNodes([{ id: '2', position: { x: 30, y: 40 }, data: { label: 'C' } }]); flow.setEdges([{ id: 'e3', source: '2', target: '2' }]) }}>Bulk</Button></Stack>)
}
