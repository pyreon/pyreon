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
import type { ExprIR, TypeIR } from '@pyreon/native-compiler/plugin-api'

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
 * `only: 'nodeTypes'` narrows it to the NODE renderers (where a
 * `<NodeToolbar>` / `<NodeResizer>` means something).
 */
export function collectFlowRendererComponents(roots: readonly unknown[], lookup: (name: string) => ExprIR | undefined, only?: 'nodeTypes'): Set<string> {
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
        if (a.name === 'nodeTypes' || (a.name === 'edgeTypes' && only === undefined)) {
          for (const entry of resolveStaticFlowRendererMap(a.value, lookup) ?? []) out.add(entry.component)
        } else if (a.name === 'connectionLine' && a.value.kind === 'identifier' && only === undefined) {
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

/**
 * Public `FlowConfig` fields whose native property is a `Double` on both
 * targets. A config WRITE of a whole number (`flow.config.historyLimit = 5`)
 * is a Kotlin `Int` — "assignment type mismatch: actual type is 'Int', but
 * 'Double' was expected" — so the emitters coerce the assigned value.
 */
export const DOUBLE_FLOW_CONFIG_PROPERTIES: ReadonlySet<string> = new Set([
  'minZoom', 'maxZoom', 'snapGrid', 'connectionRadius', 'panOnScrollSpeed', 'autoPanSpeed',
  'edgeInteractionWidth', 'fitViewPadding', 'historyLimit',
])

/**
 * The labelled parameters of the Swift `PyreonFlowState.init`, IN DECLARATION
 * ORDER. Swift rejects labelled arguments passed out of order ("argument 'x'
 * must precede argument 'y'"), so the emitter sorts its construction arguments
 * by this list rather than by the order its own code happens to push them —
 * that order had drifted (`autoHistory` before `fitViewPadding`,
 * `connectionRules` after `fitViewPadding`), so ordinary configs combining those
 * keys did not compile. Kotlin passes named arguments, which may appear in any
 * order. Locked against the real runtime AND the stub by
 * `native-flow-state.test.ts`.
 */
export const SWIFT_FLOW_STATE_INIT_LABELS: readonly string[] = [
  'nodes', 'edges', 'viewport', 'minZoom', 'maxZoom', 'snapToGrid', 'snapGrid', 'nodeExtent',
  'connectionRules', 'defaultMarkerEnd', 'nodesDraggable', 'nodesConnectable', 'nodesSelectable',
  'nodesFocusable', 'edgesFocusable', 'disableKeyboardA11y', 'nodesDeletable', 'edgesDeletable',
  'edgesReconnectable', 'edgeInteractionWidth', 'connectionRadius', 'pannable', 'panOnDrag',
  'panOnScroll', 'panOnScrollSpeed', 'zoomable', 'zoomOnScroll', 'zoomOnPinch', 'zoomOnDoubleClick',
  'selectionOnDrag', 'selectionMode', 'connectionMode', 'elevateNodesOnSelect', 'elevateEdgesOnSelect',
  'autoPanOnNodeDrag', 'autoPanOnConnect', 'autoPanSpeed', 'multiSelect', 'onlyRenderVisibleElements',
  'snapToObjects', 'defaultEdgeType', 'connectionLineType', 'defaultEdgeOptions', 'fitView',
  'fitViewPadding', 'autoHistory', 'historyLimit', 'isValidConnection', 'searchText', 'reducedMotion',
  'deleteKeys', 'multiSelectionKey', 'selectionKey', 'zoomActivationKey', 'preventScrolling',
]

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

/** The free path helpers whose native lowering returns a `PyreonFlowPathResult`. */
export const FLOW_PATH_RESULT_HELPERS: ReadonlySet<string> = new Set([
  'getBezierPath', 'getSmoothStepPath', 'getStepPath', 'getStraightPath', 'getWaypointPath', 'getEdgePath',
])

/**
 * How a custom-edge `<path d={X.path}>` reaches the native `result:` slot.
 *
 * `.path` is read off three different things, and each needs its own
 * spelling — the same member access means a structured path RESULT, a
 * connection-line ACCESSOR, or plain SVG text:
 *
 *   - `'object'`  — `X` is itself a path result: a path-helper call
 *                   (`getStraightPath({...}).path`) or a component-scope
 *                   const bound to one (`const p = getStraightPath(...)`;
 *                   `p.path`). The result keeps its segments, so `X` is passed
 *                   as is.
 *   - `'accessor'` — `X` is the component's props param (`props.path` in a
 *                   connection-line renderer), which natively is a `path`
 *                   closure → `path()`.
 *   - `'svg'`     — anything else. `X.path` is then SVG path DATA, parsed at
 *                   runtime like any other `d` string.
 *
 * Before this classification, EVERY non-call object took the accessor
 * spelling, so a local helper result emitted `result: path()` — a function
 * the edge component does not have — and failed the native build silently.
 */
export function classifyFlowPathMember(
  object: ExprIR,
  propsParamName: string | undefined,
  componentConsts: ReadonlyMap<string, ExprIR>,
): 'object' | 'accessor' | 'svg' {
  const isHelperCall = (e: ExprIR | undefined): boolean =>
    e?.kind === 'call' && e.callee.kind === 'identifier' && FLOW_PATH_RESULT_HELPERS.has(e.callee.name)
  if (isHelperCall(object)) return 'object'
  if (object.kind === 'identifier') {
    if (object.name === propsParamName) return 'accessor'
    if (isHelperCall(componentConsts.get(object.name))) return 'object'
  }
  return 'svg'
}

/**
 * A flow member's OPTIONS argument that the native port cannot express.
 *
 * The native methods take their options as labelled parameters
 * (`zoomTo(2, duration: 300)`), so only an object LITERAL whose keys are all
 * in `supported` can be rewritten. Anything else — an extra key the port does
 * not have (`{ speed }`), or an options object held in a variable — used to
 * fall through to the generic call emit with no warning and fail at the native
 * build. It still falls through (the same emitted-as-written fallback an
 * unported member gets), but is now NAMED first.
 */
export function unsupportedFlowOptionsWarning(flowName: string, member: string, supported: readonly string[], arg: ExprIR): string {
  const allowed = new Set(supported)
  const bad = arg.kind === 'object' ? arg.fields.map((f) => f.name).filter((name) => !allowed.has(name)) : []
  const what = arg.kind !== 'object'
    ? 'are passed as a non-literal value'
    : (arg.spreads?.length ?? 0) > 0
      ? 'use a spread'
      : `use the unsupported key${bad.length === 1 ? '' : 's'} ${bad.map((k) => `\`${k}\``).join(', ')}`
  return (
    `createFlow binding \`${flowName}\`: \`${member}(...)\` options ${what}. Natively the options are labelled parameters, so only an object literal with ${supported.map((k) => `\`${k}\``).join(', ')} lowers — ` +
    `this call is emitted as written and fails at the native BUILD. Write the options inline with only those keys, or keep the call in a \`<Web>\` branch.`
  )
}

