/**
 * The ONE description of what `createFlow` lowers natively — shared by the
 * parser (declaration-time node/edge literals) and BOTH emitters (call-site
 * literals, member calls), so the three cannot drift. Everything a user can
 * write against a flow-state binding is either in a set below or gets a
 * warning that NAMES it: the silent-drop class #3303 closed for CONFIG keys
 * was still open one level down (node/edge FIELDS) and one level up
 * (`FlowInstance` MEMBERS, which emitted verbatim with zero warnings and
 * died at `xcodebuild` — or, for `fitView`, compiled and silently did
 * nothing).
 */

/** Signal/Computed reads that lower to native properties (parens dropped). */
import type { ExprIR } from './types'

export function resolveStaticFlowRendererMap(
  expression: ExprIR | undefined,
  lookup: (name: string) => ExprIR | undefined,
  seen: ReadonlySet<string> = new Set(),
): { type: string; component: string }[] | undefined {
  if (expression?.kind === 'identifier') {
    if (seen.has(expression.name)) return undefined
    return resolveStaticFlowRendererMap(lookup(expression.name), lookup, new Set([...seen, expression.name]))
  }
  if (expression?.kind !== 'object') return undefined
  const entries = new Map<string, string>()
  for (const spread of expression.spreads ?? []) {
    const resolved = resolveStaticFlowRendererMap(spread, lookup, seen)
    if (resolved === undefined) return undefined
    for (const entry of resolved) entries.set(entry.type, entry.component)
  }
  for (const field of expression.fields) {
    if (field.value.kind !== 'identifier') return undefined
    entries.set(field.name, field.value.name)
  }
  return [...entries].map(([type, component]) => ({ type, component }))
}

/**
 * The components a `<Flow>` in this file renders nodes, edges or the
 * connection line with (`nodeTypes` / `edgeTypes` values and
 * `connectionLine`). An inline `<svg>` lowers natively only inside one of
 * these: anywhere else it is ordinary web markup and keeps its warning, and
 * the flow runtime it would draw with may not even be linked.
 *
 * Collected up front from every component's IR, because the `<Flow>` that
 * registers a renderer may be emitted after the renderer itself.
 */
export function collectFlowRendererComponents(roots: readonly unknown[], lookup: (name: string) => ExprIR | undefined): Set<string> {
  const out = new Set<string>()
  const seen = new Set<object>()
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    const n = node as { kind?: unknown; tag?: unknown; attrs?: unknown }
    if (n.kind === 'jsx-element' && n.tag === 'Flow' && Array.isArray(n.attrs)) {
      for (const a of n.attrs as { kind: string; name?: string; value?: ExprIR }[]) {
        if (a.kind !== 'attr' || a.value === undefined) continue
        if (a.name === 'nodeTypes' || a.name === 'edgeTypes') {
          for (const entry of resolveStaticFlowRendererMap(a.value, lookup) ?? []) out.add(entry.component)
        } else if (a.name === 'connectionLine' && a.value.kind === 'identifier') {
          out.add(a.value.name)
        }
      }
    }
    for (const value of Object.values(node)) visit(value)
  }
  visit(roots)
  return out
}

export const LOWERED_FLOW_PROPERTY_READS: ReadonlySet<string> = new Set([
  'nodes', 'edges', 'viewport', 'zoom', 'containerSize',
  'nodeMap', 'edgeMap', 'measurements',
])

/** Every public `<Flow>` prop is either lowered or diagnosed as an explicit
 * browser-presentation boundary. Kept beside the state surface registries so
 * adding a web prop cannot silently bypass the native completeness audit. */
export const HANDLED_FLOW_HOST_PROPS: ReadonlySet<string> = new Set([
  'instance', 'nodeTypes', 'edgeTypes', 'connectionLine',
  'style', 'class', 'ariaLabel', 'colorMode', 'children',
])

/** The public `@pyreon/flow/webview` component surface. Both emitters consume
 * every entry; this set is source-ratcheted in native-flow-state.test.ts. */
