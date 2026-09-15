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

export const LOWERED_FLOW_PROPERTY_READS: ReadonlySet<string> = new Set([
  'nodes', 'edges', 'viewport', 'zoom', 'containerSize',
  'nodeMap', 'edgeMap', 'measurements',
])

/** Methods `PyreonFlowState` implements on BOTH targets (v1 surface). */
export const LOWERED_FLOW_METHODS: ReadonlySet<string> = new Set([
  'getNode', 'getNodeDimensions', 'getNodes', 'addNode', 'addNodes', 'setNodes', 'removeNode', 'removeNodes', 'updateNode', 'updateNodePosition', 'updateNodeData',
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
  'getSnapLines',
  'onConnect', 'onViewportChange', 'onNodeClick', 'onNodeDoubleClick', 'onNodeDragStart', 'onNodeDrag', 'onNodeDragEnd', 'onEdgeClick', 'onSelectionChange', 'onNodesDelete', 'onEdgesDelete', 'onNodesChange', 'onEdgesChange', 'onConnectStart', 'onConnectEnd', 'onPaneClick',
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
  'hidden', 'deletable', 'parentId', 'extent', 'expandParent', 'group',
  'sourceHandles', 'targetHandles',
])
/** `FlowEdge` fields the native `PyreonFlowEdge` carries. */
export const HANDLED_FLOW_EDGE_FIELDS: ReadonlySet<string> = new Set([
  'id', 'source', 'target', 'sourceHandle', 'targetHandle', 'type', 'label',
  'animated', 'focusable', 'ariaLabel', 'hidden', 'deletable',
  'reconnectable', 'interactionWidth', 'waypoints',
  'data',
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
