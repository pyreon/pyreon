// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

  import { createFlow } from '@pyreon/flow'
  import { Stack, Text } from '@pyreon/primitives'
  export function Probe() {
    const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
    const w = 120
    return <Stack>
      <Text>{flow.getIntersectingNodes('a').length}</Text>
      <Text>{flow.getIntersectingNodes({ x: 0, y: 0, width: w, height: 50 }, false).length}</Text>
      <Text>{String(flow.isNodeIntersecting('a', { x: 10, y: 10, width: 100, height: 100 }))}</Text>
      <Text>{String(flow.isNodeIntersecting('a', { x: 10, y: 10, width: 100, height: 100 }, false))}</Text>
      <Text>{flow.getNodesBounds().width}</Text>
      <Text>{flow.getNodesBounds(['a']).x}</Text>
    </Stack>
  }