/**
 * A literal argument / patch field of a flow member that has the right KIND
 * (an object or array literal) but not the shape the native constructor needs
 * — a point missing a coordinate, a handle without a literal `type`/`position`.
 * Emitting it would synthesize an anonymous struct the port does not accept,
 * and silently dropping it (the old behaviour for patch fields) made native
 * do nothing where the web moved the node. A patch field is dropped; a
 * positional argument (which cannot be dropped) is emitted as written. Both
 * are named.
 */
export function unloweredFlowLiteralWarning(flowName: string, site: string, expected: string, outcome: 'dropped' | 'emitted' = 'dropped'): string {
  return (
    `createFlow binding \`${flowName}\`: ${site} is a literal the native port cannot build — it must be ${expected}. ` +
    (outcome === 'dropped'
      ? 'It was DROPPED natively (the web applies it). '
      : 'The call is emitted as written and fails at the native BUILD. ') +
    'Complete the literal, or pass a value that already has the native type.'
  )
}

/** The `layout(algorithm, options)` keys `PyreonFlowLayoutOptions` carries. */
export const FLOW_LAYOUT_OPTION_KEYS: readonly string[] = ['direction', 'nodeSpacing', 'layerSpacing', 'animate', 'animationDuration']

export function flowLayoutOptionsDroppedWarning(flowName: string, keys: readonly string[]): string {
  return (
    `createFlow binding \`${flowName}\`: \`layout(...)\` option${keys.length === 1 ? '' : 's'} ${keys.map((k) => `\`${k}\``).join(', ')} ${keys.length === 1 ? 'has' : 'have'} no native counterpart and ${keys.length === 1 ? 'was' : 'were'} DROPPED — ` +
    `the native layout runs without ${keys.length === 1 ? 'it' : 'them'}, so it can differ from the web's. Natively only ${FLOW_LAYOUT_OPTION_KEYS.map((k) => `\`${k}\``).join(', ')} apply.`
  )
}

