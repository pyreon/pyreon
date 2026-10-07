// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

      import { createFlow } from '@pyreon/flow'
      import { Button, Text } from '@pyreon/primitives'
      export function X() {
        const flow = createFlow({
          nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
          edges: [],
          snapToGrid: true, snapGrid: 10, nodeExtent: [[0, 5], [200, 300]],
        })
        return <Text>{flow.zoom()}</Text>
      }
