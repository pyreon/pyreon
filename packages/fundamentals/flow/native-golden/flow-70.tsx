// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

import { createFlow } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
    edges: [{ id: 'e1', source: '1', target: '1' }],
  })
  return (
    <Stack>
      <Text>{flow.nodes().length}</Text>
      <Button onPress={() => flow.panTo({ x: 1, y: 2 })}>b0</Button>
      <Button onPress={() => flow.panTo(pt)}>b1</Button>
      <Button onPress={() => flow.zoomTo(2)}>b2</Button>
      <Button onPress={() => flow.zoomTo(2, { duration: 300 })}>b3</Button>
      <Button onPress={() => flow.zoomTo(2, { speed: 3 })}>b4</Button>
      <Button onPress={() => flow.zoomIn({ duration: 100 })}>b5</Button>
      <Button onPress={() => flow.zoomOut(opts)}>b6</Button>
    </Stack>
  )
}