export const HANDLED_FLOW_WEBVIEW_PROPS: ReadonlySet<string> = new Set([
  'graph', 'commands', 'onSelect', 'onMessage', 'onEvent', 'onError', 'html',
  'nodeWidth', 'nodeHeight', 'nodeFill', 'nodeStroke', 'labelColor', 'edgeColor',
  'background',
])

/** Every public supporting-component prop is lowered, consumed from native
 * context, or diagnosed as an explicit browser-presentation boundary. */
export const HANDLED_FLOW_COMPONENT_PROPS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['BackgroundProps', new Set(['variant', 'gap', 'size', 'color'])],
  ['MiniMapProps', new Set(['style', 'class', 'nodeColor', 'maskColor', 'width', 'height', 'pannable', 'zoomable'])],
  ['ControlsProps', new Set(['instance', 'showZoomIn', 'showZoomOut', 'showFitView', 'showLock', 'position', 'children'])],
  ['PanelProps', new Set(['position', 'style', 'class', 'children'])],
  ['HandleProps', new Set(['type', 'position', 'id', 'offset', 'style', 'class'])],
  ['NodeResizerProps', new Set(['nodeId', 'instance', 'minWidth', 'minHeight', 'handleSize', 'showEdgeHandles'])],
  ['NodeToolbarProps', new Set(['position', 'offset', 'showOnSelect', 'selected', 'nodeId', 'align', 'style', 'class', 'children'])],
  ['EdgeLabelRendererProps', new Set(['children'])],
  ['BaseEdgeProps', new Set(['path', 'style', 'class', 'markerStart', 'markerEnd', 'label', 'labelX', 'labelY', 'labelStyle'])],
  ['EdgeTextProps', new Set(['x', 'y', 'label', 'style'])],
])

/** Public runtime exports whose portable semantics are implemented by the
 * native compiler/runtime pair. This inventory deliberately includes helpers,
 * constants and enum-like values, not only JSX hosts. */
export const LOWERED_FLOW_RUNTIME_EXPORTS: ReadonlySet<string> = new Set([
  'Background', 'Controls', 'Flow', 'Handle', 'MiniMap', 'NodeResizer',
  'NodeToolbar', 'EdgeLabelRenderer', 'Panel', 'BaseEdge', 'EdgeText',
  'DEFAULT_NODE_HEIGHT', 'DEFAULT_NODE_WIDTH', 'getBezierPath', 'getEdgePath',
  'getEffectiveDimensions', 'getFloatingEndpoints', 'getHandlePosition',
  'getNodeIntersection', 'getSmartHandlePositions', 'getSmoothStepPath',
  'getStepPath', 'getStraightPath', 'getWaypointPath', 'resolveHandleAnchor',
  'collectEdgeMarkers', 'DEFAULT_MARKER_END', 'markerId', 'resolveEdgeMarkers',
  'resolveMarker', 'createFlow', 'useFlow', 'computeLayout', 'MarkerType',
  'Position',
])

/** Public runtime exports that are intrinsically tied to the DOM renderer and
 * must remain behind a web branch/host rather than being silently emitted. */
export const WEB_ONLY_FLOW_RUNTIME_EXPORTS: ReadonlySet<string> = new Set([
  'FlowLayersContext', 'flowStyles', 'ViewportPortal',
])

/** Web-only Flow COMPONENTS the emitters DROP (emit nothing) with their own
 * named warning at the use site. The import-boundary line ("reproduced
 * verbatim … the native build fails") would be false for these, so it is
 * skipped; a subset of `WEB_ONLY_FLOW_RUNTIME_EXPORTS`. */
export const DROPPED_FLOW_COMPONENTS: ReadonlySet<string> = new Set(['ViewportPortal'])

/**
 * The labels of the Swift `PyreonFlowState` initializer, in declaration order.
 * Swift requires labeled arguments in this order, so the emitter sorts the
 * config arguments by it. Drift-locked against BOTH the real runtime
 * (`flow/native/swift/PyreonFlowState.swift`) and the stub.
 */
