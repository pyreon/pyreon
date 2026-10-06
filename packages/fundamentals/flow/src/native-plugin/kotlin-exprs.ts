/**
 * Kotlin lowering for expressions the flow plugin owns: the helper functions
 * (`getBezierPath`, `computeLayout`, …), calls and member reads rooted at a flow binding,
 * and `MarkerType.*`. Moved verbatim from the compiler's Kotlin expression emitter.
 */
import { type CallExprIR, type ExprIR, type MemberExprIR, kotlinIdent, substituteIdentifier } from '@pyreon/native-compiler/plugin-api'
import { host } from './kotlin-facade'
import { FLOW_PATH_HELPERS_KOTLIN, FLOW_SET_CENTER_KEYS, kotlinFlowConnectionLiteral, kotlinFlowData, kotlinFlowDurationOption, kotlinFlowEdgeListLiteral, kotlinFlowEdgeLiteral, kotlinFlowExtentLiteral, kotlinFlowGeometryLiteral, kotlinFlowHandlesLiteral, kotlinFlowLayoutOptions, kotlinFlowMarkerLiteral, kotlinFlowNodeExtentArgs, kotlinFlowNodeListLiteral, kotlinFlowNodeLiteral, kotlinFlowPathHelper, kotlinFlowPositionExpr, kotlinFlowPositionLiteral, kotlinFlowPositionsLiteral, kotlinFlowReconnectLiteral, kotlinFlowViewportLiteral, ktChartDouble, resolveKotlinStaticFlowValue, warnDroppedFlowFieldsKt } from './kotlin-literals'
import { FLOW_LAYOUT_OPTION_KEYS, FLOW_MARKER_LITERAL_SHAPE, HANDLED_FLOW_EDGE_FIELDS, HANDLED_FLOW_NODE_FIELDS, LOWERED_FLOW_CONFIG_PROPERTIES, LOWERED_FLOW_METHODS, LOWERED_FLOW_PROPERTY_READS, droppedFlowEdgePatchWarning, flowLayoutOptionsDroppedWarning, flowRectLiteralFields, flowSignalWriteWarning, unloweredFlowLiteralWarning, unloweredFlowMemberWarning, unsupportedFlowOptionsWarning } from './lowering'

const KOTLIN_FUNCTION_ARMS: Record<string, (e: CallExprIR, indent: number) => string | undefined> = {}
const defineKotlinFunction = (names: readonly string[], arm: (e: CallExprIR, indent: number) => string | undefined): void => {
  for (const name of names) KOTLIN_FUNCTION_ARMS[name] = arm
}

defineKotlinFunction(["computeLayout"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'computeLayout' && e.args.length >= 2 && e.args.length <= 4) {
            const options = kotlinFlowLayoutOptions(e.args[3], indent)
            if (options !== null) {
              const args = [
                host.expr(e.args[0]!, indent),
                host.expr(e.args[1]!, indent),
                ...(e.args[2] ? [`algorithm = ${host.expr(e.args[2]!, indent)}`] : []),
                ...(options ? [`options = ${options}`] : []),
              ]
              return `pyreonComputeFlowLayout(${args.join(', ')})`
            }
            host.warn('computeLayout options must be an object literal using direction/nodeSpacing/layerSpacing/animate/animationDuration to lower natively.')
          }
    return undefined
  })

defineKotlinFunction(["getBezierPath","getSmoothStepPath","getStepPath","getStraightPath","getWaypointPath"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && FLOW_PATH_HELPERS_KOTLIN.has(e.callee.name) && e.args.length === 1) {
            const lowered = kotlinFlowPathHelper(e.callee.name, e.args[0], indent)
            if (lowered !== null) return lowered
            host.warn(`${e.callee.name} requires one supported object-literal parameter to lower natively.`)
          }
    return undefined
  })

defineKotlinFunction(["resolveMarker"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'resolveMarker' && e.args.length === 1) {
            const marker = kotlinFlowMarkerLiteral(e.args[0]!) ?? host.expr(e.args[0]!, indent)
            return `pyreonResolveFlowMarker(${marker})`
          }
    return undefined
  })

defineKotlinFunction(["markerId"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'markerId' && e.args.length === 1) {
            const marker = kotlinFlowMarkerLiteral(e.args[0]!) ?? host.expr(e.args[0]!, indent)
            return `pyreonFlowMarkerId(${marker})`
          }
    return undefined
  })

defineKotlinFunction(["resolveEdgeMarkers"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'resolveEdgeMarkers' && e.args.length === 2) {
            const marker = kotlinFlowMarkerLiteral(e.args[1]!) ?? host.expr(e.args[1]!, indent)
            return `pyreonResolveFlowEdgeMarkers(${host.expr(e.args[0]!, indent)}, ${marker})`
          }
    return undefined
  })

defineKotlinFunction(["collectEdgeMarkers"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'collectEdgeMarkers' && e.args.length === 2) {
            const marker = kotlinFlowMarkerLiteral(e.args[1]!) ?? host.expr(e.args[1]!, indent)
            return `pyreonCollectFlowEdgeMarkers(${host.expr(e.args[0]!, indent)}, ${marker})`
          }
    return undefined
  })

