/**
 * The Swift `flow-state` declaration emitter — moved verbatim from the compiler's
 * `emitSwiftDecl`.
 */
import { type TypeIR, swiftIdent, swiftStr } from '@pyreon/native-compiler/plugin-api'
import { flowDataConflictWarning, unifyFlowDataRows } from './lowering'
import { host } from './swift-facade'
import { swiftFlowCoord, swiftFlowData, swiftFlowInitRank, swiftFlowMarker, swiftFlowParsedHandles } from './swift-literals'
import { type FlowStateDecl } from './types'

// `@pyreon/flow` — a self-seeding @State PyreonFlowState. Fully
  // self-contained (no `.onAppear` wiring — unlike table/sync, `createFlow`
  // OWNS its data, not an external signal), so the whole node/edge literal
  // config emits straight into the initializer. The row struct comes from
  // inferring an ARRAY of every node's `data` sub-expression — the same
  // "infer the element type of an array-of-objects" recipe `table-state`
  // uses on its `dataBody`, just fed a synthetic array built from the
  // literal `data` fields instead of a live signal read.
  /** Swift for a `createFlow` / `useFlow` declaration: a self-seeding @State PyreonFlowState. */
export function swiftFlowStateDecl(d: FlowStateDecl): string {
    // The row struct comes from REGISTERING the first node's `data` field
    // set via the SAME `synthLiteralStructName` registry every OTHER object
    // literal in this file resolves through — not from `inferType` on a
    // synthetic array. `inferType`'s object case only resolves a literal
    // against an ALREADY-declared struct (see infer-type.ts's own comment:
    // "the emit synthesizes an anonymous struct for it, but inference can't
    // name that without the emitter's per-run registry"), so calling it on a
    // one-off array built here found nothing and produced `Any` — the exact
    // failure this comment exists to prevent a future edit from
    // reintroducing. Registering FIRST (via the shared registry) guarantees
    // this name is the SAME one each node's `data: {...}` literal resolves
    // to below, since both hit the identical field-set key.
    const dataRows = d.nodes.flatMap((node) => node.data.kind === 'object' ? [node.data.fields] : [])
    const firstData = d.nodes[0]?.data
    const rowFields = firstData?.kind === 'object' ? firstData.fields : []
    let inferredRowType: TypeIR | undefined
    let rowType = d.dataType !== undefined ? host.typeText(d.dataType) : 'Any'
    // An inline-object generic (`createFlow<{ label: string }>`) must name the
    // SAME struct its `data: { label }` literals resolve to; a context-free
    // `swiftType` cannot, and degraded it to the bare field type (`String`).
    if (d.dataType?.kind === 'object') {
      const named = host.structs.forTypeFields(d.dataType.fields)
      if (named !== null) {
        rowType = named
        inferredRowType = { kind: 'typeRef', name: named, args: [] }
      }
    }
    if (d.dataType === undefined && dataRows.length > 0) {
      // Unify by field NAMES and TYPES (see unifyFlowDataRows).
      const { heterogeneous, fields, conflicts } = unifyFlowDataRows(dataRows, (value) => host.inferType(value))
      if (conflicts.length > 0) host.warn(flowDataConflictWarning(d.name, conflicts, (t) => host.typeText(t)))
      if (heterogeneous) {
        const name = host.structs.synthesize(fields)
        inferredRowType = { kind: 'typeRef', name, args: [] }
        rowType = name
      } else {
        rowType = host.structs.forLiteralFields(rowFields) ?? 'Any'
      }
    }
    const expectedRowType = inferredRowType ?? d.dataType
    const nodeLits = d.nodes
      .map((n) => {
        const parts = [
          `id: ${swiftStr(n.id)}`,
          ...(n.type !== undefined ? [`type: ${swiftStr(n.type)}`] : []),
          `position: PyreonXYPosition(x: ${swiftFlowCoord(n.positionX)}, y: ${swiftFlowCoord(n.positionY)})`,
          `data: ${host.exprAs(expectedRowType, n.data, 0)}`,
          ...(n.width !== undefined ? [`width: ${host.expr(n.width, 0)}`] : []),
          ...(n.height !== undefined ? [`height: ${host.expr(n.height, 0)}`] : []),
          ...(n.draggable !== undefined ? [`draggable: ${n.draggable}`] : []),
          ...(n.selectable !== undefined ? [`selectable: ${n.selectable}`] : []),
          ...(n.connectable !== undefined ? [`connectable: ${n.connectable}`] : []),
          ...(n.focusable !== undefined ? [`focusable: ${n.focusable}`] : []),
          ...(n.ariaLabel !== undefined ? [`ariaLabel: ${swiftStr(n.ariaLabel)}`] : []),
          ...(n.hidden !== undefined ? [`hidden: ${n.hidden}`] : []),
          ...(n.deletable !== undefined ? [`deletable: ${n.deletable}`] : []),
          ...(n.cssClass !== undefined ? [`className: ${swiftStr(n.cssClass)}`] : []),
          ...(n.style !== undefined ? [`style: ${swiftStr(n.style)}`] : []),
          ...(n.parentId !== undefined ? [`parentId: ${swiftStr(n.parentId)}`] : []),
          ...(n.extent !== undefined ? [`extent: PyreonFlowNodeExtent(minX: ${n.extent[0]}, minY: ${n.extent[1]}, maxX: ${n.extent[2]}, maxY: ${n.extent[3]})`] : []),
          ...(n.extentParent === true ? ['extentParent: true'] : []),
          ...(n.expandParent !== undefined ? [`expandParent: ${n.expandParent}`] : []),
          ...(n.group !== undefined ? [`group: ${n.group}`] : []),
          ...(n.sourceHandles !== undefined ? [`sourceHandles: ${swiftFlowParsedHandles(n.sourceHandles)}`] : []),
          ...(n.targetHandles !== undefined ? [`targetHandles: ${swiftFlowParsedHandles(n.targetHandles)}`] : []),
          ...(n.zIndex !== undefined ? [`zIndex: ${n.zIndex}`] : []),
        ]
        return `PyreonFlowNode(${parts.join(', ')})`
      })
      .join(', ')
    const edgeLits = d.edges
      .map((e) => {
        const parts = [
          `id: ${swiftStr(e.id)}`,
          `source: ${swiftStr(e.source)}`,
          `target: ${swiftStr(e.target)}`,
          ...(e.sourceHandle !== undefined ? [`sourceHandle: ${swiftStr(e.sourceHandle)}`] : []),
          ...(e.targetHandle !== undefined ? [`targetHandle: ${swiftStr(e.targetHandle)}`] : []),
          ...(e.type !== undefined ? [`type: ${swiftStr(e.type)}`] : []),
          ...(e.label !== undefined ? [`label: ${swiftStr(e.label)}`] : []),
          ...(e.animated !== undefined ? [`animated: ${e.animated ? 'true' : 'false'}`, 'animatedSpecified: true'] : []),
          ...(e.focusable !== undefined ? [`focusable: ${e.focusable}`] : []),
          ...(e.ariaLabel !== undefined ? [`ariaLabel: ${swiftStr(e.ariaLabel)}`] : []),
          ...(e.hidden !== undefined ? [`hidden: ${e.hidden}`] : []),
          ...(e.deletable !== undefined ? [`deletable: ${e.deletable}`] : []),
          ...(e.reconnectable !== undefined ? [`reconnectable: ${e.reconnectable}`] : []),
          ...(e.interactionWidth !== undefined ? [`interactionWidth: ${e.interactionWidth}`] : []),
          ...(e.cssClass !== undefined ? [`className: ${JSON.stringify(e.cssClass)}`] : []),
          ...(e.style !== undefined ? [`style: ${JSON.stringify(e.style)}`] : []),
          ...(e.data !== undefined && swiftFlowData(e.data) !== null ? [`data: ${swiftFlowData(e.data)}`] : []),
          ...(e.pathOptions?.curvature !== undefined ? [`curvature: ${e.pathOptions.curvature}`] : []),
          ...(e.pathOptions?.borderRadius !== undefined ? [`borderRadius: ${e.pathOptions.borderRadius}`] : []),
          ...(e.pathOptions?.offset !== undefined ? [`pathOffset: ${e.pathOptions.offset}`] : []),
          ...(e.markerStart !== undefined ? [`markerStart: ${swiftFlowMarker(e.markerStart)}`] : []),
          ...(e.markerEnd !== undefined ? [`markerEnd: ${e.markerEnd === null ? 'nil' : swiftFlowMarker(e.markerEnd)}`, 'markerEndSpecified: true'] : []),
          ...(e.waypoints !== undefined ? [`waypoints: [${e.waypoints.map((p) => `PyreonXYPosition(x: ${swiftFlowCoord(p.x)}, y: ${swiftFlowCoord(p.y)})`).join(', ')}]`] : []),
          ...(e.zIndex !== undefined ? [`zIndex: ${e.zIndex}`] : []),
        ]
        return `PyreonFlowEdge(${parts.join(', ')})`
      })
      .join(', ')
    // `minZoom`/`maxZoom` are appended ONLY when the config supplied them, so
    // an unconfigured `createFlow` emits byte-identically to before.
    const zoomArgs = [
      ...(d.minZoom !== undefined ? [`minZoom: ${d.minZoom}`] : []),
      ...(d.maxZoom !== undefined ? [`maxZoom: ${d.maxZoom}`] : []),
      ...(d.snapToGrid !== undefined ? [`snapToGrid: ${d.snapToGrid}`] : []),
      ...(d.snapGrid !== undefined ? [`snapGrid: ${d.snapGrid}`] : []),
      ...(d.nodeExtent !== undefined ? [`nodeExtent: PyreonFlowNodeExtent(minX: ${d.nodeExtent[0]}, minY: ${d.nodeExtent[1]}, maxX: ${d.nodeExtent[2]}, maxY: ${d.nodeExtent[3]})`] : []),
      ...(d.defaultMarkerEnd !== undefined ? [`defaultMarkerEnd: ${d.defaultMarkerEnd === null ? 'nil' : swiftFlowMarker(d.defaultMarkerEnd)}`] : []),
      ...(['nodesDraggable', 'nodesConnectable', 'nodesSelectable', 'nodesFocusable', 'edgesFocusable', 'disableKeyboardA11y', 'nodesDeletable', 'edgesDeletable', 'edgesReconnectable', 'pannable', 'panOnDrag', 'panOnScroll'] as const).flatMap((key) => d[key] === undefined ? [] : [`${key}: ${d[key]}`]),
      ...(d.panOnScrollSpeed !== undefined ? [`panOnScrollSpeed: ${d.panOnScrollSpeed}`] : []),
      ...(['zoomable', 'zoomOnScroll', 'zoomOnPinch', 'zoomOnDoubleClick', 'selectionOnDrag'] as const).flatMap((key) => d[key] === undefined ? [] : [`${key}: ${d[key]}`]),
      ...(d.selectionMode !== undefined ? [`selectionMode: ${swiftStr(d.selectionMode)}`] : []),
      ...(d.connectionMode !== undefined ? [`connectionMode: ${swiftStr(d.connectionMode)}`] : []),
      ...(['elevateNodesOnSelect', 'elevateEdgesOnSelect', 'autoPanOnNodeDrag', 'autoPanOnConnect'] as const).flatMap((key) => d[key] === undefined ? [] : [`${key}: ${d[key]}`]),
      ...(d.autoPanSpeed !== undefined ? [`autoPanSpeed: ${d.autoPanSpeed}`] : []),
      ...(['multiSelect', 'onlyRenderVisibleElements', 'snapToObjects', 'autoHistory'] as const).flatMap((key) => d[key] === undefined ? [] : [`${key}: ${d[key]}`]),
      ...(d.edgeInteractionWidth !== undefined ? [`edgeInteractionWidth: ${d.edgeInteractionWidth}`] : []),
      ...(d.connectionRadius !== undefined ? [`connectionRadius: ${d.connectionRadius}`] : []),
      ...(d.defaultEdgeType !== undefined ? [`defaultEdgeType: ${swiftStr(d.defaultEdgeType)}`] : []),
      ...(d.connectionLineType !== undefined ? [`connectionLineType: ${swiftStr(d.connectionLineType)}`] : []),
      ...(d.defaultEdgeOptions !== undefined ? [`defaultEdgeOptions: PyreonFlowDefaultEdgeOptions(${[
        ...(d.defaultEdgeOptions.type !== undefined ? [`type: ${swiftStr(d.defaultEdgeOptions.type)}`] : []),
        ...(d.defaultEdgeOptions.label !== undefined ? [`label: ${swiftStr(d.defaultEdgeOptions.label)}`] : []),
        ...(d.defaultEdgeOptions.animated !== undefined ? [`animated: ${d.defaultEdgeOptions.animated}`] : []),
        ...(d.defaultEdgeOptions.focusable !== undefined ? [`focusable: ${d.defaultEdgeOptions.focusable}`] : []),
        ...(d.defaultEdgeOptions.ariaLabel !== undefined ? [`ariaLabel: ${swiftStr(d.defaultEdgeOptions.ariaLabel)}`] : []),
        ...(d.defaultEdgeOptions.hidden !== undefined ? [`hidden: ${d.defaultEdgeOptions.hidden}`] : []),
        ...(d.defaultEdgeOptions.deletable !== undefined ? [`deletable: ${d.defaultEdgeOptions.deletable}`] : []),
        ...(d.defaultEdgeOptions.reconnectable !== undefined ? [`reconnectable: ${d.defaultEdgeOptions.reconnectable}`] : []),
        ...(d.defaultEdgeOptions.interactionWidth !== undefined ? [`interactionWidth: ${d.defaultEdgeOptions.interactionWidth}`] : []),
        ...(d.defaultEdgeOptions.pathOptions?.curvature !== undefined ? [`curvature: ${d.defaultEdgeOptions.pathOptions.curvature}`] : []),
        ...(d.defaultEdgeOptions.pathOptions?.borderRadius !== undefined ? [`borderRadius: ${d.defaultEdgeOptions.pathOptions.borderRadius}`] : []),
        ...(d.defaultEdgeOptions.pathOptions?.offset !== undefined ? [`pathOffset: ${d.defaultEdgeOptions.pathOptions.offset}`] : []),
        ...(d.defaultEdgeOptions.markerStart !== undefined ? [`markerStart: ${swiftFlowMarker(d.defaultEdgeOptions.markerStart)}`] : []),
        ...(d.defaultEdgeOptions.markerEnd !== undefined ? [`markerEnd: ${d.defaultEdgeOptions.markerEnd === null ? 'nil' : swiftFlowMarker(d.defaultEdgeOptions.markerEnd)}`, 'markerEndSpecified: true'] : []),
      ].join(', ')})`] : []),
      ...(d.fitView !== undefined ? [`fitView: ${d.fitView}`] : []),
      ...(d.fitViewPadding !== undefined ? [`fitViewPadding: ${d.fitViewPadding}`] : []),
      ...(d.historyLimit !== undefined ? [`historyLimit: ${d.historyLimit}`] : []),
      ...(d.connectionRules !== undefined ? [`connectionRules: [${Object.entries(d.connectionRules).map(([key, outputs]) => `${swiftStr(key)}: [${outputs.map((output) => swiftStr(output)).join(', ')}]`).join(', ')}]`] : []),
      ...(d.connectionValidator !== undefined ? [`isValidConnection: ${host.expr(d.connectionValidator, 0)}`] : []),
      ...(rowFields.some((field) => field.name === 'label') ? ['searchText: { $0.label }'] : []),
      ...(d.reducedMotion !== undefined ? [`reducedMotion: ${d.reducedMotion}`] : []),
      ...(d.deleteKeys !== undefined ? [`deleteKeys: ${d.deleteKeys === null ? 'nil' : `[${d.deleteKeys.map((key) => JSON.stringify(key)).join(', ')}]`}`] : []),
      ...(['multiSelectionKey', 'selectionKey', 'zoomActivationKey'] as const).flatMap((key) => d[key] === undefined ? [] : [`${key}: ${d[key] === null ? 'nil' : JSON.stringify(d[key])}`]),
      ...(d.preventScrolling !== undefined ? [`preventScrolling: ${d.preventScrolling}`] : []),
    ]
      // Swift requires labelled arguments in declaration order; sort by the
      // init's own label order (see SWIFT_FLOW_STATE_INIT_LABELS). Stable, and
      // a no-op for configs that were already in order.
      .map((arg, i) => ({ arg, i, rank: swiftFlowInitRank(arg) }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map(({ arg }) => arg)
      .join(', ')
    return `@State private var ${swiftIdent(d.name)} = PyreonFlowState<${rowType}>(nodes: [${nodeLits}], edges: [${edgeLits}]${zoomArgs === '' ? '' : `, ${zoomArgs}`})`
  }