/**
 * Why a `<NodeToolbar>` reached the element emitter without lowering. The
 * toolbar is extracted up front from a node component's STATIC JSX; the
 * element itself always emits nothing, so every other placement is a drop.
 * Two different drops, with two different fixes: the component is not a
 * registered node renderer at all, or it is one but the toolbar sits where the
 * static extraction cannot see it (a conditional, a `.map`, a helper).
 */
export function droppedNodeToolbarWarning(registeredNodeRenderer: boolean, component: string): string {
  return registeredNodeRenderer
    ? `<NodeToolbar> in node component \`${component}\` is not a static JSX child (it sits inside a conditional, a \`.map\`, a helper call or a variable), so native extraction cannot see it and it was dropped. Write it directly in the component's returned JSX and gate it with \`showOnSelect\` / \`selected\` instead.`
    : `<NodeToolbar> in \`${component}\` only lowers inside a component registered by a literal <Flow nodeTypes={{ type: Component }}> map; it was dropped.`
}

/**
 * Unify the `data` rows of a `createFlow` node list into ONE row type.
 *
 * A native `PyreonFlowState<Row>` holds every node's `data` as the SAME
 * Codable struct, so rows that differ must be reconciled by field NAMES and
 * TYPES. Unifying by names alone left two broken shapes (both found as
 * `it.fails` specs): rows with the same field set but a differently-typed
 * field kept their OWN structs (`__Obj0` / `__Obj1`) against a state typed by
 * the first, and a field both re-typed and missing somewhere was merged to
 * `Any?`, which is not Codable. Same class as "select a struct by field names
 * AND types" (#3125).
 *
 * Rules per field:
 *   - `Int` and `Double` merge to `Double` (a whole number is a valid Double);
 *   - a `null` / `undefined` value, or a row that omits the field, makes it
 *     OPTIONAL rather than a separate type;
 *   - any OTHER disagreement has no Codable spelling — it is reported in
 *     `conflicts` for the caller to name, never silently typed `Any`.
 *
 * `heterogeneous` is true whenever the rows cannot all use the first row's
 * own struct — a name OR a type difference.
 */
export function unifyFlowDataRows(
  rows: { name: string; value: ExprIR }[][],
  infer: (value: ExprIR) => TypeIR,
): {
  heterogeneous: boolean
  fields: { name: string; type: TypeIR }[]
  conflicts: { name: string; types: TypeIR[] }[]
} {
  const allNames = [...new Set(rows.flatMap((fields) => fields.map((field) => field.name)))]
  let heterogeneous = rows.some(
    (fields) => fields.length !== allNames.length || allNames.some((name) => !fields.some((field) => field.name === name)),
  )
  const conflicts: { name: string; types: TypeIR[] }[] = []
  const fields = allNames.map((name) => {
    const values = rows.flatMap((row) => row.find((field) => field.name === name)?.value ?? [])
    // A `null` / `undefined` VALUE makes the field optional; it is not a type
    // of its own (inference reads a bare `null` literal as `unknown`).
    const isNullish = (value: ExprIR): boolean =>
      (value.kind === 'literal' && value.value === null) ||
      (value.kind === 'identifier' && value.name === 'undefined')
    const present = values.filter((value) => !isNullish(value))
    const optional = present.length < rows.length
    const raw = [...new Map(present.map((value) => { const type = infer(value); return [JSON.stringify(type), type] })).values()]
    const concrete = raw.filter((type) => type.kind !== 'null' && type.kind !== 'undefined')
    if (raw.length > 1 || (optional && values.length === rows.length)) heterogeneous = true
    let base: TypeIR
    if (concrete.length === 0) {
      // Every value is null / absent — nothing to name the field's type from.
      base = { kind: 'unknown' }
      conflicts.push({ name, types: [] })
    } else if (concrete.every((type) => type.kind === 'number')) {
      base = concrete.some((type) => type.kind === 'number' && type.float === true)
        ? { kind: 'number', float: true }
        : { kind: 'number' }
    } else if (concrete.length === 1) {
      base = concrete[0]!
    } else {
      base = { kind: 'union', branches: concrete }
      conflicts.push({ name, types: concrete })
    }
    const type: TypeIR = optional ? { kind: 'union', branches: [base, { kind: 'undefined' }] } : base
    return { name, type }
  })
  return { heterogeneous, fields, conflicts }
}

