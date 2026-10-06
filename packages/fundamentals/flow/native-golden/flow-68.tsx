// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

      import { createFlow, Flow, EdgeLabelRenderer, getBezierPath, type EdgeComponentProps } from '@pyreon/flow'
      import { Text } from '@pyreon/primitives'
      function SignalEdge(props: EdgeComponentProps) {
        return <>
          <path d={() => getBezierPath({
            sourceX: props.sourceX(), sourceY: props.sourceY(),
            sourcePosition: props.sourcePosition(), targetX: props.targetX(),
            targetY: props.targetY(), targetPosition: props.targetPosition(),
          }).path} style="fill: none; stroke: #e11d48; stroke-width: 2" />
          <EdgeLabelRenderer><Text>{props.edge.data?.label}</Text></EdgeLabelRenderer>
        </>
      }
      export function Diagram() {
        const flow = createFlow({
          nodes: [
            { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } },
            { id: 'b', position: { x: 200, y: 80 }, data: { label: 'B' } },
          ],
          edges: [{ id: 'ab', source: 'a', target: 'b', type: 'signal', data: { label: 'Signal' } }],
        })
        return <Flow instance={flow} edgeTypes={{ signal: SignalEdge }} />
      }
    
