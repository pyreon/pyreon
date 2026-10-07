// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

      import { createFlow, Flow, type ConnectionLineProps } from '@pyreon/flow'
      function SignalLine(props: ConnectionLineProps) {
        return <path d={props.path} style="fill: none; stroke: #2563eb; stroke-width: 3" />
      }
      export function Diagram() {
        const flow = createFlow({
          nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }],
          edges: [],
        })
        return <Flow instance={flow} connectionLine={SignalLine} />
      }