export const SWIFT_FLOW_STATE_INIT_LABELS: readonly string[] = [
  'nodes', 'edges', 'viewport', 'minZoom', 'maxZoom', 'snapToGrid', 'snapGrid', 'nodeExtent', 'connectionRules',
  'defaultMarkerEnd', 'nodesDraggable', 'nodesConnectable', 'nodesSelectable', 'nodesFocusable', 'edgesFocusable',
  'disableKeyboardA11y', 'nodesDeletable', 'edgesDeletable', 'edgesReconnectable', 'edgeInteractionWidth',
  'connectionRadius', 'pannable', 'panOnDrag', 'panOnScroll', 'panOnScrollSpeed', 'zoomable', 'zoomOnScroll',
  'zoomOnPinch', 'zoomOnDoubleClick', 'selectionOnDrag', 'selectionMode', 'connectionMode', 'elevateNodesOnSelect',
  'elevateEdgesOnSelect', 'autoPanOnNodeDrag', 'autoPanOnConnect', 'autoPanSpeed', 'multiSelect',
  'onlyRenderVisibleElements', 'snapToObjects', 'defaultEdgeType', 'connectionLineType', 'defaultEdgeOptions',
  'fitView', 'fitViewPadding', 'autoHistory', 'historyLimit', 'isValidConnection', 'searchText', 'reducedMotion',
  'deleteKeys', 'multiSelectionKey', 'selectionKey', 'zoomActivationKey', 'preventScrolling',
]

/** Mutable `FlowConfig` fields retained by both native state engines. */
export const LOWERED_FLOW_CONFIG_PROPERTIES: ReadonlyMap<string, string> = new Map([
  ['defaultEdgeType', 'defaultEdgeType'], ['defaultEdgeOptions', 'defaultEdgeOptions'],
  ['minZoom', 'minZoom'], ['maxZoom', 'maxZoom'], ['snapToGrid', 'snapToGrid'],
  ['snapGrid', 'snapGrid'], ['snapToObjects', 'snapToObjects'],
  ['connectionRules', 'connectionRules'], ['nodesDraggable', 'nodesDraggable'],
  ['nodesConnectable', 'nodesConnectable'], ['nodesSelectable', 'nodesSelectable'],
  ['nodesFocusable', 'nodesFocusable'], ['edgesFocusable', 'edgesFocusable'],
  ['disableKeyboardA11y', 'disableKeyboardA11y'], ['reducedMotion', 'reducedMotion'],
  ['nodesDeletable', 'nodesDeletable'], ['edgesDeletable', 'edgesDeletable'],
  ['isValidConnection', 'connectionValidator'], ['connectionRadius', 'connectionRadius'],
  ['autoHistory', 'autoHistory'], ['historyLimit', 'historyLimit'], ['multiSelect', 'multiSelect'], ['nodeExtent', 'nodeExtent'],
  ['pannable', 'pannable'], ['zoomable', 'zoomable'], ['panOnDrag', 'panOnDrag'],
  ['panOnScroll', 'panOnScroll'], ['panOnScrollSpeed', 'panOnScrollSpeed'],
  ['zoomOnScroll', 'zoomOnScroll'], ['zoomOnPinch', 'zoomOnPinch'],
  ['zoomOnDoubleClick', 'zoomOnDoubleClick'], ['selectionOnDrag', 'selectionOnDrag'],
  ['selectionMode', 'selectionMode'], ['connectionMode', 'connectionMode'], ['deleteKeys', 'deleteKeys'],
  ['elevateNodesOnSelect', 'elevateNodesOnSelect'], ['elevateEdgesOnSelect', 'elevateEdgesOnSelect'],
  ['autoPanOnNodeDrag', 'autoPanOnNodeDrag'], ['autoPanOnConnect', 'autoPanOnConnect'], ['autoPanSpeed', 'autoPanSpeed'],
  ['multiSelectionKey', 'multiSelectionKey'], ['selectionKey', 'selectionKey'],
  ['zoomActivationKey', 'zoomActivationKey'], ['edgesReconnectable', 'edgesReconnectable'],
  ['edgeInteractionWidth', 'edgeInteractionWidth'], ['connectionLineType', 'connectionLineType'],
  ['preventScrolling', 'preventScrolling'], ['fitView', 'fitViewOnLoad'],
  ['fitViewPadding', 'fitViewPadding'], ['defaultMarkerEnd', 'defaultMarkerEnd'],
  ['onlyRenderVisibleElements', 'onlyRenderVisibleElements'],
])

