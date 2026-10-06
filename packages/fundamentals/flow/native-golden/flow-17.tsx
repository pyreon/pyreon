// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { Flow, createFlow } from '@pyreon/flow'
import type { NodeComponentProps } from '@pyreon/flow'
function DomNode(props: NodeComponentProps<{ label: string }>) {
  return <div style="border-radius: 12px">{props.data().label}</div>
}
function SvgNode(props: NodeComponentProps<{ label: string }>) {
  return <svg width={40} height={40}><path d="M0 0 L40 40" stroke="red" /></svg>
}
function App() {
  const flow = createFlow<{ label: string }>({ nodes: [{ id: 'a', type: 'dom', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  return <Flow instance={flow} nodeTypes={{ dom: DomNode, svg: SvgNode }} />
}