defineKotlinFunction(["getHandlePosition"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getHandlePosition' && e.args.length === 5) {
            const position = kotlinFlowPositionExpr(e.args[0]!)
            if (position !== null) return `pyreonHandlePosition(${position}, ${e.args.slice(1).map((arg) => ktChartDouble(host.expr(arg, indent))).join(', ')})`
            host.warn('getHandlePosition requires a literal Position value to lower natively.')
          }
    return undefined
  })

defineKotlinFunction(["getEdgePath"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getEdgePath' && (e.args.length === 7 || e.args.length === 8)) {
            const sourcePosition = kotlinFlowPositionExpr(e.args[3]!)
            const targetPosition = kotlinFlowPositionExpr(e.args[6]!)
            const options = e.args[7]
            const allowed = new Set(['borderRadius', 'offset', 'curvature'])
            if (sourcePosition !== null && targetPosition !== null && (options === undefined || (options.kind === 'object' && (options.spreads?.length ?? 0) === 0 && options.fields.every((field) => allowed.has(field.name))))) {
              const extras = options?.kind === 'object' ? options.fields.map((field) => `${field.name} = ${ktChartDouble(host.expr(field.value, indent))}`) : []
              return `pyreonEdgePath(${host.expr(e.args[0]!, indent)}, ${ktChartDouble(host.expr(e.args[1]!, indent))}, ${ktChartDouble(host.expr(e.args[2]!, indent))}, ${sourcePosition}, ${ktChartDouble(host.expr(e.args[4]!, indent))}, ${ktChartDouble(host.expr(e.args[5]!, indent))}, ${targetPosition}${extras.length ? `, ${extras.join(', ')}` : ''})`
            }
            host.warn('getEdgePath requires literal Position values and a supported object-literal options parameter to lower natively.')
          }
    return undefined
  })

defineKotlinFunction(["getNodeIntersection"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getNodeIntersection' && e.args.length === 2) {
            const box = kotlinFlowGeometryLiteral(e.args[0]!, ['x', 'y', 'width', 'height'], 'PyreonFlowNodeBox', indent)
            const toward = kotlinFlowGeometryLiteral(e.args[1]!, ['x', 'y'], 'PyreonFlowPathPoint', indent)
            if (box !== null && toward !== null) return `pyreonNodeIntersection(${box}, ${toward})`
            host.warn('getNodeIntersection requires literal { x, y, width, height } and { x, y } parameters to lower natively.')
          }
    return undefined
  })

defineKotlinFunction(["getEffectiveDimensions"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getEffectiveDimensions' && (e.args.length === 1 || e.args.length === 2)) {
            if (e.args[0]!.kind !== 'object' && (e.args[1] === undefined || e.args[1]!.kind !== 'object')) {
              return `pyreonEffectiveDimensions(${host.expr(e.args[0]!, indent)}${e.args[1] ? `, ${host.expr(e.args[1], indent)}` : ''})`
            }
            host.warn('getEffectiveDimensions requires native Flow node/measurement expressions rather than anonymous object literals.')
          }
    return undefined
  })

defineKotlinFunction(["getFloatingEndpoints"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getFloatingEndpoints' && e.args.length === 3) {
            const dimensions = kotlinFlowGeometryLiteral(e.args[2]!, ['sourceW', 'sourceH', 'targetW', 'targetH'], 'PyreonFlowNodeBoxDimensions', indent)
            if (e.args[0]!.kind !== 'object' && e.args[1]!.kind !== 'object' && dimensions !== null) {
              return `pyreonGetFloatingEndpoints(${host.expr(e.args[0]!, indent)}, ${host.expr(e.args[1]!, indent)}, ${dimensions})`
            }
            host.warn('getFloatingEndpoints requires native Flow node expressions and a literal { sourceW, sourceH, targetW, targetH } dimensions object.')
          }
    return undefined
  })

defineKotlinFunction(["getSmartHandlePositions"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getSmartHandlePositions' && (e.args.length === 2 || e.args.length === 3)) {
            const dimensions = e.args[2] === undefined ? undefined : kotlinFlowGeometryLiteral(e.args[2], ['sourceW', 'sourceH', 'targetW', 'targetH'], 'PyreonFlowNodeBoxDimensions', indent)
            if (e.args[0]!.kind !== 'object' && e.args[1]!.kind !== 'object' && dimensions !== null) {
              return `pyreonGetSmartHandlePositions(${host.expr(e.args[0]!, indent)}, ${host.expr(e.args[1]!, indent)}${dimensions ? `, ${dimensions}` : ''})`
            }
            host.warn('getSmartHandlePositions requires native Flow node expressions and, when provided, a literal { sourceW, sourceH, targetW, targetH } dimensions object.')
          }
    return undefined
  })

defineKotlinFunction(["resolveHandleAnchor"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'resolveHandleAnchor' && (e.args.length === 4 || e.args.length === 5)) {
            if (e.args[0]!.kind !== 'object' && e.args[3]!.kind !== 'object' && (e.args[4] === undefined || e.args[4]!.kind !== 'object')) {
              return `pyreonResolveHandleAnchor(${e.args.map((arg) => host.expr(arg, indent)).join(', ')})`
            }
            host.warn('resolveHandleAnchor requires native Flow node, dimensions, and measurement expressions rather than anonymous object literals.')
          }
    return undefined
  })

