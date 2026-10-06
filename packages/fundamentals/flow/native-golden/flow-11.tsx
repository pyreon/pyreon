// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

  import { signal } from '@pyreon/reactivity'
  import { onMount } from '@pyreon/core'
  import { createFlow, Flow } from '@pyreon/flow'
  import { Stack, Text } from '@pyreon/primitives'
  export function Diagram() {
    const last = signal('')
    const flow = createFlow({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }, { id: 'b', position: { x: 200, y: 0 }, data: { label: 'B' } }],
      edges: [{ id: 'ab', source: 'a', target: 'b' }],
    })
    onMount(() => {
      flow.onNodeContextMenu((n) => last.set('node ' + n.id))
      flow.onEdgeContextMenu((e) => last.set('edge ' + e.id))
      flow.onPaneContextMenu((p) => last.set(`pane ${p.x}`))
      flow.onNodeMouseEnter((n) => last.set('enter ' + n.id))
      flow.onNodeMouseLeave((n) => last.set('leave ' + n.id))
      flow.onEdgeMouseEnter((e) => last.set('enter ' + e.id))
      flow.onEdgeMouseLeave((e) => last.set('leave ' + e.id))
    })
    return <Stack><Text>{last()}</Text><Flow instance={flow} /></Stack>
  }
