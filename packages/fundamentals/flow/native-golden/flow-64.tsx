// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { createFlow } from '@pyreon/flow'
import { Stack, Button, WebView } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  const run = () => {
    const t = MarkerType.Arrow
    const t2 = MarkerType.ArrowClosed
    const c1 = flow.nodeMap().size
    const c2 = flow.edgeMap().size
    const c3 = flow.measurements().size
    const z = flow.config.minZoom
    const q = flow.config.bogusKey
    const e = Math.E
  }
  return (<Stack><Button onPress={run}>go</Button>
    <WebView html="<p/>" onMessage={() => { log(1); log(2) }} />
  </Stack>)
}
