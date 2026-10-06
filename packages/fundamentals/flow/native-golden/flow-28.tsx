// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

import { FlowWebView as HostedFlow } from '@pyreon/flow/webview'
export function App(props: { graph: any }) {
  return <HostedFlow graph={props.graph} commands={[{ id: 'fit', type: 'fit-view' }]} nodeWidth={180} background="#101820"
    onSelect={(selection) => console.log(selection.id)}
    onEvent={(event) => console.log(event.type)}
    onError={(error) => console.log(error.message)} />
}
