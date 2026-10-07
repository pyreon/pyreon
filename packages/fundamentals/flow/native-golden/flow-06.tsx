// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.
import { createFlow, Flow, Handle, NodeToolbar, BaseEdge, EdgeText, ViewportPortal, Background, Controls, MiniMap, Panel, getStraightPath, type EdgeComponentProps } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
function CardNode(props: { id: string }) {
  return <Stack><Handle type="source" position="top" style="color: red" class="h" /><NodeToolbar class="tb" style="x" /><Text>card</Text></Stack>
}
function Loose() { return <NodeToolbar /> }
function Edge1(props: EdgeComponentProps) {
  return <>
    <path d={props.path()} stroke={color()} strokeWidth={width()} fill={fillc()} />
    <path />
    <EdgeText label="t" />
    <EdgeText x={1} y={2} label={name()} />
    <ViewportPortal><Text>x</Text></ViewportPortal>
    <BaseEdge path={pathOf(props)} stroke={color()} strokeWidth={width()} />
    <BaseEdge />
  </>
}
const mm = (n) => '#fff'
export function Diagram() {
  const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  return (<Stack>
    <Flow instance={flow} nodeTypes={{ card: CardNode }} edgeTypes={{ e1: Edge1 }} connectionLine={() => null} ariaLabel="diagram" colorMode="dark">
      <Background variant="lines" gap={g()} size={2} />
      <Controls position={corner()} showLock={true} />
      <MiniMap nodeColor={mm} maskColor={mm} width={w()} />
      <Panel position={pos()}><Text>p</Text></Panel>
      <Panel position="bottom-left"><Text>q</Text></Panel>
      <Text>other</Text>
    </Flow>
    <Flow instance={flow} nodeTypes={types} edgeTypes={etypes}><Background variant={v()} /><Controls position="top-left" /></Flow>
    <Flow />
    <Controls />
    <Controls instance={flow} />
  </Stack>)
}
