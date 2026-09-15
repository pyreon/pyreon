// `@pyreon/flow`'s `createFlow` lowers to the @Observable/`remember`
// PyreonFlowState port. Unlike `createTableState` (which wraps an external
// reactive data source), `createFlow` OWNS its data — nodes/edges are
// captured as LITERAL config at declaration time, so the Swift emit needs
// no `.onAppear` wiring dance (fully self-contained @State initializer,
// closer to `PyreonMachine`'s shape than the table's).
//
// Verified END-TO-END beyond these string assertions: the ACTUAL emit
// type-checks against the real SwiftUI SDK + the real @Observable port on
// macOS (see PyreonFlowState.swift + PyreonFlowStateTests.swift, a real
// executable proving the behavior, not just the types), and both targets
// validate against the compiler stubs here.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const P = '@pyreon/primitives'
const workflowFlow = `
import { createFlow } from '@pyreon/flow'
import { Stack, Text, Button } from '${P}'
export function WorkflowFlow() {
  const flow = createFlow({
    nodes: [
      { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: '2', position: { x: 200, y: 100 }, data: { label: 'End' } },
    ],
    edges: [{ id: 'e1', source: '1', target: '2', animated: true }],
  })
  return (
    <Stack>
      <Text>{flow.nodes().length}</Text>
      <Text>{flow.zoom()}</Text>
      <Button onPress={() => flow.addNode({ id: '3', position: { x: 100, y: 200 }, data: { label: 'New' } })}>Add</Button>
      <Button onPress={() => flow.selectNode('1')}>Select</Button>
      <Text>{flow.selectedNodes().length}</Text>
    </Stack>
  )
}
`