/** Lower a plain `name(args)` call to the flow runtime helper it maps to, or `undefined` to decline. */
export function lowerKotlinFlowFunction(name: string, args: readonly ExprIR[], indent: number): string | undefined {
  const arm = KOTLIN_FUNCTION_ARMS[name]
  if (arm === undefined) return undefined
  return arm({ kind: 'call', callee: { kind: 'identifier', name }, args: [...args] }, indent)
}

/** A call rooted at a flow binding (`flow.addNode({…})`, `flow.nodes.set(x)`, `flow.nodeMap().get(id)`). */
export function lowerKotlinFlowCall(e: CallExprIR, indent: number): string | undefined {
// PyreonFlowState struct-literal ARGUMENTS — see swiftFlowNodeLiteral's
      // docblock (emit-swift.ts) for why this rewrite exists: Kotlin's type
      // system is nominal too, so a bare object literal would synthesize an
      // unrelated data class instead of satisfying the declared parameter
      // type. Must run BEFORE the property-read block below, mirroring
      // emit-swift.ts's ordering.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        host.isFlowState(e.callee.object.name)
      ) {
        const flowName = e.callee.object.name
        const member = e.callee.property
        const flowPatchArg = e.args[1] === undefined ? undefined : resolveKotlinStaticFlowValue(e.args[1])
        const flowPatchBody = flowPatchArg?.kind === 'arrow' && flowPatchArg.body.kind === 'paren' ? flowPatchArg.body.inner : flowPatchArg?.kind === 'arrow' ? flowPatchArg.body : undefined
        const flowPatchCallback = member === 'updateNodeData' && flowPatchArg?.kind === 'arrow' && flowPatchArg.params.length === 1 && flowPatchBody?.kind === 'object' && (flowPatchBody.spreads?.length ?? 0) === 0
        if (['updateNode', 'updateNodeData', 'updateEdge'].includes(member) && e.args.length === 2 && !flowPatchCallback && (flowPatchArg?.kind !== 'object' || (flowPatchArg.spreads?.length ?? 0) > 0)) {
          host.warn(`createFlow binding \`${flowName}\`: \`${member}\` currently lowers only a literal patch object without spreads on native targets; this call is emitted as written and may fail the native build.`)
        }
        if (e.args.length === 0 && member === 'getNodes') return `${kotlinIdent(flowName)}.nodes`
        if (e.args.length === 0 && member === 'getEdges') return `${kotlinIdent(flowName)}.edges`
        if (e.args.length === 0 && member === 'getViewport') return `${kotlinIdent(flowName)}.viewport`
        if (member === '_clearNodeMeasurement' && e.args.length === 1) return `${kotlinIdent(flowName)}.clearNodeMeasurement(${host.expr(e.args[0]!, indent)})`
        if (member === '_setNodeMeasurement' && (e.args.length === 3 || e.args.length === 4)) {
          const baseArgs = `${host.expr(e.args[0]!, indent)}, ${ktChartDouble(host.expr(e.args[1]!, indent))}, ${ktChartDouble(host.expr(e.args[2]!, indent))}`
          if (e.args.length === 3) return `${kotlinIdent(flowName)}.updateNodeMeasurement(${baseArgs})`
          const handles = e.args[3]!
          if (handles.kind === 'array') {
            const emitted = handles.elements.map((item) => {
              if (item.kind !== 'object') return null
              const fields = new Map(item.fields.map((field) => [field.name, field.value]))
              const position = fields.get('position')
              if (!fields.has('id') || !fields.has('type') || !fields.has('x') || !fields.has('y') || position?.kind !== 'literal' || typeof position.value !== 'string') return null
              const nativePosition = position.value[0]!.toUpperCase() + position.value.slice(1)
              return `PyreonFlowMeasuredHandle(id = ${host.expr(fields.get('id')!, indent)}, type = ${host.expr(fields.get('type')!, indent)}, position = PyreonFlowPosition.${nativePosition}, x = ${ktChartDouble(host.expr(fields.get('x')!, indent))}, y = ${ktChartDouble(host.expr(fields.get('y')!, indent))})`
            })
            if (emitted.every((value) => value !== null)) return `${kotlinIdent(flowName)}.updateNodeMeasurement(${baseArgs}, listOf(${emitted.join(', ')}))`
          }
          host.warn(`createFlow binding \`${flowName}\`: \`_setNodeMeasurement\` handle geometry must be a literal array to lower natively.`)
        }
        // Nothing silent inside the boundary — mirrors emit-swift.ts exactly.
        if (!LOWERED_FLOW_METHODS.has(member) && !LOWERED_FLOW_PROPERTY_READS.has(member)) {
          host.warn(unloweredFlowMemberWarning(flowName, member))
        }
        if (member === 'paste' && e.args.length === 1) {
          const lit = kotlinFlowPositionLiteral(resolveKotlinStaticFlowValue(e.args[0]!))
          if (lit !== null) return `${kotlinIdent(flowName)}.paste(${lit})`
          if (resolveKotlinStaticFlowValue(e.args[0]!).kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 1`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        if (member === 'addNode' && e.args.length === 1) {
          const lit = kotlinFlowNodeLiteral(resolveKotlinStaticFlowValue(e.args[0]!), flowName)
          if (lit !== null) return `${kotlinIdent(flowName)}.addNode(${lit})`
        }
        if (member === 'addEdge' && e.args.length === 1) {
          const lit = kotlinFlowEdgeLiteral(resolveKotlinStaticFlowValue(e.args[0]!), flowName)
          if (lit !== null) return `${kotlinIdent(flowName)}.addEdge(${lit})`
        }
        if (e.callee.property === 'updateNodePosition' && e.args.length === 2) {
          const lit = kotlinFlowPositionLiteral(resolveKotlinStaticFlowValue(e.args[1]!))
          if (lit !== null) {
            return `${kotlinIdent(e.callee.object.name)}.updateNodePosition(${host.expr(e.args[0]!, indent)}, ${lit})`
          }
          if (resolveKotlinStaticFlowValue(e.args[1]!).kind === 'object') host.warn(unloweredFlowLiteralWarning(e.callee.object.name, '`updateNodePosition(...)` argument 2', 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        if (member === 'updateNodeData' && e.args.length === 2 && flowPatchArg?.kind === 'object') {
          const patch = flowPatchArg
          if (!patch.spreads || patch.spreads.length === 0) {
            const assignments = patch.fields.map(({ name, value }) => `${kotlinIdent(name)} = ${host.expr(value, indent)}`).join(', ')
            return `${kotlinIdent(flowName)}.updateNodeData(${host.expr(e.args[0]!, indent)}) { data -> data.copy(${assignments}) }`
          }
        }
        if (member === 'updateNodeData' && e.args.length === 2 && flowPatchCallback && flowPatchArg?.kind === 'arrow' && flowPatchBody?.kind === 'object') {
          const callback = flowPatchArg
          const assignments = flowPatchBody.fields.map(({ name, value }) => {
            const resolved = substituteIdentifier(value, callback.params[0]!, { kind: 'identifier', name: 'node' }) ?? value
            return `${kotlinIdent(name)} = ${host.expr(resolved, indent)}`
          }).join(', ')
          return `${kotlinIdent(flowName)}.updateNodeDataFromNode(${host.expr(e.args[0]!, indent)}) { node -> node.data.copy(${assignments}) }`
        }
        if (member === 'updateNode' && e.args.length === 2 && flowPatchArg?.kind === 'object') {
          const patch = flowPatchArg
          if (!patch.spreads || patch.spreads.length === 0) {
            warnDroppedFlowFieldsKt(`createFlow binding \`${flowName}\` updateNode(...)`, 'node', patch)
            const fields = patch.fields.flatMap(({ name, value }) => {
              if (name === 'id') { host.warn(`createFlow binding \`${flowName}\` updateNode(...): changing a node id is not supported natively; the original id is preserved.`); return [] }
              // A literal lowers to the native constructor; a NON-literal value
              // passes through as written (the addNode rule). Only a literal of
              // the right kind but the wrong shape is dropped — and named.
              if (name === 'position') {
                const position = kotlinFlowPositionLiteral(value)
                if (position) return [`position = ${position}`]
                if (value.kind === 'object') { host.warn(unloweredFlowLiteralWarning(flowName, 'updateNode(...) field `position`', 'a `{ x, y }` literal with both coordinates')); return [] }
                return [`position = ${host.expr(value, indent)}`]
              }
              if (name === 'data' && value.kind === 'object') return [`data = node.data.copy(${value.fields.map((field) => `${kotlinIdent(field.name)} = ${host.expr(field.value, indent)}`).join(', ')})`]
              if (name === 'sourceHandles' || name === 'targetHandles') {
                const handles = kotlinFlowHandlesLiteral(value)
                if (handles) return [`${name} = ${handles}`]
                if (value.kind === 'array') { host.warn(unloweredFlowLiteralWarning(flowName, `updateNode(...) field \`${name}\``, "an array of `{ type, position }` literals (a string `type`, a literal side, an optional string `id`)")); return [] }
                return [`${name} = ${host.expr(value, indent)}`]
              }
              if (name === 'extent') {
                const extent = kotlinFlowNodeExtentArgs(value)
                if (!extent) host.warn(`createFlow binding \`${flowName}\` updateNode(...): node field \`extent\` must be \`'parent'\` or a static [[minX, minY], [maxX, maxY]] tuple on native targets.`)
                return extent ? extent.map((part) => part === 'extentParent = true' ? 'extent = null, extentParent = true' : `${part}, extentParent = false`) : []
              }
              if (name === 'class') return [`className = ${host.expr(value, indent)}`]
              const rendered = ['width', 'height', 'zIndex'].includes(name) ? ktChartDouble(host.expr(value, indent)) : host.expr(value, indent)
              return HANDLED_FLOW_NODE_FIELDS.has(name) ? [`${kotlinIdent(name)} = ${rendered}`] : []
            })
            return `${kotlinIdent(flowName)}.updateNode(${host.expr(e.args[0]!, indent)}) { node -> node.copy(${fields.join(', ')}) }`
          }
        }
        if (member === 'updateEdge' && e.args.length === 2 && flowPatchArg?.kind === 'object') {
          const patch = flowPatchArg
          if (!patch.spreads || patch.spreads.length === 0) {
            warnDroppedFlowFieldsKt(`createFlow binding \`${flowName}\` updateEdge(...)`, 'edge', patch)
            const fields = patch.fields.flatMap(({ name, value }) => {
              if (name === 'id') { host.warn(`createFlow binding \`${flowName}\` updateEdge(...): changing an edge id is not supported natively; the original id is preserved.`); return [] }
              if (name === 'pathOptions') {
                if (value.kind !== 'object' || (value.spreads?.length ?? 0) > 0) { host.warn(droppedFlowEdgePatchWarning(flowName, 'pathOptions', 'an inline object literal')); return [] }
                const unknown = value.fields.filter((field) => !['curvature', 'borderRadius', 'offset'].includes(field.name)).map((field) => field.name)
                if (unknown.length > 0) host.warn(droppedFlowEdgePatchWarning(flowName, `pathOptions.${unknown.join('/')}`, 'one of `curvature`, `borderRadius`, `offset`'))
                return value.fields.flatMap((field) => ['curvature', 'borderRadius', 'offset'].includes(field.name) ? [`${field.name === 'offset' ? 'pathOffset' : field.name} = ${ktChartDouble(host.expr(field.value, indent))}`] : [])
              }
              if (name === 'markerStart' || name === 'markerEnd') { const marker = kotlinFlowMarkerLiteral(value); return marker ? [`${name} = ${marker}`, ...(name === 'markerEnd' ? ['markerEndSpecified = true'] : [])] : (host.warn(droppedFlowEdgePatchWarning(flowName, name, FLOW_MARKER_LITERAL_SHAPE)), []) }
              if (name === 'animated') return [`animated = ${host.expr(value, indent)}`, 'animatedSpecified = true']
              if (name === 'waypoints') {
                const points = kotlinFlowPositionsLiteral(value)
                if (points) return [`waypoints = ${points}`]
                if (value.kind === 'array') { host.warn(unloweredFlowLiteralWarning(flowName, 'updateEdge(...) field `waypoints`', 'an array of `{ x, y }` literals, each with both coordinates')); return [] }
                return [`waypoints = ${host.expr(value, indent)}`]
              }
              if (name === 'data') { const data = kotlinFlowData(value); if (!data) host.warn(`createFlow binding \`${flowName}\` updateEdge(...): edge \`data\` must be a static JSON-compatible object to lower natively.`); return data ? [`data = ${data}`] : [] }
              if (name === 'class') return [`className = ${host.expr(value, indent)}`]
              const rendered = name === 'interactionWidth' || name === 'zIndex' ? ktChartDouble(host.expr(value, indent)) : host.expr(value, indent)
              return HANDLED_FLOW_EDGE_FIELDS.has(name) ? [`${kotlinIdent(name)} = ${rendered}`] : []
            })
            return `${kotlinIdent(flowName)}.updateEdge(${host.expr(e.args[0]!, indent)}) { edge -> edge.copy(${fields.join(', ')}) }`
          }
        }
        // React Flow's intersection helpers: a rect literal becomes the engine's
        // PyreonFlowRect (Double components), `partially` is passed by name.
        if ((member === 'getIntersectingNodes' && e.args.length >= 1) || (member === 'isNodeIntersecting' && e.args.length >= 2)) {
          const target = (arg: ExprIR) => {
            const rect = flowRectLiteralFields(arg)
            if (!rect) return host.expr(arg, indent)
            return `PyreonFlowRect(${rect.map((v) => (v.kind === 'literal' && typeof v.value === 'number' ? ktChartDouble(String(v.value)) : `(${host.expr(v, indent)}).toDouble()`)).join(', ')})`
          }
          const rest = member === 'isNodeIntersecting' ? [target(e.args[0]!), target(e.args[1]!)] : [target(e.args[0]!)]
          const flag = e.args[member === 'isNodeIntersecting' ? 2 : 1]
          return `${kotlinIdent(flowName)}.${member}(${rest.join(', ')}${flag ? `, partially = ${host.expr(flag, indent)}` : ''})`
        }
        if (['panTo', 'screenToFlowPosition', 'flowToScreenPosition'].includes(member) && e.args.length === 1) {
          const lit = kotlinFlowPositionLiteral(e.args[0]!)
          if (lit !== null) return `${kotlinIdent(flowName)}.${member}(${lit})`
          if (e.args[0]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 1`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        if (member === 'zoomTo' && e.args.length >= 1) {
          const duration = kotlinFlowDurationOption(e.args[1])
          if (duration !== null) return `${kotlinIdent(flowName)}.zoomTo(${ktChartDouble(host.expr(e.args[0]!, indent))}${duration ? `, duration = ${duration}` : ''})`
          host.warn(unsupportedFlowOptionsWarning(flowName, 'zoomTo', ['duration'], e.args[1]!))
        }
        if ((member === 'zoomIn' || member === 'zoomOut') && e.args.length <= 1) {
          const duration = kotlinFlowDurationOption(e.args[0])
          if (duration !== null) return `${kotlinIdent(flowName)}.${member}(${duration ? `duration = ${duration}` : ''})`
          host.warn(unsupportedFlowOptionsWarning(flowName, member, ['duration'], e.args[0]!))
        }
        if (member === 'moveSelectedNodes' && e.args.length === 2) {
          return `${kotlinIdent(flowName)}.moveSelectedNodes(${ktChartDouble(host.expr(e.args[0]!, indent))}, ${ktChartDouble(host.expr(e.args[1]!, indent))})`
        }
        if (member === 'focusNode' && e.args.length === 2) {
          return `${kotlinIdent(flowName)}.focusNode(${host.expr(e.args[0]!, indent)}, ${ktChartDouble(host.expr(e.args[1]!, indent))})`
        }
        if ((member === 'getProximityConnection' || member === 'resolveCollisions') && e.args.length === 2) {
          return `${kotlinIdent(flowName)}.${member}(${host.expr(e.args[0]!, indent)}, ${ktChartDouble(host.expr(e.args[1]!, indent))})`
        }
        if (member === 'addEdgeWaypoint' && e.args.length >= 2) {
          const point = kotlinFlowPositionLiteral(e.args[1]!)
          if (point !== null) return `${kotlinIdent(flowName)}.addEdgeWaypoint(${host.expr(e.args[0]!, indent)}, ${point}${e.args.length === 3 ? `, ${host.intArg(e.args[2]!, indent)}` : ''})`
          if (e.args[1]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 2`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        // The waypoint index is a Kotlin `Int` API position (a TS integer is Long).
        if (member === 'removeEdgeWaypoint' && e.args.length === 2) {
          return `${kotlinIdent(flowName)}.removeEdgeWaypoint(${host.expr(e.args[0]!, indent)}, ${host.intArg(e.args[1]!, indent)})`
        }
        if (member === 'updateEdgeWaypoint' && e.args.length === 3) {
          const point = kotlinFlowPositionLiteral(e.args[2]!)
          if (point !== null) return `${kotlinIdent(flowName)}.updateEdgeWaypoint(${host.expr(e.args[0]!, indent)}, ${host.intArg(e.args[1]!, indent)}, ${point})`
          if (e.args[2]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 3`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        if (member === 'reconnectEdge' && e.args.length === 2) {
          const args = kotlinFlowReconnectLiteral(e.args[1]!)
          if (args !== null) return `${kotlinIdent(flowName)}.reconnectEdge(${host.expr(e.args[0]!, indent)}${args})`
          host.warn(unsupportedFlowOptionsWarning(flowName, 'reconnectEdge', ['source', 'target', 'sourceHandle', 'targetHandle'], e.args[1]!))
        }
        if (member === 'isValidConnection' && e.args.length === 1) {
          const connection = kotlinFlowConnectionLiteral(e.args[0]!)
          if (connection !== null) return `${kotlinIdent(flowName)}.isValidConnection(${connection})`
          if (e.args[0]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 1`, 'a `{ source, target }` literal (with optional `sourceHandle` / `targetHandle`)', 'emitted'))
        }
        if ((member === 'addNodes' || member === 'setNodes') && e.args.length === 1) {
          const nodes = kotlinFlowNodeListLiteral(resolveKotlinStaticFlowValue(e.args[0]!), flowName)
          if (nodes !== null) return `${kotlinIdent(flowName)}.${member}(${nodes})`
        }
        if ((member === 'addEdges' || member === 'setEdges') && e.args.length === 1) {
          const edges = kotlinFlowEdgeListLiteral(resolveKotlinStaticFlowValue(e.args[0]!), flowName)
          if (edges !== null) return `${kotlinIdent(flowName)}.${member}(${edges})`
        }
        if (member === 'setViewport' && e.args.length >= 1) {
          const args = kotlinFlowViewportLiteral(resolveKotlinStaticFlowValue(e.args[0]!))
          const duration = kotlinFlowDurationOption(e.args[1])
          if (args !== null && duration !== null) return `${kotlinIdent(flowName)}.setViewport(${args}${duration ? `${args ? ', ' : ''}duration = ${duration}` : ''})`
          if (args === null) host.warn(unsupportedFlowOptionsWarning(flowName, 'setViewport', ['x', 'y', 'zoom', 'duration'], resolveKotlinStaticFlowValue(e.args[0]!)))
          if (duration === null) host.warn(unsupportedFlowOptionsWarning(flowName, 'setViewport', ['duration'], e.args[1]!))
        }
        if (member === 'animateViewport' && e.args.length >= 1) {
          const args = kotlinFlowViewportLiteral(e.args[0]!)
          if (args !== null) return `${kotlinIdent(flowName)}.animateViewport(${args}${e.args[1] ? `, duration = ${ktChartDouble(host.expr(e.args[1]!, indent))}` : ''})`
          host.warn(unsupportedFlowOptionsWarning(flowName, 'animateViewport', ['x', 'y', 'zoom'], e.args[0]!))
        }
        if (member === 'fitView' && e.args.length >= 1 && e.args.length <= 3) {
          const duration = kotlinFlowDurationOption(e.args[2])
          if (duration !== null) return `${kotlinIdent(flowName)}.fitView(${host.expr(e.args[0]!, indent)}${e.args[1] ? `, padding = ${ktChartDouble(host.expr(e.args[1]!, indent))}` : ''}${duration ? `, duration = ${duration}` : ''})`
          host.warn(unsupportedFlowOptionsWarning(flowName, 'fitView', ['duration'], e.args[2]!))
        }
        if (member === 'layout') {
          if (e.args.length === 0) return `${kotlinIdent(flowName)}.layout()`
          const algorithm = host.expr(e.args[0]!, indent)
          if (e.args.length === 1) return `${kotlinIdent(flowName)}.layout(${algorithm})`
          const options = e.args[1]!
          if (options.kind === 'object' && (!options.spreads || options.spreads.length === 0)) {
            const dropped: string[] = []
            const fields = options.fields.flatMap(({ name, value }) => {
              if (name === 'direction' || name === 'animate') return [`${name} = ${host.expr(value, indent)}`]
              if (name === 'nodeSpacing' || name === 'layerSpacing' || name === 'animationDuration') return [`${name} = ${ktChartDouble(host.expr(value, indent))}`]
              dropped.push(name)
              return []
            })
            if (dropped.length > 0) host.warn(flowLayoutOptionsDroppedWarning(flowName, dropped))
            return `${kotlinIdent(flowName)}.layout(${algorithm}, PyreonFlowLayoutOptions(${fields.join(', ')}))`
          }
          host.warn(unsupportedFlowOptionsWarning(flowName, 'layout', FLOW_LAYOUT_OPTION_KEYS, options))
        }
        if (member === 'setCenter' && e.args.length >= 2) {
          const options = e.args[2] ? kotlinFlowViewportLiteral(e.args[2]!, FLOW_SET_CENTER_KEYS) : ''
          if (options !== null) return `${kotlinIdent(flowName)}.setCenter(${ktChartDouble(host.expr(e.args[0]!, indent))}, ${ktChartDouble(host.expr(e.args[1]!, indent))}${options ? `, ${options}` : ''})`
          host.warn(unsupportedFlowOptionsWarning(flowName, 'setCenter', FLOW_SET_CENTER_KEYS, e.args[2]!))
        }
        if (member === 'setNodeExtent' && e.args.length === 1) {
          const value = e.args[0]!
          if ((value.kind === 'literal' && value.value === null) || (value.kind as string) === 'null' || (value.kind === 'identifier' && value.name === 'undefined')) return `${kotlinIdent(flowName)}.clearNodeExtent()`
          const extent = kotlinFlowExtentLiteral(value)
          if (extent !== null) return `${kotlinIdent(flowName)}.setNodeExtent(${extent})`
        }
        if (member === 'clampToExtent' && e.args.length >= 1) {
          const position = kotlinFlowPositionLiteral(e.args[0]!)
          if (position !== null) return `${kotlinIdent(flowName)}.clampToExtent(${position}${e.args.slice(1).map((arg) => `, ${ktChartDouble(host.expr(arg, indent))}`).join('')})`
          if (e.args[0]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 1`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        if (member === 'getSnapLines' && e.args.length >= 2) {
          const position = kotlinFlowPositionLiteral(e.args[1]!)
          if (position !== null) return `${kotlinIdent(flowName)}.getSnapLines(${host.expr(e.args[0]!, indent)}, ${position}${e.args[2] ? `, ${ktChartDouble(host.expr(e.args[2]!, indent))}` : ''})`
          if (e.args[1]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 2`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
      }
// Flow lookup computeds are JavaScript Maps. Kotlin Map.get already
      // matches; Map.has is containsKey.
      if (
        e.callee.kind === 'member' &&
        (e.callee.property === 'get' || e.callee.property === 'has') &&
        e.callee.object.kind === 'call' &&
        e.callee.object.args.length === 0 &&
        e.callee.object.callee.kind === 'member' &&
        e.callee.object.callee.object.kind === 'identifier' &&
        host.isFlowState(e.callee.object.callee.object.name) &&
        ['nodeMap', 'edgeMap', 'measurements'].includes(e.callee.object.callee.property) &&
        e.args.length === 1
      ) {
        const flowName = kotlinIdent(e.callee.object.callee.object.name)
        const webName = e.callee.object.callee.property
        const nativeName = webName === 'nodeMap' ? 'nodeLookup' : webName === 'edgeMap' ? 'edgeLookup' : webName
        const method = e.callee.property === 'has' ? 'containsKey' : 'get'
        return `${flowName}.${nativeName}.${method}(${host.expr(e.args[0]!, indent)})`
      }
// A signal WRITE on a flow-state property — read-only natively; name it.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'member' &&
        e.callee.object.object.kind === 'identifier' &&
        host.isFlowState(e.callee.object.object.name) &&
        LOWERED_FLOW_PROPERTY_READS.has(e.callee.object.property) &&
        (e.callee.property === 'set' || e.callee.property === 'update')
      ) {
        const flowName = e.callee.object.object.name
        const property = e.callee.object.property
        if ((property === 'nodes' || property === 'edges') && e.args.length === 1) {
          const method = property === 'nodes' ? 'setNodes' : 'setEdges'
          if (e.callee.property === 'set') {
            const value = resolveKotlinStaticFlowValue(e.args[0]!)
            const literal = property === 'nodes' ? kotlinFlowNodeListLiteral(value, flowName) : kotlinFlowEdgeListLiteral(value, flowName)
            return `${kotlinIdent(flowName)}.${method}(${literal ?? host.expr(e.args[0]!, indent)})`
          }
          return `${kotlinIdent(flowName)}.${method}(${host.expr(e.args[0]!, indent)})`
        }
        if ((property === 'viewport' || property === 'containerSize') && e.args.length === 1) {
          const method = property === 'viewport' ? 'setViewport' : e.callee.property === 'set' ? 'replaceContainerSize' : 'updateContainerSize'
          const typeName = property === 'viewport' ? 'PyreonFlowViewport' : 'PyreonFlowContainerSize'
          const names = property === 'viewport' ? ['x', 'y', 'zoom'] : ['width', 'height']
          const arg = resolveKotlinStaticFlowValue(e.args[0]!)
          if (e.callee.property === 'set' && arg.kind === 'object' && (arg.spreads?.length ?? 0) === 0) {
            const values = new Map(arg.fields.map((field) => [field.name, field.value]))
            if (names.every((name) => values.has(name))) {
              return `${kotlinIdent(flowName)}.${method}(${typeName}(${names.map((name) => `${name} = ${ktChartDouble(host.expr(values.get(name)!, indent))}`).join(', ')}))`
            }
          }
          const body = arg.kind === 'arrow' ? (arg.body.kind === 'paren' ? arg.body.inner : arg.body) : undefined
          if (e.callee.property === 'update' && arg.kind === 'arrow' && arg.params.length === 1 && body?.kind === 'object' && (body.spreads ?? []).every((spread) => spread.kind === 'identifier' && spread.name === arg.params[0])) {
            const values = new Map(body.fields.map((field) => [field.name, field.value]))
            const param = kotlinIdent(arg.params[0]!)
            if (names.every((name) => values.has(name) || (body.spreads?.length ?? 0) > 0)) return `${kotlinIdent(flowName)}.${method} { ${param} -> ${typeName}(${names.map((name) => `${name} = ${values.has(name) ? ktChartDouble(host.expr(values.get(name)!, indent)) : `${param}.${name}`}`).join(', ')}) }`
          }
        }
        if (property === 'measurements' && e.args.length === 1) {
          const arg = resolveKotlinStaticFlowValue(e.args[0]!)
          if (e.callee.property === 'set' && arg.kind === 'new-collection' && arg.collection === 'map' && (arg.entries?.length ?? 0) === 0) {
            return `${kotlinIdent(flowName)}.replaceMeasurements(emptyMap())`
          }
          if (e.callee.property === 'set') {
            return `${kotlinIdent(flowName)}.replaceMeasurements(${host.expr(arg, indent)})`
          }
          if (e.callee.property === 'update' && arg.kind === 'arrow') {
            return `${kotlinIdent(flowName)}.updateMeasurements(${host.expr(arg, indent)})`
          }
        }
        host.warn(flowSignalWriteWarning(flowName, property, e.callee.property))
      }
// PyreonFlowState property reads drop parens — web `flow.nodes()` /
      // `flow.edges()` / `flow.viewport()` / `flow.zoom()` are Signal/Computed
      // accessor CALLS; the Kotlin port exposes them as `val` properties
      // (mirrors the table rewrite immediately above). `selectedNodes()`/
      // `selectedEdges()` stay METHODS (named that way on purpose, matching
      // the web call syntax with no rewrite needed) — deliberately absent.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        host.isFlowState(e.callee.object.name) &&
        e.args.length === 0 &&
        LOWERED_FLOW_PROPERTY_READS.has(e.callee.property)
      ) {
        const nativeName = e.callee.property === 'nodeMap' ? 'nodeLookup' : e.callee.property === 'edgeMap' ? 'edgeLookup' : e.callee.property
        return `${kotlinIdent(e.callee.object.name)}.${kotlinIdent(nativeName)}`
      }
  return undefined
}

