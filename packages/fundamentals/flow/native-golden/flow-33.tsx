// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

import { createFlow } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function C() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [{ id: 'e1', source: '1', target: '1' }],

  })

  return (<Stack><Button onPress={() => { flow.selectNode('1', true); flow.selectEdge('e1', true); flow.fitView(undefined, 0.2); flow.fitView(['1'], 0.3) }}>Go</Button><Text>{flow.getNode('1')?.position.x}</Text><Text>{flow.getNode('1')?.width}</Text><Text>{flow.edges()[0].type}</Text></Stack>)
}
