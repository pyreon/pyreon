// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '0', position: { x: 0, y: 0 }, data: { label: 'A', w: 1 } }, { id: '1', position: { x: 0, y: 0 }, data: { label: 'B', w: 'wide' } }], edges: [] })
  return (<Stack><Text>{() => String(flow.nodes().length)}</Text></Stack>)
}
