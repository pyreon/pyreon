// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

      import { createFlow } from '@pyreon/flow'
      import { Text } from '@pyreon/primitives'
      const seedNodes = [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }]
      const seedEdges = [{ source: '1', target: '2' }]
      export function X() {
        const flow = createFlow({ nodes: seedNodes, edges: seedEdges })
        return <Text>{flow.edges().length}</Text>
      }
