// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

  import { createFlow, Flow, BaseEdge, EdgeText, getStraightPath, type EdgeComponentProps } from '@pyreon/flow'
  function LabelledEdge(props: EdgeComponentProps) {
    const p = getStraightPath({ sourceX: props.sourceX(), sourceY: props.sourceY(), targetX: props.targetX(), targetY: props.targetY() })
    return <BaseEdge path={p.path} label="hi" labelX={p.labelX} labelY={p.labelY} />
  }
  export function Diagram() {
    const flow = createFlow({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }, { id: 'b', position: { x: 200, y: 0 }, data: { label: 'B' } }],
      edges: [{ id: 'ab', source: 'a', target: 'b', type: 'labelled' }],
    })
    return <Flow instance={flow} edgeTypes={{ labelled: LabelledEdge }} />
  }
