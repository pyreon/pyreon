// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

import { createFlow } from '@pyreon/flow'
import { Button } from '@pyreon/primitives'
const patch = { hidden: true }
const added = { id: '2', position: { x: 20, y: 30 }, data: { label: 'Added' } }
export function C() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  return <Button onPress={() => { flow.updateNode('1', patch); flow.addNode(added) }}>Apply</Button>
}