/** The named warning for {@link unifyFlowDataRows} conflicts (both emitters). */
export function flowDataConflictWarning(
  flowName: string,
  conflicts: { name: string; types: TypeIR[] }[],
  typeName: (type: TypeIR) => string,
): string {
  const list = conflicts
    .map((c) => `\`${c.name}\` (${c.types.length === 0 ? 'only ever null' : c.types.map(typeName).join(' vs ')})`)
    .join(', ')
  return `createFlow \`${flowName}\`: node \`data\` field(s) ${list} have no single native type across the nodes — every node's data shares ONE Codable row struct natively, and these values have no common spelling (\`Any\` is not Codable), so the flow does not compile on iOS/Android. Give each field one type in every node, or declare the row type (\`createFlow<{ … }>(…)\`).`
}

/**
 * An `updateEdge` patch field that is lowered only from a static shape — a
 * marker spec, a `pathOptions` object — and was DROPPED because the value is
 * not one (a computed marker, an options object in a variable, an unknown
 * `pathOptions` key). These used to vanish without a word.
 */
export function droppedFlowEdgePatchWarning(
  flowName: string,
  field: string,
  expected: string,
  member: 'updateEdge' | 'addEdge' = 'updateEdge',
): string {
  return (
    `createFlow binding \`${flowName}\`: ${member}(...) field \`${field}\` was DROPPED natively (the web applies it) — it lowers only as ${expected}. ` +
    (member === 'updateEdge' ? 'Write it inline in that form, or set it on the edge when it is created.' : 'Write it inline in that form.')
  )
}

/** The one spelling a marker must have to lower (shared by the add / update / seed paths). */
export const FLOW_MARKER_LITERAL_SHAPE =
  "a literal marker (`'arrow'` / `'arrowclosed'`, `MarkerType.X`, `{ type, color?, width?, height?, strokeWidth? }`, or `null`)"
const FLOW_PATH_OPTION_KEYS: readonly string[] = ['curvature', 'borderRadius', 'offset']

/**
 * The declines `addEdge({ … })` must NAME for its `pathOptions` / markers —
 * the same rule `updateEdge` follows. Each target's constructor lowered only
 * the literal shapes and SKIPPED the rest with no warning, so an edge added
 * with `markerEnd: someMarker` or `pathOptions: opts` lost them silently.
 * `markerLowers` is the target's own literal reader.
 */
export function addEdgeDropWarnings(
  flowName: string,
  fields: { pathOptions?: ExprIR | undefined; markerStart?: ExprIR | undefined; markerEnd?: ExprIR | undefined },
  markerLowers: (e: ExprIR) => boolean,
): string[] {
  const out: string[] = []
  const po = fields.pathOptions
  if (po !== undefined) {
    if (po.kind !== 'object' || (po.spreads?.length ?? 0) > 0) {
      out.push(droppedFlowEdgePatchWarning(flowName, 'pathOptions', 'an inline object literal', 'addEdge'))
    } else {
      const unknown = po.fields.map((f) => f.name).filter((n) => !FLOW_PATH_OPTION_KEYS.includes(n))
      if (unknown.length > 0) out.push(droppedFlowEdgePatchWarning(flowName, `pathOptions.${unknown.join('/')}`, 'one of `curvature`, `borderRadius`, `offset`', 'addEdge'))
    }
  }
  for (const name of ['markerStart', 'markerEnd'] as const) {
    const m = fields[name]
    if (m !== undefined && !markerLowers(m)) out.push(droppedFlowEdgePatchWarning(flowName, name, FLOW_MARKER_LITERAL_SHAPE, 'addEdge'))
  }
  return out
}

/**
 * A native Flow `<path>` with no `d`. Any `d` lowers: a path-helper result or
 * the connection line's `path()` keeps its segments, and any other string is
 * SVG path data the runtime parses (`PyreonFlowPathResult(svgPath:)` /
 * `pyreonFlowPathResultFromSvg`).
 */
export const FLOW_ARBITRARY_PATH_WARNING =
  'A native Flow <path> needs a `d` attribute: path data, a path helper result (`get*Path({...}).path`), ' +
  'or the custom connection line `path()` accessor. Without one there is nothing to draw, so it was dropped.'
