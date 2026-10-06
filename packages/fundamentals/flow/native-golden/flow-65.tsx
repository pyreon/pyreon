// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

import { createFlow, computeLayout } from '@pyreon/flow'
import { Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  return <Button onPress={async () => { const p = await computeLayout(flow.nodes(), flow.edges(), 'tree', opts); console.log(p) }}>L</Button>
}
