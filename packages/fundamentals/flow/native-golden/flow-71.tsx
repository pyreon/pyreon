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
      <Button onPress={() => flow.setCenter(1, 2)}>b0</Button>
      <Button onPress={() => flow.setCenter(1, 2, { zoom: 3, duration: 4 })}>b1</Button>
      <Button onPress={() => flow.setCenter(1, 2, { bad: 1 })}>b2</Button>
      <Button onPress={() => flow.setNodeExtent(null)}>b3</Button>
      <Button onPress={() => flow.setNodeExtent(undefined)}>b4</Button>
      <Button onPress={() => flow.setNodeExtent([[0, 0], [1, 1]])}>b5</Button>
      <Button onPress={() => flow.setNodeExtent([[0, 0]])}>b6</Button>
      <Button onPress={() => flow.clampToExtent({ x: 1, y: 2 }, 3, 4)}>b7</Button>
      <Button onPress={() => flow.clampToExtent(pp)}>b8</Button>
      <Button onPress={() => flow.getSnapLines('1', { x: 1, y: 2 }, 5)}>b9</Button>
      <Button onPress={() => flow.getSnapLines('1', { x: 1, y: 2 })}>b10</Button>
      <Button onPress={() => flow.getSnapLines('1', pp)}>b11</Button>
    </Stack>
  )
}
