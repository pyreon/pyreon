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
export const LOWERED_FLOW_PROPERTY_READS: ReadonlySet<string> = new Set(['nodes', 'edges', 'viewport', 'zoom'])

/** Methods `PyreonFlowState` implements on BOTH targets (v1 surface). */
export const LOWERED_FLOW_METHODS: ReadonlySet<string> = new Set([
  'getNode', 'addNode', 'removeNode', 'updateNodePosition',
  'getEdge', 'addEdge', 'removeEdge',
  'isNodeSelected', 'isEdgeSelected', 'selectedNodes', 'selectedEdges',
  'selectNode', 'deselectNode', 'selectEdge', 'clearSelection', 'selectAll', 'deleteSelected',
  'zoomTo', 'zoomIn', 'zoomOut', 'panTo', 'fitView',
  'getConnectedEdges', 'getIncomers', 'getOutgoers',
])

/** `FlowNode` fields the native `PyreonFlowNode` carries. */
export const HANDLED_FLOW_NODE_FIELDS: ReadonlySet<string> = new Set(['id', 'type', 'position', 'data', 'width', 'height'])
/** `FlowEdge` fields the native `PyreonFlowEdge` carries. */
export const HANDLED_FLOW_EDGE_FIELDS: ReadonlySet<string> = new Set(['id', 'source', 'target', 'type', 'label', 'animated'])

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

export function flowFitViewWarning(flowName: string): string {
  return (
    `createFlow binding \`${flowName}\`: \`fitView()\` compiles natively but does NOTHING from shared source — the native engine frames the graph inside \`containerSize\`, which starts at 0×0 and is written only by a native host's size measurement (\`GeometryReader\` / \`onSizeChanged\`), and there is no <Flow> host emit yet. ` +
    `On web \`containerSize\` defaults to 800×600 and the <Flow> component measures it, so this button works there and is inert on iOS/Android. Call \`fitView\` from hand-written native code after measuring, or keep it in a \`<Web>\` branch.`
  )
}

export function droppedFlowFieldsWarning(site: string, kind: 'node' | 'edge', keys: readonly string[]): string {
  const handled = kind === 'node' ? HANDLED_FLOW_NODE_FIELDS : HANDLED_FLOW_EDGE_FIELDS
  return (
    `${site}: ${kind} field${keys.length === 1 ? '' : 's'} ${keys.map((k) => `\`${k}\``).join(', ')} ${keys.length === 1 ? 'is' : 'are'} NOT carried by the native Pyreon${kind === 'node' ? 'FlowNode' : 'FlowEdge'} and ${keys.length === 1 ? 'was' : 'were'} DROPPED — ` +
    `this ${kind} behaves differently on iOS/Android than on web from the SAME source. Only ${[...handled].map((k) => `\`${k}\``).join(', ')} cross today (v1).`
  )
}
