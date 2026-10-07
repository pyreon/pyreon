// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

  import { createFlow, Flow } from '@pyreon/flow'
  export function Diagram() {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' }, zIndex: 5 },
        { id: 'b', position: { x: 200, y: 0 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'ab', source: 'a', target: 'b', zIndex: 2 }],
      connectionMode: 'loose',
      elevateNodesOnSelect: false,
      elevateEdgesOnSelect: true,
    })
    return <Flow instance={flow} />
  }