/** Methods `PyreonFlowState` implements on BOTH targets (v1 surface). */
export const LOWERED_FLOW_METHODS: ReadonlySet<string> = new Set([
  'getNode', 'getNodeDimensions', 'getNodes', 'addNode', 'addNodes', 'setNodes', 'removeNode', 'removeNodes', 'updateNode', 'updateNodePosition', 'updateNodeData',
  '_setNodeMeasurement', '_clearNodeMeasurement',
  'getEdge', 'getEdges', 'addEdge', 'addEdges', 'setEdges', 'removeEdge', 'removeEdges', 'updateEdge',
  'isNodeSelected', 'isEdgeSelected', 'selectedNodes', 'selectedEdges',
  'selectNode', 'selectNodes', 'deselectNode', 'selectEdge', 'clearSelection', 'selectAll', 'deleteSelected',
  'zoomTo', 'zoomIn', 'zoomOut', 'panTo', 'fitView', 'getViewport', 'setViewport', 'setCenter',
  'screenToFlowPosition', 'flowToScreenPosition', 'isNodeVisible', 'focusNode',
  'moveSelectedNodes',
  'addEdgeWaypoint', 'removeEdgeWaypoint', 'updateEdgeWaypoint', 'reconnectEdge',
  'isValidConnection',
  'getConnectedEdges', 'getIncomers', 'getOutgoers', 'getChildNodes', 'getAbsolutePosition',
  'findNodes', 'searchNodes',
  'getProximityConnection', 'getOverlappingNodes', 'resolveCollisions',
  'getIntersectingNodes', 'isNodeIntersecting', 'getNodesBounds',
  'getSnapLines',
  'onConnect', 'onViewportChange', 'onNodeClick', 'onNodeDoubleClick', 'onNodeDragStart', 'onNodeDrag', 'onNodeDragEnd', 'onEdgeClick', 'onSelectionChange', 'onNodesDelete', 'onEdgesDelete', 'onNodesChange', 'onEdgesChange', 'onConnectStart', 'onConnectEnd', 'onPaneClick',
  'onNodeContextMenu', 'onEdgeContextMenu', 'onPaneContextMenu', 'onNodeMouseEnter', 'onNodeMouseLeave', 'onEdgeMouseEnter', 'onEdgeMouseLeave',
  'setNodeExtent', 'clampToExtent',
  'copySelected', 'paste', 'pushHistory', 'undo', 'redo',
  'toJSON', 'fromJSON',
  'batch',
  'animateViewport',
  'layout',
  'dispose',
])

/** `FlowNode` fields the native `PyreonFlowNode` carries. */
export const HANDLED_FLOW_NODE_FIELDS: ReadonlySet<string> = new Set([
  'id', 'type', 'position', 'data', 'width', 'height',
  'draggable', 'selectable', 'connectable', 'focusable', 'ariaLabel',
  'hidden', 'deletable', 'parentId', 'extent', 'expandParent', 'group', 'zIndex',
  'class', 'style',
  'sourceHandles', 'targetHandles',
])
/** `FlowEdge` fields the native `PyreonFlowEdge` carries. */
export const HANDLED_FLOW_EDGE_FIELDS: ReadonlySet<string> = new Set([
  'id', 'source', 'target', 'sourceHandle', 'targetHandle', 'type', 'label',
  'animated', 'focusable', 'ariaLabel', 'hidden', 'deletable',
  'reconnectable', 'interactionWidth', 'waypoints', 'zIndex',
  'data',
  'class', 'style',
  'pathOptions',
  'markerStart', 'markerEnd',
])