/** A member read rooted at a flow binding (`flow.config.zoom`, `flow.nodeMap().size`). */
export function lowerKotlinFlowMember(e: MemberExprIR, _indent: number): string | undefined {
if (
        e.object.kind === 'member' && e.object.property === 'config' &&
        e.object.object.kind === 'identifier' && host.isFlowState(e.object.object.name)
      ) {
        const nativeProperty = LOWERED_FLOW_CONFIG_PROPERTIES.get(e.property)
        if (nativeProperty !== undefined) return `${kotlinIdent(e.object.object.name)}.${nativeProperty}`
        host.warn(`createFlow binding \`${e.object.object.name}\`: \`config.${e.property}\` is not represented by the native Flow configuration.`)
      }
  return undefined
}

/** `MarkerType.Arrow` / `MarkerType.ArrowClosed` → the marker-type string the runtime expects. */
export function lowerKotlinMarkerType(e: MemberExprIR): string | undefined {
  if (e.object.kind === 'identifier' && e.object.name === 'MarkerType' && (e.property === 'Arrow' || e.property === 'ArrowClosed')) {
          return JSON.stringify(e.property.toLowerCase())
        }
  return undefined
}


/**
 * `props.edge.data.x` inside a custom edge renderer: the edge's `data` is a
 * nullable map on Compose, so a field read becomes a lookup.
 */
export function lowerKotlinEdgeDataRead(e: MemberExprIR, indent: number): string | undefined {
  if (
    e.object.kind === 'member' && e.object.property === 'data' &&
    e.object.object.kind === 'member' && e.object.object.property === 'edge' &&
    e.object.object.object.kind === 'identifier' && e.object.object.object.name === host.component().propsParamName
  ) {
    return `${host.expr(e.object, indent)}?.get(${JSON.stringify(e.property)})`
  }
  return undefined
}
