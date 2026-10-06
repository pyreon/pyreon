/**
 * The Kotlin `flow-state` declaration emitter — moved verbatim from the compiler's
 * `emitKotlinDecl`.
 */
import { type TypeIR, kotlinIdent, kotlinStr } from '@pyreon/native-compiler/plugin-api'
import { host } from './kotlin-facade'
import { kotlinFlowCoord, kotlinFlowData, kotlinFlowMarker, kotlinFlowParsedHandles, ktChartDouble } from './kotlin-literals'
import { flowDataConflictWarning, unifyFlowDataRows } from './lowering'
import { type FlowStateDecl } from './types'

// `@pyreon/flow` — sequential `remember` (no cross-ref wall like Swift's
  // `@State`), so the whole literal node/edge config passes straight into
  // the constructor — no post-decl `bind`/`.onAppear` step needed (mirrors
  // how table's Kotlin twin is simpler than its Swift one, for the same
  // reason: Compose recomposition tracks reads sequentially).
  /** Kotlin for a `createFlow` / `useFlow` declaration: a `remember`ed PyreonFlowState. */
export function kotlinFlowStateDecl(d: FlowStateDecl): string {
    // Same reasoning as the Swift twin: register the row struct via the
    // SHARED `synthLiteralStructName` registry (not `inferType` on a
    // synthetic array, which cannot name an anonymous literal it hasn't
    // seen declared before — see emit-swift.ts's comment on this same
    // decision). Registering FIRST guarantees this name is the SAME one
    // each node's `data = {...}` literal resolves to below.
    const dataRows = d.nodes.flatMap((node) => node.data.kind === 'object' ? [node.data.fields] : [])
    const firstData = d.nodes[0]?.data
    const rowFields = firstData?.kind === 'object' ? firstData.fields : []
    let inferredRowType: TypeIR | undefined
    let rowType = d.dataType !== undefined ? host.typeText(d.dataType) : 'Any'
    // An inline-object generic (`createFlow<{ label: string }>`) must name the
    // SAME data class its `data = { label }` literals resolve to; a
    // context-free `kotlinType` returned `Any`.
    if (d.dataType?.kind === 'object') {
      const named = host.structs.forTypeFields(d.dataType.fields)
      if (named !== null) {
        rowType = named
        inferredRowType = { kind: 'typeRef', name: named, args: [] }
      }
    }
    // Unify by field NAMES and TYPES (see unifyFlowDataRows).
    const { heterogeneous, fields, conflicts } = unifyFlowDataRows(dataRows, (value) => host.inferType(value))
    if (d.dataType === undefined && conflicts.length > 0) {
      host.warn(flowDataConflictWarning(d.name, conflicts, (t) => host.typeText(t)))
    }
    if (d.dataType === undefined && heterogeneous) {
      const name = host.structs.synthesize(fields)
      inferredRowType = { kind: 'typeRef', name, args: [] }
      rowType = name
    } else if (d.dataType === undefined) {
      rowType = host.structs.forLiteralFields(rowFields) ?? 'Any'
    }
    const expectedRowType = inferredRowType ?? d.dataType
    // `PyreonXYPosition`/`PyreonFlowNode.width`/`.height` are Double —
    // Kotlin refuses a bare Int literal there (same reason charts' Pie/Gauge
    // emitters run every numeric arg through `ktChartDouble`).
    const nodeLits = d.nodes
      .map((n) => {
        const parts = [
          `id = ${kotlinStr(n.id)}`,
          ...(n.type !== undefined ? [`type = ${kotlinStr(n.type)}`] : []),
          `position = PyreonXYPosition(${kotlinFlowCoord(n.positionX)}, ${kotlinFlowCoord(n.positionY)})`,
          `data = ${host.exprAs(expectedRowType, n.data, 0)}`,
          ...(n.width !== undefined ? [`width = ${ktChartDouble(host.expr(n.width, 0))}`] : []),
          ...(n.height !== undefined ? [`height = ${ktChartDouble(host.expr(n.height, 0))}`] : []),
          ...(n.draggable !== undefined ? [`draggable = ${n.draggable}`] : []),
          ...(n.selectable !== undefined ? [`selectable = ${n.selectable}`] : []),
          ...(n.connectable !== undefined ? [`connectable = ${n.connectable}`] : []),
          ...(n.focusable !== undefined ? [`focusable = ${n.focusable}`] : []),
          ...(n.ariaLabel !== undefined ? [`ariaLabel = ${kotlinStr(n.ariaLabel)}`] : []),
          ...(n.hidden !== undefined ? [`hidden = ${n.hidden}`] : []),
          ...(n.deletable !== undefined ? [`deletable = ${n.deletable}`] : []),
          ...(n.cssClass !== undefined ? [`className = ${kotlinStr(n.cssClass)}`] : []),
          ...(n.style !== undefined ? [`style = ${kotlinStr(n.style)}`] : []),
          ...(n.parentId !== undefined ? [`parentId = ${kotlinStr(n.parentId)}`] : []),
          ...(n.extent !== undefined ? [`extent = PyreonFlowNodeExtent(${n.extent.map((value) => ktChartDouble(String(value))).join(', ')})`] : []),
          ...(n.extentParent === true ? ['extentParent = true'] : []),
          ...(n.expandParent !== undefined ? [`expandParent = ${n.expandParent}`] : []),
          ...(n.group !== undefined ? [`group = ${n.group}`] : []),
          ...(n.sourceHandles !== undefined ? [`sourceHandles = ${kotlinFlowParsedHandles(n.sourceHandles)}`] : []),
          ...(n.targetHandles !== undefined ? [`targetHandles = ${kotlinFlowParsedHandles(n.targetHandles)}`] : []),
          ...(n.zIndex !== undefined ? [`zIndex = ${ktChartDouble(String(n.zIndex))}`] : []),
        ]
        return `PyreonFlowNode(${parts.join(', ')})`
      })
      .join(', ')
    const edgeLits = d.edges
      .map((e) => {
        const parts = [
          `id = ${kotlinStr(e.id)}`,
          `source = ${kotlinStr(e.source)}`,
          `target = ${kotlinStr(e.target)}`,
          ...(e.sourceHandle !== undefined ? [`sourceHandle = ${kotlinStr(e.sourceHandle)}`] : []),
          ...(e.targetHandle !== undefined ? [`targetHandle = ${kotlinStr(e.targetHandle)}`] : []),
          ...(e.type !== undefined ? [`type = ${kotlinStr(e.type)}`] : []),
          ...(e.label !== undefined ? [`label = ${kotlinStr(e.label)}`] : []),
          ...(e.animated !== undefined ? [`animated = ${e.animated ? 'true' : 'false'}`, 'animatedSpecified = true'] : []),
          ...(e.focusable !== undefined ? [`focusable = ${e.focusable}`] : []),
          ...(e.ariaLabel !== undefined ? [`ariaLabel = ${kotlinStr(e.ariaLabel)}`] : []),
          ...(e.hidden !== undefined ? [`hidden = ${e.hidden}`] : []),
          ...(e.deletable !== undefined ? [`deletable = ${e.deletable}`] : []),
          ...(e.reconnectable !== undefined ? [`reconnectable = ${e.reconnectable}`] : []),
          ...(e.interactionWidth !== undefined ? [`interactionWidth = ${ktChartDouble(String(e.interactionWidth))}`] : []),
          ...(e.zIndex !== undefined ? [`zIndex = ${ktChartDouble(String(e.zIndex))}`] : []),
          ...(e.cssClass !== undefined ? [`className = ${JSON.stringify(e.cssClass)}`] : []),
          ...(e.style !== undefined ? [`style = ${JSON.stringify(e.style)}`] : []),
          ...(e.data !== undefined && kotlinFlowData(e.data) !== null ? [`data = ${kotlinFlowData(e.data)}`] : []),
          ...(e.pathOptions?.curvature !== undefined ? [`curvature = ${ktChartDouble(String(e.pathOptions.curvature))}`] : []),
          ...(e.pathOptions?.borderRadius !== undefined ? [`borderRadius = ${ktChartDouble(String(e.pathOptions.borderRadius))}`] : []),
          ...(e.pathOptions?.offset !== undefined ? [`pathOffset = ${ktChartDouble(String(e.pathOptions.offset))}`] : []),
          ...(e.markerStart !== undefined ? [`markerStart = ${kotlinFlowMarker(e.markerStart)}`] : []),
          ...(e.markerEnd !== undefined ? [`markerEnd = ${e.markerEnd === null ? 'null' : kotlinFlowMarker(e.markerEnd)}`, 'markerEndSpecified = true'] : []),
          ...(e.waypoints !== undefined ? [`waypoints = listOf(${e.waypoints.map((p) => `PyreonXYPosition(${kotlinFlowCoord(p.x)}, ${kotlinFlowCoord(p.y)})`).join(', ')})`] : []),
        ]
        return `PyreonFlowEdge(${parts.join(', ')})`
      })
      .join(', ')
    // Mirror of the Swift twin: appended ONLY when configured, so an
    // unconfigured `createFlow` emits byte-identically to before.
    // Rendered as a Kotlin DOUBLE literal, always. Both params are `Double`,
    // and Kotlin has no implicit Int->Double widening at a call site, so a
    // perfectly ordinary `maxZoom: 2` would emit `maxZoom = 2` and fail with
    // "the integer literal does not conform to the expected type Double".
    // Swift takes the same source fine (its literal inference handles it),
    // which is exactly how this stays hidden until a real Kotlin compile.
    const ktDouble = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`)
    const zoomArgs = [
      ...(d.minZoom !== undefined ? [`minZoom = ${ktDouble(d.minZoom)}`] : []),
      ...(d.maxZoom !== undefined ? [`maxZoom = ${ktDouble(d.maxZoom)}`] : []),
      ...(d.snapToGrid !== undefined ? [`snapToGrid = ${d.snapToGrid}`] : []),
      ...(d.snapGrid !== undefined ? [`snapGrid = ${ktDouble(d.snapGrid)}`] : []),
      ...(d.nodeExtent !== undefined ? [`nodeExtent = PyreonFlowNodeExtent(${d.nodeExtent.map(ktDouble).join(', ')})`] : []),
      ...(d.defaultMarkerEnd !== undefined ? [`defaultMarkerEnd = ${d.defaultMarkerEnd === null ? 'null' : kotlinFlowMarker(d.defaultMarkerEnd)}`] : []),
      ...(['nodesDraggable', 'nodesConnectable', 'nodesSelectable', 'nodesFocusable', 'edgesFocusable', 'disableKeyboardA11y', 'nodesDeletable', 'edgesDeletable', 'edgesReconnectable', 'pannable', 'panOnDrag', 'panOnScroll', 'zoomable', 'zoomOnScroll', 'zoomOnPinch', 'zoomOnDoubleClick', 'selectionOnDrag', 'multiSelect', 'onlyRenderVisibleElements', 'snapToObjects', 'autoHistory', 'reducedMotion', 'preventScrolling', 'elevateNodesOnSelect', 'elevateEdgesOnSelect', 'autoPanOnNodeDrag', 'autoPanOnConnect'] as const).flatMap((key) => d[key] === undefined ? [] : [`${key} = ${d[key]}`]),
      ...(d.autoPanSpeed !== undefined ? [`autoPanSpeed = ${ktDouble(d.autoPanSpeed)}`] : []),
      ...(d.panOnScrollSpeed !== undefined ? [`panOnScrollSpeed = ${ktDouble(d.panOnScrollSpeed)}`] : []),
      ...(d.deleteKeys !== undefined ? [`deleteKeys = ${d.deleteKeys === null ? 'null' : `listOf(${d.deleteKeys.map((key) => kotlinStr(key)).join(', ')})`}`] : []),
      ...(['multiSelectionKey', 'selectionKey', 'zoomActivationKey'] as const).flatMap((key) => d[key] === undefined ? [] : [`${key} = ${d[key] === null ? 'null' : kotlinStr(d[key])}`]),
      ...(d.selectionMode !== undefined ? [`selectionMode = ${kotlinStr(d.selectionMode)}`] : []),
      ...(d.connectionMode !== undefined ? [`connectionMode = ${kotlinStr(d.connectionMode)}`] : []),
      ...(d.edgeInteractionWidth !== undefined ? [`edgeInteractionWidth = ${ktDouble(d.edgeInteractionWidth)}`] : []),
      ...(d.connectionRadius !== undefined ? [`connectionRadius = ${ktDouble(d.connectionRadius)}`] : []),
      ...(d.defaultEdgeType !== undefined ? [`defaultEdgeType = ${kotlinStr(d.defaultEdgeType)}`] : []),
      ...(d.connectionLineType !== undefined ? [`connectionLineType = ${kotlinStr(d.connectionLineType)}`] : []),
      ...(d.defaultEdgeOptions !== undefined ? [`defaultEdgeOptions = PyreonFlowDefaultEdgeOptions(${[
        ...(d.defaultEdgeOptions.type !== undefined ? [`type = ${kotlinStr(d.defaultEdgeOptions.type)}`] : []),
        ...(d.defaultEdgeOptions.label !== undefined ? [`label = ${kotlinStr(d.defaultEdgeOptions.label)}`] : []),
        ...(d.defaultEdgeOptions.animated !== undefined ? [`animated = ${d.defaultEdgeOptions.animated}`] : []),
        ...(d.defaultEdgeOptions.focusable !== undefined ? [`focusable = ${d.defaultEdgeOptions.focusable}`] : []),
        ...(d.defaultEdgeOptions.ariaLabel !== undefined ? [`ariaLabel = ${kotlinStr(d.defaultEdgeOptions.ariaLabel)}`] : []),
        ...(d.defaultEdgeOptions.hidden !== undefined ? [`hidden = ${d.defaultEdgeOptions.hidden}`] : []),
        ...(d.defaultEdgeOptions.deletable !== undefined ? [`deletable = ${d.defaultEdgeOptions.deletable}`] : []),
        ...(d.defaultEdgeOptions.reconnectable !== undefined ? [`reconnectable = ${d.defaultEdgeOptions.reconnectable}`] : []),
        ...(d.defaultEdgeOptions.interactionWidth !== undefined ? [`interactionWidth = ${ktDouble(d.defaultEdgeOptions.interactionWidth)}`] : []),
        ...(d.defaultEdgeOptions.pathOptions?.curvature !== undefined ? [`curvature = ${ktDouble(d.defaultEdgeOptions.pathOptions.curvature)}`] : []),
        ...(d.defaultEdgeOptions.pathOptions?.borderRadius !== undefined ? [`borderRadius = ${ktDouble(d.defaultEdgeOptions.pathOptions.borderRadius)}`] : []),
        ...(d.defaultEdgeOptions.pathOptions?.offset !== undefined ? [`pathOffset = ${ktDouble(d.defaultEdgeOptions.pathOptions.offset)}`] : []),
        ...(d.defaultEdgeOptions.markerStart !== undefined ? [`markerStart = ${kotlinFlowMarker(d.defaultEdgeOptions.markerStart)}`] : []),
        ...(d.defaultEdgeOptions.markerEnd !== undefined ? [`markerEnd = ${d.defaultEdgeOptions.markerEnd === null ? 'null' : kotlinFlowMarker(d.defaultEdgeOptions.markerEnd)}`, 'markerEndSpecified = true'] : []),
      ].join(', ')})`] : []),
      ...(d.fitView !== undefined ? [`fitViewOnLoad = ${d.fitView}`] : []),
      ...(d.fitViewPadding !== undefined ? [`fitViewPadding = ${ktDouble(d.fitViewPadding)}`] : []),
      ...(d.historyLimit !== undefined ? [`historyLimit = ${ktDouble(d.historyLimit)}`] : []),
      ...(d.connectionRules !== undefined ? [`connectionRules = mapOf(${Object.entries(d.connectionRules).map(([key, outputs]) => `${kotlinStr(key)} to listOf(${outputs.map((output) => kotlinStr(output)).join(', ')})`).join(', ')})`] : []),
      ...(d.connectionValidator !== undefined ? [`connectionValidator = ${host.expr(d.connectionValidator, 0)}`] : []),
      ...(rowFields.some((field) => field.name === 'label') ? ['searchText = { it.label }'] : []),
    ].join(', ')
    return `val ${kotlinIdent(d.name)} = remember { PyreonFlowState<${rowType}>(nodes = listOf(${nodeLits}), edges = listOf(${edgeLits})${zoomArgs === '' ? '' : `, ${zoomArgs}`}) }`
  }