export function unloweredFlowMemberWarning(flowName: string, member: string): string {
  return (
    `createFlow binding \`${flowName}\`: \`${member}\` is NOT ported to the native PyreonFlowState — the call is emitted as written and fails at the native BUILD (\`value of type 'PyreonFlowState' has no member '${member}'\`). ` +
    `Ported today: ${[...LOWERED_FLOW_METHODS].join(', ')} and the reads ${[...LOWERED_FLOW_PROPERTY_READS].map((p) => `${p}()`).join(', ')}. ` +
    `Keep this call in a \`<Web>\` branch, drive it from hand-written native code, or host the editor on the \`@pyreon/flow/webview\` bridge.`
  )
}

export function flowSignalWriteWarning(flowName: string, prop: string, op: string): string {
  return (
    `createFlow binding \`${flowName}\`: \`${prop}.${op}(...)\` writes the \`${prop}\` signal directly — the native PyreonFlowState exposes \`${prop}\` read-only, so this fails at the native BUILD. ` +
    `Mutate through the engine's methods (addNode/removeNode/updateNodePosition/addEdge/removeEdge/deleteSelected/zoomTo/panTo) — they lower on both targets.`
  )
}

export function droppedFlowFieldsWarning(site: string, kind: 'node' | 'edge', keys: readonly string[]): string {
  const handled = kind === 'node' ? HANDLED_FLOW_NODE_FIELDS : HANDLED_FLOW_EDGE_FIELDS
  return (
    `${site}: ${kind} field${keys.length === 1 ? '' : 's'} ${keys.map((k) => `\`${k}\``).join(', ')} ${keys.length === 1 ? 'is' : 'are'} NOT carried by the native Pyreon${kind === 'node' ? 'FlowNode' : 'FlowEdge'} and ${keys.length === 1 ? 'was' : 'were'} DROPPED — ` +
    `this ${kind} behaves differently on iOS/Android than on web from the SAME source. Only ${[...handled].map((k) => `\`${k}\``).join(', ')} cross today (v1).`
  )
}

/**
 * `<NodeResizer nodeId>` names the node to resize. Inside a node renderer the
 * native resizer always attaches to its HOST node, which is what `nodeId={id}`
 * / `nodeId={props.id}` (every documented use) asks for. Any other value, a
 * literal or another node's id, would resize a different node on the web and
 * the host natively, so it is reported instead of silently lowered.
 */
export function nodeResizerTargetsAnotherNode(e: Extract<ExprIR, { kind: 'jsx-element' }>, propsParamName: string | undefined): boolean {
  const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'nodeId')
  if (attr?.kind !== 'attr') return false
  const v = attr.value
  if (v.kind === 'identifier' && v.name === 'id') return false
  if (v.kind === 'member' && v.property === 'id' && v.object.kind === 'identifier' && v.object.name === propsParamName) return false
  return true
}

export const NODE_RESIZER_FOREIGN_NODE_WARNING = (component: string): string =>
  `<Flow nodeTypes> component \`${component}\`: <NodeResizer nodeId> names a node other than its host. Natively the resizer always resizes the node it is rendered in; pass \`nodeId={props.id}\` (or move the resizer into the target node's renderer).`

/**
 * The `{ x, y, width, height }` fields of a rect literal passed to
 * `getIntersectingNodes` / `isNodeIntersecting`, in native constructor order, or
 * `null` when the argument is not a literal of exactly that shape (an id, or a
 * rect held in a variable, is then emitted as written).
 */
export function flowRectLiteralFields(e: ExprIR): [ExprIR, ExprIR, ExprIR, ExprIR] | null {
  if (e.kind !== 'object' || (e.spreads?.length ?? 0) > 0) return null
  const fields = new Map(e.fields.map((f) => [f.name, f.value]))
  const order = ['x', 'y', 'width', 'height'] as const
  if (fields.size !== 4 || !order.every((k) => fields.has(k))) return null
  return order.map((k) => fields.get(k)!) as [ExprIR, ExprIR, ExprIR, ExprIR]
}
