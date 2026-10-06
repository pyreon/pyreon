// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { FlowWebView } from '@pyreon/flow/webview'
type G = { nodes: { id: string }[] }
export function App() {
  const g = signal<G>({ nodes: [{ id: 'a' }] })
  const h = signal('<p/>')
  const w = signal(3)
  return (<Stack>
    <FlowWebView />
    <FlowWebView graph={g()} nodeWidth={w()} nodeHeight={50} nodeFill="#abc<>" labelColor="#123" background="red" />
    <FlowWebView graph={g()} nodeWidth={120} html={h()} commands={cmds()} onSelect={handler} onMessage={(m) => log(m)} />
  </Stack>)
}
