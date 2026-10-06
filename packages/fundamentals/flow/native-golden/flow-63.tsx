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
      <Text>{flow.edgeMap().has('e1') ? 'y' : 'n'}</Text>
      <Text>{String(flow.measurements().get('1'))}</Text>
      <Button onPress={() => flow.nodes.set([{ id: 'q', position: { x: 1, y: 2 }, data: { label: 'z' } }])}>b0</Button>
      <Button onPress={() => flow.edges.set([{ source: 'a', target: 'b' }])}>b1</Button>
      <Button onPress={() => flow.edges.set(es)}>b2</Button>
      <Button onPress={() => flow.nodes.update((ns) => ns)}>b3</Button>
      <Button onPress={() => flow.viewport.set({ x: 1, y: 2, zoom: 3 })}>b4</Button>
      <Button onPress={() => flow.viewport.set({ x: 1, y: 2 })}>b5</Button>
      <Button onPress={() => flow.viewport.update((v) => ({ ...v, zoom: 2 }))}>b6</Button>
      <Button onPress={() => flow.viewport.update((v) => ({ x: 1, y: 2, zoom: 3 }))}>b7</Button>
      <Button onPress={() => flow.containerSize.set({ width: 1, height: 2 })}>b8</Button>
      <Button onPress={() => flow.containerSize.update((s) => ({ ...s, width: 3 }))}>b9</Button>
      <Button onPress={() => flow.containerSize.update((s) => ({ ...other, width: 3 }))}>b10</Button>
      <Button onPress={() => flow.measurements.set(new Map<string, number>())}>b11</Button>
      <Button onPress={() => flow.measurements.set(m)}>b12</Button>
      <Button onPress={() => flow.measurements.update((mm) => mm)}>b13</Button>
      <Button onPress={() => flow.measurements.update(fn)}>b14</Button>
      <Button onPress={() => flow.zoom.set(3)}>b15</Button>
    </Stack>
  )
}