describe('createFlow — Swift lowering', { timeout: 30_000 }, () => {
  const r = transform(workflowFlow, { target: 'swift' })

  it('emits a self-seeding @State PyreonFlowState, row struct synthesized from `data`', () => {
    // The row struct name is the shared `synthLiteralStructName` registry's
    // generated name (`__ObjN`) — the SAME one every OTHER object literal in
    // the file resolves through, which is the point (see the row-type
    // resolution comment in emit-swift.ts): it must be the identical name
    // each node's `data: {...}` literal below ALSO resolves to.
    expect(r.code).toMatch(/struct (__Obj\d+): Codable \{\s*var label: String\s*\}/)
    const structName = r.code.match(/struct (__Obj\d+): Codable \{\s*var label: String\s*\}/)?.[1]
    expect(structName).toBeDefined()
    expect(r.code).toContain(`PyreonFlowState<${structName}>(nodes: [`)
    expect(r.code).toContain(
      `PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0, y: 0), data: ${structName}(label: "Start"))`,
    )
    expect(r.code).toContain(
      `PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200, y: 100), data: ${structName}(label: "End"))`,
    )
    expect(r.code).toContain('PyreonFlowEdge(id: "e1", source: "1", target: "2", animated: true, animatedSpecified: true)')
  })

  it('does NOT wire an .onAppear data source (createFlow owns its data, unlike table)', () => {
    expect(r.code).not.toContain('.onAppear { flow.setData')
  })

  it('nodes()/edges()/viewport()/zoom() drop parens (property reads)', () => {
    expect(r.code).toContain('flow.nodes.count')
    expect(r.code).toContain('"\\(flow.zoom)"')
  })

  it('addNode()/selectNode() stay methods — and addNode\'s object-literal argument resolves to a REAL PyreonFlowNode, not a synthesized lookalike struct', () => {
    // This is the load-bearing assertion for the swiftFlowNodeLiteral
    // rewrite: without it, `addNode({...})`'s literal argument synthesizes
    // its OWN unrelated `__ObjN` struct (same field names as PyreonFlowNode,
    // different NOMINAL type) — Swift's type system is nominal, so that
    // fails to typecheck even though the shapes match. `PyreonFlowNode(` is
    // the discriminator; the generic path would emit a bare `__ObjN(`.
    expect(r.code).toMatch(/flow\.addNode\(PyreonFlowNode\(id: "3", position: PyreonXYPosition\(x: 100, y: 200\), data: __Obj\d+\(label: "New"\)\)\)/)
    expect(r.code).toContain('flow.selectNode("1")')
  })

  it('selectedNodes() stays a method call (matches the web call syntax, no rewrite)', () => {
    expect(r.code).toContain('flow.selectedNodes().count')
  })

  it('nodeMap/edgeMap/measurements preserve Map lookup semantics', () => {
    const src = workflowFlow.replace(
      '<Text>{flow.selectedNodes().length}</Text>',
      `<Text>{flow.nodeMap().size}</Text>
       <Text>{flow.nodeMap().has('1') ? 'node' : 'none'}</Text>
       <Text>{flow.edgeMap().has('e1') ? 'edge' : 'none'}</Text>
       <Text>{flow.measurements().size}</Text>`,
    )
    const out = transform(src, { target: 'swift' })
    expect(out.code).toContain('flow.nodeLookup.count')
    expect(out.code).toContain('(flow.nodeLookup["1"] != nil)')
    expect(out.code).toContain('(flow.edgeLookup["e1"] != nil)')
    expect(out.code).toContain('flow.measurements.count')
    const v = validateSwiftWithStubs(out.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })

  it('the recognizer itself does not decline this shape (no createFlow-specific warning)', () => {
    // NOTE: the package-level blanket "@pyreon/flow is WEB-ONLY" warning
    // still fires here — it is derived from the manifest's `multiplatform`
    // declaration (`WEB_ONLY_PACKAGES`, regenerated by
    // check-multiplatform-tier.ts --write-table), which this PR's compiler
    // work does not yet touch. That is a separate, tracked follow-up (adding
    // a `nativeFrontend` entry to flow's manifest); this test only asserts
    // the RECOGNIZER accepted the shape, which is what it can prove today.
    expect((r.warnings ?? []).some((w) => w.includes('createFlow declaration'))).toBe(false)
  })

  it('the emit type-checks against the Swift stubs', () => {
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

describe('createFlow — Kotlin lowering', { timeout: 30_000 }, () => {
  const r = transform(workflowFlow, { target: 'kotlin' })

  it('nodeMap/edgeMap/measurements preserve Map lookup semantics', () => {
    const src = workflowFlow.replace(
      '<Text>{flow.selectedNodes().length}</Text>',
      `<Text>{flow.nodeMap().size}</Text>
       <Text>{flow.nodeMap().has('1') ? 'node' : 'none'}</Text>
       <Text>{flow.edgeMap().has('e1') ? 'edge' : 'none'}</Text>
       <Text>{flow.measurements().size}</Text>`,
    )
    const out = transform(src, { target: 'kotlin' })
    expect(out.code).toContain('flow.nodeLookup.size')
    expect(out.code).toContain('flow.nodeLookup.containsKey("1")')
    expect(out.code).toContain('flow.edgeLookup.containsKey("e1")')
    expect(out.code).toContain('flow.measurements.size')
    const v = validateKotlin(out.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })

  it('emits a remembered PyreonFlowState with literal node/edge config, Int position literals coerced to Double', () => {
    expect(r.code).toContain('remember { PyreonFlowState<')
    expect(r.code).toContain('nodes = listOf(')
    // Kotlin refuses a bare Int literal where PyreonXYPosition wants Double —
    // `0` must emit as `0.0` (see the ktChartDouble coercion in emit-kotlin.ts).
    expect(r.code).toContain('PyreonFlowNode(id = "1", position = PyreonXYPosition(0.0, 0.0), data = ')
    expect(r.code).toContain('PyreonFlowEdge(id = "e1", source = "1", target = "2", animated = true, animatedSpecified = true)')
  })

  it('use-sites: nodes/zoom are property reads (via the TS-compat `.length` extension); addNode resolves a REAL PyreonFlowNode', () => {
    // `.length` (not `.size`) is deliberate — `flow.nodes()` reads as a JS
    // array on web, so the SAME cross-target `.length` extension every other
    // Kotlin-emitted array read uses applies here too (it is `flow.nodes`
    // that drops the parens; `.length` is unrelated to this rewrite).
    expect(r.code).toContain('flow.nodes.length')
    expect(r.code).toContain('${flow.zoom}')
    expect(r.code).toMatch(/flow\.addNode\(PyreonFlowNode\(id = "3", position = PyreonXYPosition\(100\.0, 200\.0\), data = __Obj\d+\(label = "New"\)\)\)/)
    expect(r.code).toContain('flow.selectNode("1")')
  })

  it('the emit type-checks against the Kotlin stubs', () => {
    const v = validateKotlin(r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

describe('<Flow> native host lowering', { timeout: 30_000 }, () => {
  const source = `
    import { createFlow, Flow } from '@pyreon/flow'
    export function App() {
      const flow = createFlow({
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
        edges: [],
      })
      return <Flow instance={flow} />
    }
  `

  it('emits the SwiftUI host instead of an unresolved web component', () => {
    const result = transform(source, { target: 'swift' })
    expect(result.code).toContain('PyreonFlowView(state: flow) { pyreonNode in')
    expect(result.code).toContain('Text(String(describing: pyreonNode.data.label))')
    expect(result.warnings.some((warning) => warning.includes('Flow (from @pyreon/flow)'))).toBe(false)
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(result.code).ok).toBe(true)
  })

  it('carries the Flow accessible name to SwiftUI and Compose hosts', () => {
    const named = source.replace('<Flow instance={flow} />', '<Flow instance={flow} ariaLabel="Pipeline editor" />')
    const swift = transform(named, { target: 'swift' })
    const kotlin = transform(named, { target: 'kotlin' })
    expect(swift.code).toContain('PyreonFlowView(state: flow, ariaLabel: "Pipeline editor")')
    expect(kotlin.code).toContain('PyreonFlowView(state = flow, ariaLabel = "Pipeline editor")')
    expect(validateSwiftWithStubs(swift.code).ok).toBe(true)
    expect(validateKotlin(kotlin.code).ok).toBe(true)
  })

  it('extracts Background chrome into the SwiftUI and Compose host configuration', () => {
    const withBackground = source.replace(
      "import { createFlow, Flow }",
      "import { createFlow, Flow, Background }",
    ).replace('<Flow instance={flow} />', '<Flow instance={flow}><Background variant="cross" gap={24} size={2} color="#abc" /></Flow>')
    const swift = transform(withBackground, { target: 'swift' })
    const kotlin = transform(withBackground, { target: 'kotlin' })
    expect(swift.code).toContain('background: PyreonFlowBackgroundStyle(variant: .cross, gap: 24, size: 2, color: "#abc")')
    expect(kotlin.code).toContain('background = PyreonFlowBackgroundStyle(variant = PyreonFlowBackgroundVariant.Cross, gap = 24.0, size = 2.0, color = "#abc")')
    expect(swift.warnings.some((warning) => warning.includes('Background (from @pyreon/flow)'))).toBe(false)
    expect(kotlin.warnings.some((warning) => warning.includes('Background (from @pyreon/flow)'))).toBe(false)
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(swift.code).ok).toBe(true)
    if (isKotlincAvailable()) expect(validateKotlin(kotlin.code).ok).toBe(true)
  })

  it('extracts functional Controls configuration on both targets', () => {
    const withControls = source.replace(
      "import { createFlow, Flow }",
      "import { createFlow, Flow, Controls }",
    ).replace('<Flow instance={flow} />', '<Flow instance={flow}><Controls showZoomOut={false} showLock={true} position="top-right" /></Flow>')
    const swift = transform(withControls, { target: 'swift' })
    const kotlin = transform(withControls, { target: 'kotlin' })
    expect(swift.code).toContain('controls: PyreonFlowControlsStyle(showZoomIn: true, showZoomOut: false, showFitView: true, showLock: true, position: .topRight)')
    expect(kotlin.code).toContain('controls = PyreonFlowControlsStyle(showZoomIn = true, showZoomOut = false, showFitView = true, showLock = true, position = PyreonFlowControlsPosition.TopRight)')
    expect(swift.warnings.some((warning) => warning.includes('Controls (from @pyreon/flow)'))).toBe(false)
    expect(kotlin.warnings.some((warning) => warning.includes('Controls (from @pyreon/flow)'))).toBe(false)
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(swift.code).ok).toBe(true)
    if (isKotlincAvailable()) expect(validateKotlin(kotlin.code).ok).toBe(true)
  })

  it('extracts interactive MiniMap configuration on both targets', () => {
    const withMiniMap = source.replace(
      "import { createFlow, Flow }",
      "import { createFlow, Flow, MiniMap }",
    ).replace('<Flow instance={flow} />', '<Flow instance={flow}><MiniMap nodeColor="#123456" maskColor="#abcdef" width={180} height={120} pannable={false} /></Flow>')
    const swift = transform(withMiniMap, { target: 'swift' })
    const kotlin = transform(withMiniMap, { target: 'kotlin' })
    expect(swift.code).toContain('miniMap: PyreonFlowMiniMapStyle(nodeColor: "#123456", maskColor: "#abcdef", width: 180, height: 120, pannable: false, zoomable: true)')
    expect(kotlin.code).toContain('miniMap = PyreonFlowMiniMapStyle(nodeColor = "#123456", maskColor = "#abcdef", width = 180.0, height = 120.0, pannable = false, zoomable = true)')
    expect(swift.warnings.some((warning) => warning.includes('MiniMap (from @pyreon/flow)'))).toBe(false)
    expect(kotlin.warnings.some((warning) => warning.includes('MiniMap (from @pyreon/flow)'))).toBe(false)
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(swift.code).ok).toBe(true)
    if (isKotlincAvailable()) expect(validateKotlin(kotlin.code).ok).toBe(true)
  })

  it('renders positioned Panel content as a native overlay on both targets', () => {
    const withPanel = source.replace(
      "import { createFlow, Flow }",
      "import { createFlow, Flow, Panel }",
    ).replace('<Flow instance={flow} />', '<Flow instance={flow}><Panel position="bottom-right"><Text>Zoom</Text></Panel></Flow>')
    const swift = transform(withPanel, { target: 'swift' })
    const kotlin = transform(withPanel, { target: 'kotlin' })
    expect(swift.code).toContain('.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)')
    expect(kotlin.code).toContain('Modifier.align(Alignment.BottomEnd).padding(10.dp)')
    expect(swift.code).toContain('Text("Zoom")')
    expect(kotlin.code).toContain('Text(text = "Zoom")')
    expect(swift.warnings.join(' ')).not.toContain('native-unlowered children')
    expect(kotlin.warnings.join(' ')).not.toContain('native-unlowered children')
    if (isSwiftcAvailable()) {
      const validation = validateSwiftWithStubs(swift.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    }
    if (isKotlincAvailable()) {
      const validation = validateKotlin(kotlin.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    }
  })

  it('dispatches literal nodeTypes with live data, selection, and dragging accessors', () => {
    const custom = `
      import { createFlow, Flow, type NodeComponentProps } from '@pyreon/flow'
      import { Stack, Text } from '@pyreon/primitives'
      interface NodeData { label: string }
      function CustomNode(props: NodeComponentProps<NodeData>) {
        return <Stack><Text>{props.data().label}</Text><Text>{props.selected() ? 'selected' : 'idle'}</Text><Text>{props.dragging() ? 'dragging' : 'still'}</Text></Stack>
      }
      export function App() {
        const flow = createFlow<NodeData>({
          nodes: [{ id: 'a', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
          edges: [],
        })
        return <Flow instance={flow} nodeTypes={{ custom: CustomNode }} />
      }
    `
    const swift = transform(custom, { target: 'swift' })
    const kotlin = transform(custom, { target: 'kotlin' })
    expect(swift.code).toContain('{ pyreonNode, pyreonSelected, pyreonDragging in')
    expect(swift.code).toContain('case "custom":')
    expect(swift.code).toContain('CustomNode(id: pyreonNode.id, data: { pyreonNode.data }, selected: { pyreonSelected }, dragging: { pyreonDragging })')
    expect(kotlin.code).toContain('{ pyreonNode, pyreonSelected, pyreonDragging ->')
    expect(kotlin.code).toContain('"custom" -> CustomNode(id = pyreonNode.id, data = { pyreonNode.data }, selected = { pyreonSelected }, dragging = { pyreonDragging })')
    expect(swift.warnings.join(' ')).not.toContain('custom renderer maps are not lowered')
    expect(kotlin.warnings.join(' ')).not.toContain('custom renderer maps are not lowered')
    if (isSwiftcAvailable()) {
      const validation = validateSwiftWithStubs(swift.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    }
    if (isKotlincAvailable()) {
      const validation = validateKotlin(kotlin.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    }
  })

  it('extracts custom-node Handle declarations into interactive native handle geometry', () => {
    const handled = `
      import { createFlow, Flow, Handle, Position, type NodeComponentProps } from '@pyreon/flow'
      import { Stack, Text } from '@pyreon/primitives'
      interface NodeData { label: string }
      function CustomNode(props: NodeComponentProps<NodeData>) {
        return <Stack><Handle type="target" position={Position.Left} /><Text>{props.data().label}</Text><Handle id="out" type="source" position={Position.Right} offset={75} /></Stack>
      }
      export function App() {
        const flow = createFlow<NodeData>({ nodes: [{ id: 'a', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'Start' } }], edges: [] })
        return <Flow instance={flow} nodeTypes={{ custom: CustomNode }} />
      }
    `
    const swift = transform(handled, { target: 'swift' })
    const kotlin = transform(handled, { target: 'kotlin' })
    expect(swift.code).toContain('nodeHandles: { pyreonNode in')
    expect(swift.code).toContain('case "custom": return [PyreonFlowHandleConfig(type: "target", position: .left), PyreonFlowHandleConfig(id: "out", type: "source", position: .right, offset: 75)]')
    expect(kotlin.code).toContain('nodeHandles = { pyreonNode ->')
    expect(kotlin.code).toContain('"custom" -> listOf(PyreonFlowHandleConfig(type = "target", position = PyreonFlowPosition.Left), PyreonFlowHandleConfig(id = "out", type = "source", position = PyreonFlowPosition.Right, offset = 75.0))')
    expect(swift.warnings.join(' ')).not.toContain('Handle (from @pyreon/flow)')
    expect(kotlin.warnings.join(' ')).not.toContain('Handle (from @pyreon/flow)')
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(swift.code).ok).toBe(true)
    if (isKotlincAvailable()) expect(validateKotlin(kotlin.code).ok).toBe(true)
  })

  it('names dynamic Handle extraction only when the component is registered as a node type', () => {
    const source = `
      import { createFlow, Flow, Handle, type NodeComponentProps } from '@pyreon/flow'
      import { Stack } from '@pyreon/primitives'
      function DynamicNode(props: NodeComponentProps<{ label: string }>) { return <Stack><Handle type="source" position={props.data().label} /></Stack> }
      function UnusedNode(props: NodeComponentProps<{ label: string }>) { return <Stack><Handle type="target" position={props.data().label} /></Stack> }
      export function App() {
        const flow = createFlow({ nodes: [{ id: 'a', type: 'dynamic', position: { x: 0, y: 0 }, data: { label: 'right' } }], edges: [] })
        return <Flow instance={flow} nodeTypes={{ dynamic: DynamicNode }} />
      }
    `
    for (const target of ['swift', 'kotlin'] as const) {
      const warnings = transform(source, { target }).warnings.join(' ')
      expect(warnings).toContain('component `DynamicNode`')
      expect(warnings).not.toContain('component `UnusedNode`')
    }
  })

  it('extracts NodeResizer into native corner and edge drag configuration', () => {
    const source = `
      import { createFlow, Flow, NodeResizer, type NodeComponentProps } from '@pyreon/flow'
      import { Stack, Text } from '@pyreon/primitives'
      interface NodeData { label: string }
      function ResizableNode(props: NodeComponentProps<NodeData>) {
        return <Stack><Text>{props.data().label}</Text><NodeResizer nodeId={props.id} instance={null} minWidth={80} minHeight={45} handleSize={12} showEdgeHandles /></Stack>
      }
      export function App() {
        const flow = createFlow<NodeData>({ nodes: [{ id: 'a', type: 'resizable', position: { x: 0, y: 0 }, data: { label: 'Start' } }], edges: [] })
        return <Flow instance={flow} nodeTypes={{ resizable: ResizableNode }} />
      }
    `
    const swift = transform(source, { target: 'swift' })
    const kotlin = transform(source, { target: 'kotlin' })
    expect(swift.code).toContain('nodeResizer: { pyreonNode in')
    expect(swift.code).toContain('case "resizable": return PyreonFlowNodeResizerConfig(minWidth: 80, minHeight: 45, handleSize: 12, showEdgeHandles: true)')
    expect(kotlin.code).toContain('nodeResizer = { pyreonNode ->')
    expect(kotlin.code).toContain('"resizable" -> PyreonFlowNodeResizerConfig(minWidth = 80.0, minHeight = 45.0, handleSize = 12.0, showEdgeHandles = true)')
    expect(swift.warnings.join(' ')).not.toContain('NodeResizer (from @pyreon/flow)')
    expect(kotlin.warnings.join(' ')).not.toContain('NodeResizer (from @pyreon/flow)')
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(swift.code).ok).toBe(true)
    if (isKotlincAvailable()) expect(validateKotlin(kotlin.code).ok).toBe(true)
  })

  it('extracts NodeToolbar configuration and live custom-node content on both targets', { timeout: 30_000 }, () => {
    const source = `
      import { createFlow, Flow, NodeToolbar, type NodeComponentProps } from '@pyreon/flow'
      import { Button, Stack, Text } from '@pyreon/primitives'
      interface NodeData { label: string }
      function ToolbarNode(props: NodeComponentProps<NodeData>) {
        return <Stack>
          <Text>{props.data().label}</Text>
          <NodeToolbar position="bottom" align="end" offset={12} showOnSelect={false} selected={false} nodeId="anchor">
            <Button onClick={() => console.log(props.id)}>Edit {props.data().label}</Button>
          </NodeToolbar>
        </Stack>
      }
      export function App() {
        const flow = createFlow<NodeData>({ nodes: [{ id: 'a', type: 'toolbar', position: { x: 0, y: 0 }, data: { label: 'Start' } }], edges: [] })
        return <Flow instance={flow} nodeTypes={{ toolbar: ToolbarNode }} />
      }
    `
    const swift = transform(source, { target: 'swift' })
    const kotlin = transform(source, { target: 'kotlin' })
    expect(swift.code).toContain('nodeToolbarConfigs: { pyreonNode in')
    expect(swift.code).toContain('case "toolbar": return [PyreonFlowNodeToolbarConfig(position: "bottom", align: "end", offset: 12, showOnSelect: false, selectedOverride: false, nodeIdOverride: "anchor")]')
    expect(swift.code).toContain('nodeToolbar: { pyreonNode, pyreonToolbarIndex, pyreonSelected, pyreonDragging in')
    expect(swift.code).toContain('AnyView(ToolbarNodePyreonNodeToolbar(id: pyreonNode.id, data: { pyreonNode.data }, selected: { pyreonSelected }, dragging: { pyreonDragging }))')
    expect(swift.code).toContain('struct ToolbarNodePyreonNodeToolbar: View')
    expect(kotlin.code).toContain('nodeToolbarConfigs = { pyreonNode ->')
    expect(kotlin.code).toContain('"toolbar" -> listOf(PyreonFlowNodeToolbarConfig(position = "bottom", align = "end", offset = 12.0, showOnSelect = false, selectedOverride = false, nodeIdOverride = "anchor"))')
    expect(kotlin.code).toContain('nodeToolbar = { pyreonNode, pyreonToolbarIndex, pyreonSelected, pyreonDragging ->')
    expect(kotlin.code).toContain('ToolbarNodePyreonNodeToolbar(id = pyreonNode.id, data = { pyreonNode.data }, selected = { pyreonSelected }, dragging = { pyreonDragging })')
    expect(kotlin.code).toContain('fun ToolbarNodePyreonNodeToolbar(')
    expect(swift.warnings.join(' ')).not.toContain('NodeToolbar (from @pyreon/flow)')
    expect(kotlin.warnings.join(' ')).not.toContain('NodeToolbar (from @pyreon/flow)')
    if (isSwiftcAvailable()) {
      const validation = validateSwiftWithStubs(swift.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    }
    if (isKotlincAvailable()) {
      const validation = validateKotlin(kotlin.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    }
  })

  it('lowers repeated NodeToolbar declarations and names only dynamic configuration', () => {
    const source = `
      import { createFlow, Flow, NodeToolbar, type NodeComponentProps } from '@pyreon/flow'
      import { Stack, Text } from '@pyreon/primitives'
      function ToolbarNode(props: NodeComponentProps<{ label: string }>) {
        return <Stack><NodeToolbar offset={props.data().label}><Text>A</Text></NodeToolbar><NodeToolbar selected={props.selected} nodeId={props.id}><Text>B</Text></NodeToolbar></Stack>
      }
      export function App() {
        const flow = createFlow({ nodes: [{ id: 'a', type: 'toolbar', position: { x: 0, y: 0 }, data: { label: 'Start' } }], edges: [] })
        return <Flow instance={flow} nodeTypes={{ toolbar: ToolbarNode }} />
      }
    `
    for (const target of ['swift', 'kotlin'] as const) {
      const result = transform(source, { target })
      expect(result.warnings.join(' ')).toContain('component `ToolbarNode`: <NodeToolbar> requires literal')
      expect(result.code).toContain('ToolbarNodePyreonNodeToolbar')
      expect(result.code).toContain('ToolbarNodePyreonNodeToolbar1')
      expect(result.code).toContain(target === 'swift' ? 'case 1: return AnyView' : '1 -> ToolbarNodePyreonNodeToolbar1')
    }
  })

  it('emits the Compose host instead of an unresolved web component', () => {
    const result = transform(source, { target: 'kotlin' })
    expect(result.code).toContain('PyreonFlowView(state = flow) { pyreonNode ->')
    expect(result.code).toContain('Text(text = pyreonNode.data.label.toString())')
    expect(result.warnings.some((warning) => warning.includes('Flow (from @pyreon/flow)'))).toBe(false)
    if (isKotlincAvailable()) expect(validateKotlin(result.code).ok).toBe(true)
  })

  it('falls back to the node id when node data has no label', () => {
    const withoutLabel = source.replace("data: { label: 'Start' }", 'data: { count: 1 }')
    const swift = transform(withoutLabel, { target: 'swift' })
    const kotlin = transform(withoutLabel, { target: 'kotlin' })
    expect(swift.code).toContain('Text(pyreonNode.id)')
    expect(kotlin.code).toContain('Text(text = pyreonNode.id)')
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(swift.code).ok).toBe(true)
    if (isKotlincAvailable()) expect(validateKotlin(kotlin.code).ok).toBe(true)
  })
})

describe('useFlow native lifecycle lowering', { timeout: 30_000 }, () => {
  const source = `
    import { useFlow, Flow } from '@pyreon/flow'
    export function App() {
      const flow = useFlow({
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
        edges: [],
      })
      return <Flow instance={flow} />
    }
  `

  it('emits a lifecycle-owned Swift state and disposes it on disappear', () => {
    const result = transform(source, { target: 'swift' })
    expect(result.code).toContain('@State private var flow = PyreonFlowState')
    expect(result.code).toContain('.onDisappear { flow.dispose() }')
    expect(result.warnings.join(' ')).not.toContain('useFlow')
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(result.code).ok).toBe(true)
  })

  it('remembers Compose state and disposes it when leaving composition', () => {
    const result = transform(source, { target: 'kotlin' })
    expect(result.code).toContain('val flow = remember { PyreonFlowState')
    expect(result.code).toContain('DisposableEffect(flow) { onDispose { flow.dispose() } }')
    expect(result.warnings.join(' ')).not.toContain('useFlow')
    if (isKotlincAvailable()) {
      const validation = validateKotlin(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    }
  })
})

describe('computeLayout native lowering', { timeout: 30_000 }, () => {
  const source = `
    import { createFlow, computeLayout } from '@pyreon/flow'
    import { Button } from '@pyreon/primitives'
    export function App() {
      const flow = createFlow({
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
        edges: [],
      })
      return <Button onPress={async () => {
        const positions = await computeLayout(flow.nodes(), flow.edges(), 'tree', {
          direction: 'RIGHT', nodeSpacing: 50, layerSpacing: 80, animate: false,
        })
        void positions
      }}>Layout</Button>
    }
  `

  it('routes the public helper to the async Swift native engine', () => {
    const result = transform(source, { target: 'swift' })
    expect(result.code).toContain('await pyreonComputeFlowLayout(flow.nodes, edges: flow.edges, algorithm: "tree", options: PyreonFlowLayoutOptions(direction: "RIGHT", nodeSpacing: 50, layerSpacing: 80, animate: false))')
    expect(result.warnings.join(' ')).not.toContain('computeLayout (from @pyreon/flow)')
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(result.code).ok).toBe(true)
  })

  it('routes the public helper to the suspendable Kotlin native engine', () => {
    const result = transform(source, { target: 'kotlin' })
    expect(result.code).toContain('pyreonComputeFlowLayout(flow.nodes, flow.edges, algorithm = "tree", options = PyreonFlowLayoutOptions(direction = "RIGHT", nodeSpacing = 50.0, layerSpacing = 80.0, animate = false))')
    expect(result.warnings.join(' ')).not.toContain('computeLayout (from @pyreon/flow)')
    if (isKotlincAvailable()) {
      const validation = validateKotlin(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    }
  })
})

describe('Flow edge-path helper native lowering', { timeout: 30_000 }, () => {
  const source = `
    import { getBezierPath, getSmoothStepPath, getStepPath, getStraightPath, getWaypointPath, getEdgePath, getHandlePosition, getNodeIntersection, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT, Position } from '@pyreon/flow'
    import { Text } from '@pyreon/primitives'
    export function App() {
      const straight = getStraightPath({ sourceX: 0, sourceY: 1, targetX: 20, targetY: 21 })
      const bezier = getBezierPath({ sourceX: 0, sourceY: 1, sourcePosition: Position.Right, targetX: 20, targetY: 21, targetPosition: Position.Left, curvature: 0.4 })
      const smooth = getSmoothStepPath({ sourceX: 0, sourceY: 1, targetX: 20, targetY: 21, borderRadius: 7, offset: 12 })
      const step = getStepPath({ sourceX: 0, sourceY: 1, targetX: 20, targetY: 21, offset: 8 })
      const waypoint = getWaypointPath({ sourceX: 0, sourceY: 1, targetX: 20, targetY: 21, waypoints: [{ x: 5, y: 6 }] })
      const dispatched = getEdgePath('step', 0, 1, Position.Right, 20, 21, Position.Left, { offset: 9 })
      const anchor = getHandlePosition(Position.Bottom, 0, 1, 20, 21)
      const intersection = getNodeIntersection({ x: 0, y: 0, width: 100, height: 40 }, { x: 200, y: 20 })
      const defaults = DEFAULT_NODE_WIDTH + DEFAULT_NODE_HEIGHT
      void straight; void bezier; void smooth; void step; void waypoint; void anchor; void intersection; void defaults
      return <Text>{dispatched.path}</Text>
    }
  `

  for (const target of ['swift', 'kotlin'] as const) {
    it(`routes all public builders to the ${target} geometry runtime`, () => {
      const result = transform(source, { target })
      expect(result.code).toContain('pyreonStraightPath')
      expect(result.code).toContain('pyreonBezierPath')
      expect(result.code).toContain('pyreonSmoothStepPath')
      expect(result.code).toContain('pyreonStepPath')
      expect(result.code).toContain('pyreonWaypointPath')
      expect(result.code).toContain('pyreonEdgePath')
      expect(result.code).toContain('pyreonHandlePosition')
      expect(result.code).toContain('pyreonNodeIntersection')
      expect(result.code).not.toContain('DEFAULT_NODE_WIDTH')
      expect(result.code).not.toContain('DEFAULT_NODE_HEIGHT')
      expect(result.warnings.join(' ')).not.toContain('from @pyreon/flow')
      if (target === 'swift' && isSwiftcAvailable()) {
        const validation = validateSwiftWithStubs(result.code)
        expect(validation.ok, validation.error ?? '').toBe(true)
      }
      if (target === 'kotlin' && isKotlincAvailable()) {
        const validation = validateKotlin(result.code)
        expect(validation.ok, validation.error ?? '').toBe(true)
      }
    })
  }
})

describe('createFlow connection validation lowering', { timeout: 30_000 }, () => {
  const source = `
    import { createFlow } from '@pyreon/flow'
    import { Text } from '@pyreon/primitives'
    export function App() {
      const flow = createFlow({
        nodes: [
          { id: 'api', type: 'api', position: { x: 0, y: 0 }, data: { label: 'API' } },
          { id: 'db', type: 'database', position: { x: 100, y: 0 }, data: { label: 'DB' } },
        ],
        edges: [],
        connectionRules: { api: { outputs: ['database'] } },
        isValidConnection: (connection) => connection.source !== connection.target,
      })
      return <Text>{flow.isValidConnection({ source: 'api', target: 'db' }) ? 'yes' : 'no'}</Text>
    }
  `

  it('emits literal rules and callback for Swift and Kotlin', () => {
    const swift = transform(source, { target: 'swift' })
    const kotlin = transform(source, { target: 'kotlin' })
    expect(swift.code).toContain('connectionRules: ["api": ["database"]]')
    expect(swift.code).toContain('isValidConnection: { connection in connection.source != connection.target }')
    expect(kotlin.code).toContain('connectionRules = mapOf("api" to listOf("database"))')
    expect(kotlin.code).toContain('connectionValidator = { connection -> connection.source != connection.target }')
    expect(swift.code).toContain('flow.isValidConnection(PyreonFlowConnection(source: "api", target: "db"))')
    expect(kotlin.code).toContain('flow.isValidConnection(PyreonFlowConnection(source = "api", target = "db"))')
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(swift.code).ok).toBe(true)
    if (isKotlincAvailable()) expect(validateKotlin(kotlin.code).ok).toBe(true)
  })
})

describe('typed empty Flow state lowering', { timeout: 30_000 }, () => {
  const source = `
    import { createFlow } from '@pyreon/flow'
    import { Text } from '@pyreon/primitives'
    interface NodeData { label: string }
    export function App() {
      const flow = createFlow<NodeData>({ nodes: [], edges: [] })
      return <Text>{flow.nodes().length}</Text>
    }
  `

  for (const target of ['swift', 'kotlin'] as const) {
    it(`preserves the explicit data type for an empty ${target} editor`, () => {
      const result = transform(source, { target })
      expect(result.code).toContain(target === 'swift' ? 'PyreonFlowState<NodeData>' : 'PyreonFlowState<NodeData>')
      expect(result.warnings.join(' ')).not.toContain('empty `nodes: []`')
      if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      if (target === 'kotlin' && isKotlincAvailable()) {
        const validation = validateKotlin(result.code)
        expect(validation.ok, validation.error ?? '').toBe(true)
      }
    })
  }
})

describe('Flow effective-dimension helper lowering', { timeout: 30_000 }, () => {
  const source = `
    import { createFlow, getEffectiveDimensions } from '@pyreon/flow'
    import { Text } from '@pyreon/primitives'
    export function App() {
      const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' }, width: 90 }], edges: [] })
      const node = flow.nodes()[0]!
      const dimensions = getEffectiveDimensions(node)
      return <Text>{dimensions.width}</Text>
    }
  `

  for (const target of ['swift', 'kotlin'] as const) {
    it(`routes native Flow nodes through ${target} precedence`, () => {
      const result = transform(source, { target })
      expect(result.code).toContain('pyreonEffectiveDimensions(node)')
      expect(result.warnings.join(' ')).not.toContain('getEffectiveDimensions (from @pyreon/flow)')
      if (target === 'swift' && isSwiftcAvailable()) {
        const validation = validateSwiftWithStubs(result.code)
        expect(validation.ok, validation.error ?? '').toBe(true)
      }
      if (target === 'kotlin' && isKotlincAvailable()) {
        const validation = validateKotlin(result.code)
        expect(validation.ok, validation.error ?? '').toBe(true)
      }
    })
  }
})

describe('Flow node anchoring helper lowering', { timeout: 30_000 }, () => {
  const source = `
    import { createFlow, getEffectiveDimensions, getFloatingEndpoints, getSmartHandlePositions, resolveHandleAnchor } from '@pyreon/flow'
    import { Text } from '@pyreon/primitives'
    export function App() {
      const flow = createFlow({
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' }, width: 100, height: 40, sourceHandles: [{ id: 'out', type: 'source', position: 'right' }] },
          { id: 'b', position: { x: 200, y: 80 }, data: { label: 'B' }, width: 120, height: 60 },
        ],
        edges: [],
      })
      const sourceNode = flow.nodes()[0]!
      const targetNode = flow.nodes()[1]!
      const dimensions = getEffectiveDimensions(sourceNode)
      const endpoints = getFloatingEndpoints(sourceNode, targetNode, { sourceW: 100, sourceH: 40, targetW: 120, targetH: 60 })
      const smart = getSmartHandlePositions(sourceNode, targetNode)
      const anchor = resolveHandleAnchor(sourceNode, 'out', 'source', dimensions)
      return <Text>{endpoints.source.x}</Text>
    }
  `

  for (const target of ['swift', 'kotlin'] as const) {
    it(`routes public anchoring helpers through the ${target} runtime`, () => {
      const result = transform(source, { target })
      expect(result.code).toContain('pyreonGetFloatingEndpoints')
      expect(result.code).toContain('pyreonGetSmartHandlePositions')
      expect(result.code).toContain('pyreonResolveHandleAnchor')
      expect(result.warnings.join(' ')).not.toContain('does NOT compile')
      if (target === 'swift' && isSwiftcAvailable()) {
        const validation = validateSwiftWithStubs(result.code)
        expect(validation.ok, validation.error ?? '').toBe(true)
      }
      if (target === 'kotlin' && isKotlincAvailable()) {
        const validation = validateKotlin(result.code)
        expect(validation.ok, validation.error ?? '').toBe(true)
      }
    })
  }
})

describe('createFlow — v1 decline shapes (loud warning, not silent drop)', { timeout: 30_000 }, () => {
  it('resolves immutable local literal node and edge seeds', () => {
    const src = `
      import { createFlow } from '@pyreon/flow'
      import { Text } from '${P}'
      export function X() {
        const seedNodes = [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }]
        const seedEdges = [{ source: '1', target: '2' }]
        const flow = createFlow({ nodes: seedNodes, edges: seedEdges })
        return <Text>{flow.nodes().length}</Text>
      }
    `
    for (const target of ['swift', 'kotlin'] as const) {
      const result = transform(src, { target })
      expect(result.warnings.join(' ')).not.toContain('createFlow declaration `flow`')
      expect(result.code).toContain(target === 'swift' ? 'PyreonFlowEdge(id: "e-1-2"' : 'PyreonFlowEdge(id = "e-1-2"')
      const validation = target === 'swift' ? validateSwiftWithStubs(result.code) : validateKotlin(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    }
  })

  it('resolves module-scoped immutable literal seeds', () => {
    const src = `
      import { createFlow } from '@pyreon/flow'
      import { Text } from '${P}'
      const seedNodes = [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }]
      const seedEdges = [{ source: '1', target: '2' }]
      export function X() {
        const flow = createFlow({ nodes: seedNodes, edges: seedEdges })
        return <Text>{flow.edges().length}</Text>
      }
    `
    for (const target of ['swift', 'kotlin'] as const) {
      const result = transform(src, { target })
      expect(result.warnings.join(' ')).not.toContain('createFlow declaration `flow`')
      expect(result.code).toContain(target === 'swift' ? 'PyreonFlowEdge(id: "e-1-2"' : 'PyreonFlowEdge(id = "e-1-2"')
      const validation = target === 'swift' ? validateSwiftWithStubs(result.code) : validateKotlin(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    }
  })

  it('a non-literal nodes source declines with a named reason', () => {
    const src = `
      import { createFlow } from '@pyreon/flow'
      import { Text } from '${P}'
      export function X() {
        const seed = getSeedNodes()
        const flow = createFlow({ nodes: seed, edges: [] })
        return <Text>{flow.nodes().length}</Text>
      }
    `
    const r = transform(src, { target: 'swift' })
    expect(r.warnings ?? []).toEqual(
      expect.arrayContaining([expect.stringContaining('createFlow declaration `flow`')]),
    )
  })

  it('nodes whose data field sets differ synthesize one optional union model', () => {
    const src = `
      import { createFlow } from '@pyreon/flow'
      import { Text } from '${P}'
      export function X() {
        const flow = createFlow({
          nodes: [
            { id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
            { id: '2', position: { x: 0, y: 0 }, data: { count: 1 } },
          ],
          edges: [],
        })
        return <Text>{flow.nodes().length}</Text>
      }
    `
    const swift = transform(src, { target: 'swift' })
    const kotlin = transform(src, { target: 'kotlin' })
    expect(swift.warnings.join(' ')).not.toContain('createFlow declaration `flow`')
    expect(kotlin.warnings.join(' ')).not.toContain('createFlow declaration `flow`')
    expect(swift.code).toContain('var label: String? = nil')
    expect(swift.code).toContain('var count: Int? = nil')
    expect(kotlin.code).toContain('var label: String? = null')
    expect(kotlin.code).toContain('var count: Int? = null')
    expect(validateSwiftWithStubs(swift.code).ok).toBe(true)
    expect(validateKotlin(kotlin.code).ok).toBe(true)
  })

  it('generates the same deterministic id as web when an edge omits id', () => {
    const src = `
      import { createFlow } from '@pyreon/flow'
      import { Text } from '${P}'
      export function X() {
        const flow = createFlow({
          nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
          edges: [{ source: '1', target: '2' }],
        })
        return <Text>{flow.nodes().length}</Text>
      }
    `
    const swift = transform(src, { target: 'swift' })
    const kotlin = transform(src, { target: 'kotlin' })
    expect(swift.code).toContain('PyreonFlowEdge(id: "e-1-2", source: "1", target: "2")')
    expect(kotlin.code).toContain('PyreonFlowEdge(id = "e-1-2", source = "1", target = "2")')
    expect(swift.warnings.join(' ')).not.toContain('createFlow declaration `flow`')
    expect(kotlin.warnings.join(' ')).not.toContain('createFlow declaration `flow`')
  })

  // `createFlow` takes 17 config keys. The reader took two. The other fifteen
  // lowered to NOTHING and said nothing, so `createFlow({ …, minZoom: 0.5 })`
  // clamped zoom to 2x on web and 4x natively from the same source line —
  // compiles, runs, silently wrong on one target.
  describe('config keys beyond nodes/edges', () => {
    const cfg = (extra: string, content = '<Text>{flow.zoom()}</Text>') => `
      import { createFlow } from '@pyreon/flow'
      import { Button, Text } from '${P}'
      export function X() {
        const flow = createFlow({
          nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
          edges: [],
          ${extra}
        })
        return ${content}
      }
    `

    it('minZoom/maxZoom THREAD THROUGH — the runtimes always took them', () => {
      const src = cfg('minZoom: 0.5, maxZoom: 2,')
      expect(transform(src, { target: 'swift' }).code).toContain('minZoom: 0.5, maxZoom: 2')
      expect(transform(src, { target: 'kotlin' }).code).toContain('minZoom = 0.5, maxZoom = 2.0')
    })

    it('autoHistory and history methods lower on both native targets', () => {
      const src = cfg('autoHistory: false,', '<Button onPress={() => { flow.pushHistory(); flow.undo(); flow.redo() }}>History</Button>')
      const swift = transform(src, { target: 'swift' })
      const kotlin = transform(src, { target: 'kotlin' })
      expect(swift.code).toContain('autoHistory: false')
      expect(kotlin.code).toContain('autoHistory = false')
      for (const result of [swift, kotlin]) {
        const warnings = (result.warnings ?? []).join(' ')
        expect(warnings).not.toContain('`autoHistory`')
        expect(warnings).not.toContain('`pushHistory`')
        expect(warnings).not.toContain('`undo`')
        expect(warnings).not.toContain('`redo`')
      }
    })

    it('snapToObjects threads through instead of silently diverging', () => {
      const src = cfg('snapToObjects: false,')
      const swift = transform(src, { target: 'swift' })
      const kotlin = transform(src, { target: 'kotlin' })
      expect(swift.code).toContain('snapToObjects: false')
      expect(kotlin.code).toContain('snapToObjects = false')
      expect((swift.warnings ?? []).join(' ')).not.toContain('`snapToObjects`')
      expect((kotlin.warnings ?? []).join(' ')).not.toContain('`snapToObjects`')
    })

    it('Kotlin renders them as DOUBLE literals — Int does not widen at a call site', () => {
      // `maxZoom: 2` emitting `maxZoom = 2` is "argument type mismatch: actual
      // type is 'Int', but 'Double' was expected". Swift takes the same source
      // fine, which is how a bug like this stays hidden until a real compile.
      const code = transform(cfg('maxZoom: 2,'), { target: 'kotlin' }).code
      expect(code).toContain('maxZoom = 2.0')
      expect(code).not.toContain('maxZoom = 2)')
    })

    it('scroll and keyboard configuration crosses to both native targets', () => {
      const src = cfg(`
        panOnScroll: true,
        panOnScrollSpeed: 0.75,
        zoomOnScroll: false,
        deleteKeys: ['Delete'],
        multiSelectionKey: 'ctrl',
        selectionKey: null,
        zoomActivationKey: 'meta',
        preventScrolling: false,
      `)
      const swift = transform(src, { target: 'swift' })
      const kotlin = transform(src, { target: 'kotlin' })
      expect(swift.code).toContain('panOnScroll: true, panOnScrollSpeed: 0.75, zoomOnScroll: false')
      expect(swift.code).toContain('deleteKeys: ["Delete"], multiSelectionKey: "ctrl", selectionKey: nil, zoomActivationKey: "meta", preventScrolling: false')
      expect(kotlin.code).toContain('panOnScroll = true, zoomOnScroll = false')
      expect(kotlin.code).toContain('panOnScrollSpeed = 0.75, deleteKeys = listOf("Delete"), multiSelectionKey = "ctrl", selectionKey = null, zoomActivationKey = "meta"')
      for (const target of ['swift', 'kotlin'] as const) {
        const w = (transform(src, { target }).warnings ?? []).join(' ')
        expect(w).not.toContain('NOT lowered natively')
      }
      expect(validateSwiftWithStubs(swift.code).ok).toBe(true)
      expect(validateKotlin(kotlin.code).ok).toBe(true)
    })

    it('rejects dynamic or invalid keyboard configuration instead of silently defaulting', () => {
      const src = cfg(`deleteKeys: keys, multiSelectionKey: 'capslock',`, '',)
      for (const target of ['swift', 'kotlin'] as const) {
        const warnings = (transform(src, { target }).warnings ?? []).join(' ')
        expect(warnings).toContain('deleteKeys (expected a string[] literal or null)')
        expect(warnings).toContain('multiSelectionKey (expected shift, ctrl, meta, alt, or null)')
      }
    })

    it('grid snapping and node extent config cross on both targets', () => {
      const src = cfg('snapToGrid: true, snapGrid: 10, nodeExtent: [[0, 5], [200, 300]],')
      const swift = transform(src, { target: 'swift' })
      expect(swift.code).toContain('snapToGrid: true, snapGrid: 10, nodeExtent: PyreonFlowNodeExtent(minX: 0, minY: 5, maxX: 200, maxY: 300)')
      expect((swift.warnings ?? []).join(' ')).not.toContain('NOT lowered natively')
      expect(validateSwiftWithStubs(swift.code).ok).toBe(true)
      const kotlin = transform(src, { target: 'kotlin' })
      expect(kotlin.code).toContain('snapToGrid = true, snapGrid = 10.0, nodeExtent = PyreonFlowNodeExtent(0.0, 5.0, 200.0, 300.0)')
      expect((kotlin.warnings ?? []).join(' ')).not.toContain('NOT lowered natively')
      expect(validateKotlin(kotlin.code).ok).toBe(true)
    })

    it('a NON-LITERAL minZoom is reported, not silently defaulted', () => {
      const src = `
        import { createFlow } from '@pyreon/flow'
        import { Text } from '${P}'
        export function X() {
          const lo = 0.5
          const flow = createFlow({
            nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
            edges: [],
            minZoom: lo,
          })
          return <Text>{flow.zoom()}</Text>
        }
      `
      expect((transform(src, { target: 'swift' }).warnings ?? []).join(' ')).toContain(
        'minZoom (not a numeric literal)',
      )
    })

    it('a config with ONLY nodes/edges stays silent and byte-identical', () => {
      // The control. A warning that fires unconditionally is worth nothing.
      const src = cfg('')
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(src, { target })
        expect((r.warnings ?? []).join(' ')).not.toContain('NOT lowered natively')
        expect(r.code).not.toContain('minZoom')
        expect(r.code).not.toContain('maxZoom')
      }
    })

    it.skipIf(!isSwiftcAvailable())('the threaded Swift emit typechecks', () => {
      const res = validateSwiftWithStubs(
        transform(cfg('minZoom: 0.5, maxZoom: 2,'), { target: 'swift' }).code,
      )
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it.skipIf(!isKotlincAvailable())('the threaded Kotlin emit typechecks', () => {
      const res = validateKotlin(
        transform(cfg('minZoom: 0.5, maxZoom: 2,'), { target: 'kotlin' }).code,
      )
      expect(res.ok, res.error ?? '').toBe(true)
    })
  })
})


// ── Nothing silent inside the boundary (the flow audit's compiler half) ──
// The import-level boundary (`<Flow>`, layout, chrome) already warned by name.
// The layer INSIDE it did not: unported FlowInstance members emitted verbatim
// with 0 warnings (dying at xcodebuild), `fitView()` compiled and did nothing,
// node/edge fields beyond the six the native types carry vanished at
// declaration AND call site, the Swift emit passed `additive`/`padding`
// positionally (an iOS-only build break), and the Swift stub was narrower
// than the runtime (rejecting valid reads). Every one of those is now either
// a named warning or a correct emit, on both targets.
describe('createFlow — nothing silent inside the boundary', { timeout: 30_000 }, () => {
  const base = (body: string, jsx = '<Text>{flow.nodes().length}</Text>', config = '') => `
import { createFlow } from '@pyreon/flow'
import { Stack, Text, Button } from '${P}'
export function C() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [{ id: 'e1', source: '1', target: '1' }],
    ${config}
  })
  ${body}
  return (<Stack>${jsx}</Stack>)
}
`
  const warningsOf = (src: string, target: 'swift' | 'kotlin') => (transform(src, { target }).warnings ?? []).join('\n')

  for (const target of ['swift', 'kotlin'] as const) {
    it(`[${target}] layout options lower and typecheck`, () => {
      const result = transform(base('', `<Button onPress={() => flow.layout('tree', { direction: 'LEFT', nodeSpacing: 24, layerSpacing: 48, animate: false, animationDuration: 450 })}>Layout</Button>`), { target })
      expect((result.warnings ?? []).join(' ')).not.toContain('`layout` is NOT ported')
      expect(result.code).toContain(target === 'swift'
        ? 'flow.layout("tree", options: PyreonFlowLayoutOptions(direction: "LEFT", nodeSpacing: 24, layerSpacing: 48, animate: false, animationDuration: 450))'
        : 'flow.layout("tree", PyreonFlowLayoutOptions(direction = "LEFT", nodeSpacing = 24.0, layerSpacing = 48.0, animate = false, animationDuration = 450.0))')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] native accessibility and motion policies cross createFlow`, () => {
      const result = transform(base('', undefined, "disableKeyboardA11y: true, reducedMotion: true, connectionLineType: 'step', panOnDrag: false, zoomOnPinch: false, zoomOnDoubleClick: true,"), { target })
      expect((result.warnings ?? []).join(' ')).not.toContain('NOT lowered natively')
      expect(result.code).toContain(target === 'swift' ? 'disableKeyboardA11y: true' : 'disableKeyboardA11y = true')
      expect(result.code).toContain(target === 'swift' ? 'reducedMotion: true' : 'reducedMotion = true')
      expect(result.code).toContain(target === 'swift' ? 'connectionLineType: "step"' : 'connectionLineType = "step"')
      expect(result.code).toContain(target === 'swift' ? 'zoomOnPinch: false, zoomOnDoubleClick: true' : 'zoomOnPinch = false, zoomOnDoubleClick = true')
      expect(result.code).toContain(target === 'swift' ? 'panOnDrag: false' : 'panOnDrag = false')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] panOnDrag button arrays preserve primary-touch semantics`, () => {
      const disabled = transform(base('', undefined, 'panOnDrag: [1, 2],'), { target })
      const enabled = transform(base('', undefined, "panOnDrag: [0], reducedMotion: 'auto',"), { target })
      expect(disabled.warnings.join(' ')).not.toContain('panOnDrag')
      expect(enabled.warnings.join(' ')).not.toContain('reducedMotion')
      expect(disabled.code).toContain(target === 'swift' ? 'panOnDrag: false' : 'panOnDrag = false')
      expect(enabled.code).toContain(target === 'swift' ? 'panOnDrag: true' : 'panOnDrag = true')
    })
    it(`[${target}] selection drag policy lowers and typechecks`, () => {
      const result = transform(base('', undefined, "selectionOnDrag: true, selectionMode: 'full',"), { target })
      expect((result.warnings ?? []).join(' ')).not.toContain('NOT lowered natively')
      expect(result.code).toContain(target === 'swift' ? 'selectionOnDrag: true, selectionMode: "full"' : 'selectionOnDrag = true')
      expect(result.code).toContain(target === 'swift' ? 'selectionMode: "full"' : 'selectionMode = "full"')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] viewport method duration options lower and typecheck`, () => {
      const jsx = '<Button onPress={() => { flow.zoomTo(2, { duration: 450 }); flow.zoomIn({ duration: 200 }); flow.setViewport({ x: 10, y: 20 }, { duration: 300 }); flow.setCenter(5, 6, { zoom: 1.5, duration: 250 }); flow.fitView(["1"], 0.2, { duration: 500 }) }}>Move</Button>'
      const result = transform(base('', jsx), { target })
      expect(result.code).toContain(target === 'swift' ? 'flow.zoomTo(2, duration: 450)' : 'flow.zoomTo(2.0, duration = 450.0)')
      expect(result.code).toContain(target === 'swift' ? 'flow.zoomIn(duration: 200)' : 'flow.zoomIn(duration = 200.0)')
      expect(result.code).toContain(target === 'swift' ? 'flow.setViewport(x: 10, y: 20, duration: 300)' : 'flow.setViewport(x = 10.0, y = 20.0, duration = 300.0)')
      expect(result.code).toContain(target === 'swift' ? 'flow.setCenter(5, 6, zoom: 1.5, duration: 250)' : 'flow.setCenter(5.0, 6.0, zoom = 1.5, duration = 250.0)')
      expect(result.code).toContain(target === 'swift' ? 'flow.fitView(["1"], padding: 0.2, duration: 500)' : 'flow.fitView(listOf("1"), padding = 0.2, duration = 500.0)')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] callback node-data updates receive the full native node`, () => {
      const result = transform(base('', '<Button onPress={() => flow.updateNodeData("1", node => ({ label: node.id }))}>Update</Button>'), { target })
      expect(result.warnings.join(' ')).not.toContain('`updateNodeData` currently lowers only')
      expect(result.code).toContain(target === 'swift'
        ? 'flow.updateNodeDataFromNode("1") { node in var data = node.data; data.label = node.id; return data }'
        : 'flow.updateNodeDataFromNode("1") { node -> node.data.copy(label = node.id) }')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] a signal WRITE on a flow property warns (the native collections are read-only)`, () => {
      const w = warningsOf(base('', '<Button onPress={() => flow.nodes.set([])}>Clear</Button>'), target)
      expect(w).toContain('`nodes.set(...)` writes the `nodes` signal directly')
    })
    it(`[${target}] fitView() lowers without a stale inert-host warning`, () => {
      const w = warningsOf(base('', '<Button onPress={() => flow.fitView()}>Fit</Button>'), target)
      expect(w).not.toContain('does NOTHING')
      expect(w).not.toContain('NOT ported')
    })
    it(`[${target}] copy/paste lower with a nominal native position`, () => {
      const result = transform(base('', '<Button onPress={() => { flow.copySelected(); flow.paste({ x: 12, y: 34 }) }}>Paste</Button>'), { target })
      const code = result.code
      expect((result.warnings ?? []).join(' ')).not.toContain('NOT ported')
      expect(code).toContain(target === 'swift' ? 'flow.paste(PyreonXYPosition(x: 12, y: 34))' : 'flow.paste(PyreonXYPosition(12.0, 34.0))')
    })
    it(`[${target}] serialization methods lower and typecheck`, () => {
      const result = transform(base('', '<Button onPress={() => { const snapshot = flow.toJSON(); flow.fromJSON(snapshot) }}>Round trip</Button>'), { target })
      const warnings = (result.warnings ?? []).join(' ')
      expect(warnings).not.toContain('`toJSON` is NOT ported')
      expect(warnings).not.toContain('`fromJSON` is NOT ported')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] spatial graph helpers lower and typecheck`, () => {
      const result = transform(base('', `<Button onPress={() => flow.resolveCollisions('1', 10)}>Resolve</Button><Text>{flow.getOverlappingNodes('1').length}</Text><Text>{flow.getProximityConnection('1', 50)?.target}</Text>`), { target })
      const warnings = (result.warnings ?? []).join(' ')
      for (const member of ['resolveCollisions', 'getOverlappingNodes', 'getProximityConnection']) expect(warnings).not.toContain(`\`${member}\` is NOT ported`)
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] findNodes predicates lower and typecheck`, () => {
      const result = transform(base('', `<Text>{flow.findNodes(node => node.data.label === 'Node').length}</Text><Text>{flow.searchNodes('node').length}</Text>`), { target })
      expect((result.warnings ?? []).join(' ')).not.toContain('`findNodes` is NOT ported')
      expect((result.warnings ?? []).join(' ')).not.toContain('`searchNodes` is NOT ported')
      expect(result.code).toContain(target === 'swift' ? 'searchText: { $0.label }' : 'searchText = { it.label }')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] batch closures lower and typecheck`, () => {
      const result = transform(base('', `<Button onPress={() => flow.batch(() => { flow.selectNode('1'); flow.zoomIn() })}>Batch</Button>`), { target })
      expect((result.warnings ?? []).join(' ')).not.toContain('`batch` is NOT ported')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] viewport animation lowers partial targets, duration, and typechecks`, () => {
      const result = transform(base('', `<Button onPress={() => flow.animateViewport({ x: 12, zoom: 2 }, 450)}>Animate</Button>`), { target })
      expect((result.warnings ?? []).join(' ')).not.toContain('`animateViewport` is NOT ported')
      expect(result.code).toContain(target === 'swift' ? 'flow.animateViewport(x: 12, zoom: 2, duration: 450)' : 'flow.animateViewport(x = 12.0, zoom = 2.0, duration = 450.0)')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] snap-line packets lower with nominal positions and typecheck`, () => {
      const result = transform(base('', `<Text>{flow.getSnapLines('1', { x: 12, y: 34 }, 6).snappedPosition.x}</Text>`), { target })
      const warnings = (result.warnings ?? []).join(' ')
      expect(warnings).not.toContain('`getSnapLines` is NOT ported')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] connection, viewport and node listeners are recognized native members`, () => {
      const result = transform(base(`
        const stopConnect = flow.onConnect(connection => { console.log(connection.target) })
        const stopViewport = flow.onViewportChange(viewport => { console.log(viewport.zoom) })
        flow.onNodeClick(node => { console.log(node.id) })
        flow.onNodeDoubleClick(node => { console.log(node.id) })
        flow.onNodeDragStart(node => { console.log(node.id) })
        flow.onNodeDrag(node => { console.log(node.id) })
        flow.onNodeDragEnd(node => { console.log(node.id) })
        flow.onEdgeClick(edge => { console.log(edge.id) })
        flow.onSelectionChange(selection => { console.log(selection.nodes.length) })
        flow.onNodesDelete(nodes => { console.log(nodes.length) })
        flow.onEdgesDelete(edges => { console.log(edges.length) })
        flow.onNodesChange(changes => { console.log(changes.length) })
        flow.onEdgesChange(changes => { console.log(changes.length) })
        flow.onConnectStart(start => { console.log(start.nodeId) })
        flow.onConnectEnd(connection => { console.log(connection?.target) })
        flow.onPaneClick(event => { console.log(event.position.x) })
      `, '<Button onPress={() => { stopConnect(); stopViewport() }}>Stop</Button>'), { target })
      const warnings = (result.warnings ?? []).join(' ')
      for (const member of ['onConnect', 'onViewportChange', 'onNodeClick', 'onNodeDoubleClick', 'onNodeDragStart', 'onNodeDrag', 'onNodeDragEnd', 'onEdgeClick', 'onSelectionChange', 'onNodesDelete', 'onEdgesDelete', 'onNodesChange', 'onEdgesChange', 'onConnectStart', 'onConnectEnd', 'onPaneClick']) expect(warnings).not.toContain(`\`${member}\` is NOT ported`)
    })
    it(`[${target}] dispose lowers as a native cleanup member`, () => {
      const result = transform(base('', '<Button onPress={() => flow.dispose()}>Dispose</Button>'), { target })
      expect((result.warnings ?? []).join(' ')).not.toContain('`dispose` is NOT ported')
      expect(result.code).toContain('flow.dispose()')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] containerSize reads the native measured property`, () => {
      const result = transform(base('', '<Text>{flow.containerSize().width}</Text>'), { target })
      expect((result.warnings ?? []).join(' ')).not.toContain('`containerSize` is NOT ported')
      expect(result.code).toContain('flow.containerSize.width')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] getNodeDimensions lowers with a native nominal result`, () => {
      const result = transform(base('', '<Text>{flow.getNodeDimensions("1").width}</Text>'), { target })
      expect((result.warnings ?? []).join(' ')).not.toContain('`getNodeDimensions` is NOT ported')
      expect(result.code).toContain('flow.getNodeDimensions("1").width')
      if (target === 'swift') expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      else expect(validateKotlin(result.code).ok).toBe(true)
    })
    it(`[${target}] a ported member emits with NO member warning (the control)`, () => {
      const w = warningsOf(base('', '<Button onPress={() => flow.zoomIn()}>Zoom</Button>'), target)
      expect(w).not.toContain('is NOT ported')
      expect(w).not.toContain('does NOTHING')
    })
    it(`[${target}] bulk, coordinate, visibility and group methods lower without silent member gaps`, () => {
      const src = base('', `<Button onPress={() => { flow.updateNode('1', { hidden: true, class: 'active-node', style: 'background: red', position: { x: 8, y: 9 }, data: { label: 'Node' } }); flow.updateNodeData('1', { label: 'Updated' }); flow.updateEdge('e1', { label: 'Edge', class: 'active-edge', style: 'stroke: red', animated: false, pathOptions: { offset: 12 }, markerEnd: null }); flow.selectNodes(['1'], true); flow.moveSelectedNodes(2, 3); flow.removeEdges(['e1']); flow.removeNodes(['missing']); flow.focusNode('1', 2); flow.panTo({ x: 4, y: 5 }) }}>Act</Button><Text>{flow.getNodes().length}</Text><Text>{flow.getEdges().length}</Text><Text>{flow.getViewport().zoom}</Text><Text>{flow.screenToFlowPosition({ x: 10, y: 20 }).x}</Text><Text>{flow.flowToScreenPosition({ x: 1, y: 2 }).y}</Text><Text>{flow.isNodeVisible('1')}</Text><Text>{flow.getChildNodes('root').length}</Text><Text>{flow.getAbsolutePosition('1').x}</Text>`)
      const result = transform(src, { target })
      const w = (result.warnings ?? []).join('\n')
      for (const member of ['updateNode', 'updateNodeData', 'updateEdge', 'selectNodes', 'moveSelectedNodes', 'removeEdges', 'removeNodes', 'focusNode', 'panTo', 'getNodes', 'getEdges', 'getViewport', 'screenToFlowPosition', 'flowToScreenPosition', 'isNodeVisible', 'getChildNodes', 'getAbsolutePosition']) {
        expect(w).not.toContain(`\`${member}\` is NOT ported`)
      }
      if (target === 'swift') {
        expect(result.code).toContain('flow.selectNodes(["1"], additive: true)')
        expect(result.code).toContain('flow.panTo(PyreonXYPosition(x: 4, y: 5))')
        expect(result.code).toContain('flow.updateNodeData("1") { data in data.label = "Updated" }')
        expect(result.code).toContain('flow.updateNode("1") { node in node.hidden = true; node.className = "active-node"; node.style = "background: red"; node.position = PyreonXYPosition(x: 8, y: 9); node.data.label = "Node" }')
        expect(result.code).toContain('flow.updateEdge("e1") { edge in edge.label = "Edge"; edge.className = "active-edge"; edge.style = "stroke: red"; edge.animated = false; edge.animatedSpecified = true; edge.pathOffset = 12; edge.markerEnd = nil; edge.markerEndSpecified = true }')
        expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      } else {
        expect(result.code).toContain('flow.moveSelectedNodes(2.0, 3.0)')
        expect(result.code).toContain('flow.focusNode("1", 2.0)')
        expect(result.code).toContain('flow.panTo(PyreonXYPosition(4.0, 5.0))')
        expect(result.code).toContain('flow.updateNodeData("1") { data -> data.copy(label = "Updated") }')
        expect(result.code).toContain('flow.updateNode("1") { node -> node.copy(hidden = true, className = "active-node", style = "background: red", position = PyreonXYPosition(8.0, 9.0), data = node.data.copy(label = "Node")) }')
        expect(result.code).toContain('flow.updateEdge("e1") { edge -> edge.copy(label = "Edge", className = "active-edge", style = "stroke: red", animated = false, animatedSpecified = true, pathOffset = 12.0, markerEnd = null, markerEndSpecified = true) }')
        expect(validateKotlin(result.code).ok).toBe(true)
      }
    })
    it(`[${target}] carried node/edge fields emit, while genuinely unsupported fields still warn BY NAME`, () => {
      const src = `
import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '${P}'
export function C() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' }, parentId: 'root', extent: 'parent', draggable: false, selectable: true, connectable: false, focusable: true, ariaLabel: 'Start node', hidden: false, deletable: true, class: 'source-node', style: 'background: #fff', expandParent: true, group: true, sourceHandles: [{ id: 'out', type: 'source', position: 'right' }], targetHandles: [{ type: 'target', position: 'left' }] }],
    edges: [{ id: 'e1', source: '1', target: '1', data: { label: 'wire', weight: 2, active: true, tags: ['a', null], meta: { kind: 'signal' } }, class: 'signal-edge', style: 'stroke: #f00; stroke-width: 2', markerStart: { type: 'arrowclosed', color: '#f00', width: 12, height: 8, strokeWidth: 2 }, markerEnd: 'arrow', sourceHandle: 'out', targetHandle: 'in', focusable: true, ariaLabel: 'Loop', hidden: false, deletable: true, reconnectable: false, interactionWidth: 24, pathOptions: { curvature: 0.4, borderRadius: 8, offset: 30 } }, { id: 'e2', source: '1', target: '1', markerEnd: null }],
    defaultMarkerEnd: null,
    nodesDraggable: false, nodesConnectable: false, nodesSelectable: false, nodesFocusable: false,
    edgesFocusable: false, nodesDeletable: false, edgesDeletable: false, edgesReconnectable: false,
    edgeInteractionWidth: 32, connectionRadius: 9, pannable: false, zoomable: false, multiSelect: false, onlyRenderVisibleElements: false,
    defaultEdgeType: 'step', fitView: true, fitViewPadding: 0.2,
    defaultEdgeOptions: { type: 'smoothstep', label: 'Default', animated: true, interactionWidth: 30, pathOptions: { borderRadius: 8, offset: 12 }, markerEnd: null },
  })
  return (<Stack><Text>{flow.nodes().length}</Text></Stack>)
}
`
      const result = transform(src, { target })
      const w = (result.warnings ?? []).join('\n')
      expect(w).not.toContain('field `style` is NOT carried')
      expect(w).not.toContain('field `class` is NOT carried')
      expect(w).not.toContain('edge field `markerEnd` is NOT carried')
      expect(w).not.toContain('edge field `markerStart` is NOT carried')
      expect(w).not.toContain('edge field `data` is NOT carried')
      for (const field of ['parentId', 'extent', 'draggable', 'selectable', 'connectable', 'focusable', 'ariaLabel', 'hidden', 'deletable', 'expandParent', 'group', 'sourceHandles', 'targetHandles', 'sourceHandle', 'targetHandle', 'reconnectable', 'interactionWidth', 'pathOptions']) {
        expect(w).not.toContain(`field \`${field}\` is NOT carried`)
      }
      const assignment = target === 'swift' ? ':' : ' ='
      expect(result.code).toContain(`parentId${assignment} "root"`)
      expect(result.code).toContain(`extentParent${assignment} true`)
      expect(result.code).toContain(`draggable${assignment} false`)
      expect(result.code).toContain(`sourceHandle${assignment} "out"`)
      expect(result.code).toContain(`targetHandle${assignment} "in"`)
      expect(result.code).toContain(`ariaLabel${assignment} "Loop"`)
      expect(result.code).toContain(`interactionWidth${assignment} ${target === 'swift' ? '24' : '24.0'}`)
      expect(result.code).toContain(`className${assignment} "source-node"`)
      expect(result.code).toContain(`style${assignment} "background: #fff"`)
      expect(result.code).toContain(`className${assignment} "signal-edge"`)
      expect(result.code).toContain(`style${assignment} "stroke: #f00; stroke-width: 2"`)
      expect(result.code).toContain(target === 'swift' ? 'data: PyreonFlowData(["label": .string("wire")' : 'data = PyreonFlowData(mapOf("label" to PyreonFlowDataValue.StringValue("wire")')
      expect(result.code).toContain(target === 'swift' ? '.object(PyreonFlowData(["kind": .string("signal")]))' : 'PyreonFlowDataValue.ObjectValue(PyreonFlowData(mapOf("kind" to PyreonFlowDataValue.StringValue("signal"))))')
      expect(result.code).toContain(`curvature${assignment} ${target === 'swift' ? '0.4' : '0.4'}`)
      expect(result.code).toContain(`borderRadius${assignment} ${target === 'swift' ? '8' : '8.0'}`)
      expect(result.code).toContain(`pathOffset${assignment} ${target === 'swift' ? '30' : '30.0'}`)
      expect(result.code).toContain(target === 'swift' ? 'markerStart: PyreonFlowMarker(type: "arrowclosed", color: "#f00", width: 12, height: 8, strokeWidth: 2)' : 'markerStart = PyreonFlowMarker("arrowclosed", color = "#f00", width = 12.0, height = 8.0, strokeWidth = 2.0)')
      expect(result.code).toContain(target === 'swift' ? 'markerEnd: PyreonFlowMarker(type: "arrow")' : 'markerEnd = PyreonFlowMarker("arrow")')
      expect(result.code).toContain(`markerEndSpecified${assignment} true`)
      expect(result.code).toContain(target === 'swift' ? 'markerEnd: nil, markerEndSpecified: true' : 'markerEnd = null, markerEndSpecified = true')
      expect(result.code).toContain(target === 'swift' ? 'defaultMarkerEnd: nil' : 'defaultMarkerEnd = null')
      for (const key of ['nodesDraggable', 'nodesConnectable', 'nodesSelectable', 'nodesFocusable', 'edgesFocusable', 'nodesDeletable', 'edgesDeletable', 'edgesReconnectable', 'pannable', 'zoomable', 'multiSelect', 'onlyRenderVisibleElements']) {
        expect(result.code).toContain(`${key}${assignment} false`)
        expect(w).not.toContain(`\`${key}\``)
      }
      expect(result.code).toContain(`edgeInteractionWidth${assignment} ${target === 'swift' ? '32' : '32.0'}`)
      expect(result.code).toContain(`connectionRadius${assignment} ${target === 'swift' ? '9' : '9.0'}`)
      expect(result.code).toContain(`defaultEdgeType${assignment} "step"`)
      expect(result.code).toContain(`${target === 'swift' ? 'fitView' : 'fitViewOnLoad'}${assignment} true`)
      expect(result.code).toContain(`fitViewPadding${assignment} 0.2`)
      expect(result.code).toContain(`defaultEdgeOptions${assignment} PyreonFlowDefaultEdgeOptions(`)
      expect(result.code).toContain(`${target === 'swift' ? 'markerEnd: nil' : 'markerEnd = null'}`)
      expect(result.code).toContain(`${target === 'swift' ? 'markerEndSpecified: true' : 'markerEndSpecified = true'}`)
      expect(result.code).toContain(target === 'swift' ? 'sourceHandles: [PyreonFlowHandleConfig(id: "out", type: "source", position: .right)]' : 'sourceHandles = listOf(PyreonFlowHandleConfig(id = "out", type = "source", position = PyreonFlowPosition.Right))')
    })
    it(`[${target}] a declaration-time NON-literal edge label/type is named, not silently dropped`, () => {
      const src = `
import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '${P}'
const LBL = 'wire'
export function C() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [{ id: 'e1', source: '1', target: '1', label: LBL }],
  })
  return (<Stack><Text>{flow.nodes().length}</Text></Stack>)
}
`
      expect(warningsOf(src, target)).toContain('`label (not a string literal)`')
    })
    it(`[${target}] nested JSON-compatible edge data is carried and native-compiler valid`, () => {
      const src = `
import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '${P}'
export function C() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [{ id: 'e1', source: '1', target: '1', data: { label: 'wire', count: 2, enabled: true, nested: { mode: 'fast' }, values: [1, null, false] } }],
  })
  return <Stack><Text>{flow.edges().length}</Text></Stack>
}`
      const result = transform(src, { target })
      expect(result.warnings.join(' ')).not.toContain('edge field `data`')
      expect(result.code).toContain(target === 'swift' ? 'data: PyreonFlowData(' : 'data = PyreonFlowData(')
      const validation = target === 'swift' ? validateSwiftWithStubs(result.code) : validateKotlin(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    })
    it(`[${target}] call-site addNode/addEdge literals with extra fields warn BY NAME`, () => {
      const source = base('', `<Button onPress={() => { flow.addNode({ id: '2', position: { x: 1, y: 1 }, data: { label: 'B' }, extent: [[0, 10], [100, 90]], hidden: true, sourceHandles: [{ id: 'out', type: 'source', position: 'right' }], class: 'new-node', style: 'background: blue' }); flow.addEdge({ source: '1', target: '2', data: { label: 'new' }, sourceHandle: 'out', class: 'new-edge', style: 'stroke: blue', waypoints: [], pathOptions: { offset: 31 }, markerEnd: 'arrow' }) }}>Add</Button>`)
      const result = transform(source, { target })
      const w = (result.warnings ?? []).join('\n')
      expect(w).not.toContain('field `style` is NOT carried')
      expect(w).not.toContain('field `class` is NOT carried')
      expect(w).not.toContain('node field `hidden` is NOT carried')
      expect(w).not.toContain('node field `sourceHandles` is NOT carried')
      expect(w).not.toContain('node field `extent` is NOT carried')
      expect(result.code).toContain(target === 'swift' ? 'extent: PyreonFlowNodeExtent(minX: 0, minY: 10, maxX: 100, maxY: 90)' : 'extent = PyreonFlowNodeExtent(minX = 0.0, minY = 10.0, maxX = 100.0, maxY = 90.0)')
      expect(w).not.toContain('addEdge(...): edge field `markerEnd` is NOT carried')
      expect(result.code).toContain(target === 'swift' ? 'markerEnd: PyreonFlowMarker(type: "arrow")' : 'markerEnd = PyreonFlowMarker("arrow")')
      expect(w).not.toContain('edge field `waypoints` is NOT carried')
      expect(w).not.toContain('edge field `sourceHandle` is NOT carried')
      expect(w).not.toContain('edge field `pathOptions` is NOT carried')
      expect(w).not.toContain('edge field `data` is NOT carried')
      expect(result.code).toContain(target === 'swift' ? 'data: PyreonFlowData(["label": .string("new")])' : 'data = PyreonFlowData(mapOf("label" to PyreonFlowDataValue.StringValue("new")))')
      expect(result.code).toContain(`pathOffset${target === 'swift' ? ':' : ' ='} ${target === 'swift' ? '31' : '31.0'}`)
      expect(result.code).toContain(target === 'swift' ? 'className: "new-node", style: "background: blue"' : 'style = "background: blue", className = "new-node"')
      expect(result.code).toContain(target === 'swift' ? 'className: "new-edge", style: "stroke: blue"' : 'style = "stroke: blue", className = "new-edge"')
      expect(result.code).toContain(target === 'swift' ? 'id: pyreonFlowEdgeId(source: "1", target: "2", sourceHandle: "out")' : 'id = pyreonFlowEdgeId(source = "1", target = "2", sourceHandle = "out")')
      const validation = target === 'swift' ? validateSwiftWithStubs(result.code) : validateKotlin(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    })
    it(`[${target}] waypoint editing and reconnect lower to native values and typecheck`, () => {
      const src = base('', `<Button onPress={() => { flow.addEdge({ id: 'e2', source: '1', target: '1', waypoints: [{ x: 4, y: 5 }] }); flow.addEdgeWaypoint('e1', { x: 1, y: 2 }, -1); flow.updateEdgeWaypoint('e1', 0, { x: 3, y: 4 }); flow.removeEdgeWaypoint('e1', -1); flow.reconnectEdge('e1', { target: '2', targetHandle: 'in' }) }}>Edit</Button>`)
      const result = transform(src, { target })
      const w = (result.warnings ?? []).join('\n')
      for (const member of ['addEdgeWaypoint', 'updateEdgeWaypoint', 'removeEdgeWaypoint', 'reconnectEdge']) {
        expect(w).not.toContain(`\`${member}\` is NOT ported`)
      }
      expect(w).not.toContain('edge field `waypoints` is NOT carried')
      if (target === 'swift') {
        expect(result.code).toContain('waypoints: [PyreonXYPosition(x: 4, y: 5)]')
        expect(result.code).toContain('flow.addEdgeWaypoint("e1", PyreonXYPosition(x: 1, y: 2), -1)')
        expect(result.code).toContain('flow.reconnectEdge("e1", target: "2", targetHandle: "in")')
        expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      } else {
        expect(result.code).toContain('waypoints = listOf(PyreonXYPosition(4.0, 5.0))')
        expect(result.code).toContain('flow.addEdgeWaypoint("e1", PyreonXYPosition(1.0, 2.0), -1)')
        expect(result.code).toContain('flow.reconnectEdge("e1", target = "2", targetHandle = "in")')
        expect(validateKotlin(result.code).ok).toBe(true)
      }
    })
    it(`[${target}] partial viewport writes and centering lower without losing omitted fields`, () => {
      const src = base('', `<Button onPress={() => { flow.setViewport({ x: 10, zoom: 2 }); flow.setCenter(30, 40, { zoom: 3 }) }}>View</Button>`)
      const result = transform(src, { target })
      const w = (result.warnings ?? []).join('\n')
      expect(w).not.toContain('`setViewport` is NOT ported')
      expect(w).not.toContain('`setCenter` is NOT ported')
      if (target === 'swift') {
        expect(result.code).toContain('flow.setViewport(x: 10, zoom: 2)')
        expect(result.code).toContain('flow.setCenter(30, 40, zoom: 3)')
        expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      } else {
        expect(result.code).toContain('flow.setViewport(x = 10.0, zoom = 2.0)')
        expect(result.code).toContain('flow.setCenter(30.0, 40.0, zoom = 3.0)')
        expect(validateKotlin(result.code).ok).toBe(true)
      }
    })
    it(`[${target}] literal bulk node and edge replacement lowers to nominal native model types`, () => {
      const src = base('', `<Button onPress={() => { flow.addNodes([{ id: '2', position: { x: 10, y: 20 }, data: { label: 'B' } }]); flow.addEdges([{ id: 'e2', source: '1', target: '2' }]); flow.setNodes([{ id: '2', position: { x: 30, y: 40 }, data: { label: 'C' } }]); flow.setEdges([{ id: 'e3', source: '2', target: '2' }]) }}>Bulk</Button>`)
      const result = transform(src, { target })
      const w = (result.warnings ?? []).join('\n')
      for (const member of ['addNodes', 'addEdges', 'setNodes', 'setEdges']) expect(w).not.toContain(`\`${member}\` is NOT ported`)
      if (target === 'swift') {
        expect(result.code).toMatch(/flow\.addNodes\(\[PyreonFlowNode\(id: "2"/)
        expect(result.code).toContain('flow.setEdges([PyreonFlowEdge(id: "e3", source: "2", target: "2")])')
        expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      } else {
        expect(result.code).toMatch(/flow\.addNodes\(listOf\(PyreonFlowNode\(id = "2"/)
        expect(result.code).toContain('flow.setEdges(listOf(PyreonFlowEdge(id = "e3", source = "2", target = "2")))')
        expect(validateKotlin(result.code).ok).toBe(true)
      }
    })
    it(`[${target}] node extent setup, clearing and clamping lower with typed positions`, () => {
      const src = base('', `<Button onPress={() => { flow.setNodeExtent([[0, 10], [200, 300]]); flow.clampToExtent({ x: 500, y: -2 }, 20, 30); flow.setNodeExtent(null) }}>Bounds</Button>`)
      const result = transform(src, { target })
      const w = (result.warnings ?? []).join('\n')
      expect(w).not.toContain('`setNodeExtent` is NOT ported')
      expect(w).not.toContain('`clampToExtent` is NOT ported')
      if (target === 'swift') {
        expect(result.code).toContain('flow.setNodeExtent(minX: 0, minY: 10, maxX: 200, maxY: 300)')
        expect(result.code).toContain('flow.clampToExtent(PyreonXYPosition(x: 500, y: -2), 20, 30)')
        expect(result.code).toContain('flow.clearNodeExtent()')
        expect(validateSwiftWithStubs(result.code).ok).toBe(true)
      } else {
        expect(result.code).toContain('flow.setNodeExtent(minX = 0.0, minY = 10.0, maxX = 200.0, maxY = 300.0)')
        expect(result.code).toContain('flow.clampToExtent(PyreonXYPosition(500.0, -2.0), 20.0, 30.0)')
        expect(result.code).toContain('flow.clearNodeExtent()')
        expect(validateKotlin(result.code).ok).toBe(true)
      }
    })
  }

  describe('Swift argument labels + stub fidelity', () => {
    const src = base('', `<Button onPress={() => { flow.selectNode('1', true); flow.selectEdge('e1', true); flow.fitView(undefined, 0.2); flow.fitView(['1'], 0.3) }}>Go</Button><Text>{flow.getNode('1')?.position.x}</Text><Text>{flow.getNode('1')?.width}</Text><Text>{flow.edges()[0].type}</Text>`)
    const r = transform(src, { target: 'swift' })
    it('emits the labeled forms the runtime requires', () => {
      expect(r.code).toContain('flow.selectNode("1", additive: true)')
      expect(r.code).toContain('flow.selectEdge("e1", additive: true)')
      expect(r.code).toContain('flow.fitView(nil, padding: 0.2)')
      expect(r.code).toContain('padding: 0.3)')
    })
    it('the labeled emit AND the valid reads typecheck against a stub that mirrors the runtime', () => {
      // The v1 stub had no stored `x`/`y`, no node `width`/`type`, and an
      // edge with no stored properties at all — every read below is valid
      // against PyreonFlowState.swift and was REJECTED by the gate.
      const v = validateSwiftWithStubs(r.code)
      expect(v.ok, v.error ?? '').toBe(true)
    })
  })

  describe('public marker helper native lowering', () => {
    const src = `
      import { createFlow, resolveMarker, markerId, resolveEdgeMarkers, collectEdgeMarkers, DEFAULT_MARKER_END, MarkerType } from '@pyreon/flow'
      import { Button } from '${P}'
      export function X() {
        const flow = createFlow({
          nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
          edges: [{ id: 'e1', source: '1', target: '1' }],
        })
        return <Button onPress={() => {
          resolveMarker({ type: MarkerType.Arrow, color: '#F00' })
          markerId({ type: MarkerType.ArrowClosed })
          resolveEdgeMarkers(flow.edges()[0], null)
          collectEdgeMarkers(flow.edges(), DEFAULT_MARKER_END)
        }}>Markers</Button>
      }
    `

    it('emits runtime marker helpers and constants on Swift', () => {
      const result = transform(src, { target: 'swift' })
      expect(result.code).toContain('pyreonResolveFlowMarker(PyreonFlowMarker(type: "arrow", color: "#F00"))')
      expect(result.code).toContain('pyreonFlowMarkerId(PyreonFlowMarker(type: "arrowclosed"))')
      expect(result.code).toContain('pyreonResolveFlowEdgeMarkers(flow.edges[0], defaultMarkerEnd: nil)')
      expect(result.code).toContain('pyreonCollectFlowEdgeMarkers(flow.edges, defaultMarkerEnd: pyreonFlowDefaultMarkerEnd)')
      expect((result.warnings ?? []).join(' ')).not.toContain('not available in the native compiler')
      expect(validateSwiftWithStubs(result.code).ok).toBe(true)
    })

    it('emits runtime marker helpers and constants on Kotlin', () => {
      const result = transform(src, { target: 'kotlin' })
      expect(result.code).toContain('pyreonResolveFlowMarker(PyreonFlowMarker("arrow", color = "#F00"))')
      expect(result.code).toContain('pyreonFlowMarkerId(PyreonFlowMarker("arrowclosed"))')
      expect(result.code).toContain('pyreonResolveFlowEdgeMarkers(flow.edges[0], null)')
      expect(result.code).toContain('pyreonCollectFlowEdgeMarkers(flow.edges, pyreonFlowDefaultMarkerEnd)')
      expect((result.warnings ?? []).join(' ')).not.toContain('not available in the native compiler')
      expect(validateKotlin(result.code).ok).toBe(true)
    })
  })

  describe('custom edge renderer native lowering', () => {
    it.each(['swift', 'kotlin'] as const)('resolves module-constant nodeTypes and edgeTypes maps on %s', (target) => {
      const source = `
        import { createFlow, Flow, type NodeComponentProps, type EdgeComponentProps } from '@pyreon/flow'
        import { Text } from '@pyreon/primitives'
        function Card(props: NodeComponentProps<{ label: string }>) { return <Text>{props.data().label}</Text> }
        function SignalEdge(_props: EdgeComponentProps) { return null }
        const baseNodeTypes = { card: Card }
        const baseEdgeTypes = { signal: SignalEdge }
        const nodeTypes = { ...baseNodeTypes }
        const edgeTypes = { ...baseEdgeTypes }
        export function App() {
          const flow = createFlow({ nodes: [{ id: 'a', type: 'card', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
          return <Flow instance={flow} nodeTypes={nodeTypes} edgeTypes={edgeTypes} />
        }
      `
      const result = transform(source, { target })
      expect(result.warnings.join(' ')).not.toContain('must be a literal { type: Component } map')
      expect(result.code).toContain(target === 'swift' ? 'case "card":\n    Card(' : '"card" -> Card(')
      expect(result.code).toContain(target === 'swift' ? 'customEdgeTypes: Set(["signal"])' : 'customEdgeTypes = setOf("signal")')
    })

    const src = `
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
    `

    it('dispatches a live Swift custom edge and draws the helper geometry', () => {
      const result = transform(src, { target: 'swift' })
      expect(result.code).toContain('customEdgeTypes: Set(["signal"])')
      expect(result.code).toContain('case "signal": return AnyView(SignalEdge(')
      expect(result.code).toContain('PyreonFlowCustomEdgePath(result: pyreonBezierPath(')
      expect(result.code).toContain('color: "#e11d48", width: 2')
      expect(result.code).toContain('PyreonFlowEdgeLabelRenderer {')
      expect((result.warnings ?? []).join('\n')).not.toContain('custom edge renderer maps are not lowered')
      const validation = validateSwiftWithStubs(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    })

    it('dispatches a live Kotlin custom edge and draws the helper geometry', () => {
      const result = transform(src, { target: 'kotlin' })
      expect(result.code).toContain('customEdgeTypes = setOf("signal")')
      expect(result.code).toContain('"signal" -> SignalEdge(')
      expect(result.code).toContain('PyreonFlowCustomEdgePath(result = pyreonBezierPath(')
      expect(result.code).toContain('color = "#e11d48", width = 2.0')
      expect(result.code).toContain('PyreonFlowEdgeLabelRenderer {')
      expect((result.warnings ?? []).join('\n')).not.toContain('custom edge renderer maps are not lowered')
      const validation = validateKotlin(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    })
  })

  describe('custom connection-line native lowering', () => {
    const src = `
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
    `

    it('dispatches the live structured preview on Swift', () => {
      const result = transform(src, { target: 'swift' })
      expect(result.code).toContain('customConnectionLineEnabled: true')
      expect(result.code).toContain('SignalLine(sourceX: { pyreonLine.sourceX }')
      expect(result.code).toContain('PyreonFlowCustomEdgePath(result: path()')
      expect(result.code).toContain('color: "#2563eb", width: 3')
      const validation = validateSwiftWithStubs(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    })

    it('dispatches the live structured preview on Kotlin', () => {
      const result = transform(src, { target: 'kotlin' })
      expect(result.code).toContain('customConnectionLineEnabled = true')
      expect(result.code).toContain('SignalLine(sourceX = { pyreonLine.sourceX }')
      expect(result.code).toContain('PyreonFlowCustomEdgePath(result = path()')
      expect(result.code).toContain('color = "#2563eb", width = 3.0')
      const validation = validateKotlin(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    })
  })

  describe('Flow chrome extension parity', () => {
    const src = `
      import { createFlow, Flow, MiniMap, Controls, type FlowNode } from '@pyreon/flow'
      import { Button } from '@pyreon/primitives'
      export function Diagram() {
        const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
        return <Flow instance={flow}><>
          <MiniMap nodeColor={(node: FlowNode<{ label: string }>) => node.data.label === 'A' ? '#ef4444' : '#22c55e'} />
          <Controls position="top-right"><Button onPress={() => flow.selectAll()}>All</Button></Controls>
        </></Flow>
      }
    `

    for (const target of ['swift', 'kotlin'] as const) {
      it(`[${target}] keeps minimap callbacks and appended controls`, () => {
        const result = transform(src, { target })
        expect(result.code).toContain(target === 'swift' ? 'miniMapNodeColor: {' : 'miniMapNodeColor = {')
        expect(result.code).toContain(target === 'swift' ? 'controlsContent: { AnyView(Group {' : 'controlsContent = {')
        expect(result.code).toContain(target === 'swift' ? 'flow.selectAll()' : 'flow.selectAll()')
        const validation = target === 'swift' ? validateSwiftWithStubs(result.code) : validateKotlin(result.code)
        expect(validation.ok, validation.error ?? '').toBe(true)
      })
    }
  })
})
