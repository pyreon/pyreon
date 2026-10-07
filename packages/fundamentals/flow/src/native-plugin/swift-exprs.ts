/**
 * Swift lowering for expressions the flow plugin owns: the helper functions
 * (`getBezierPath`, `computeLayout`, …), calls and member reads rooted at a flow binding,
 * and `MarkerType.*`. Moved verbatim from the compiler's Swift expression emitter.
 */
import { type CallExprIR, type ExprIR, type MemberExprIR, substituteIdentifier, swiftIdent } from '@pyreon/native-compiler/plugin-api'
import { FLOW_LAYOUT_OPTION_KEYS, FLOW_MARKER_LITERAL_SHAPE, HANDLED_FLOW_EDGE_FIELDS, HANDLED_FLOW_NODE_FIELDS, LOWERED_FLOW_CONFIG_PROPERTIES, LOWERED_FLOW_METHODS, LOWERED_FLOW_PROPERTY_READS, droppedFlowEdgePatchWarning, flowLayoutOptionsDroppedWarning, flowRectLiteralFields, flowSignalWriteWarning, unloweredFlowLiteralWarning, unloweredFlowMemberWarning, unsupportedFlowOptionsWarning } from './lowering'
import { host } from './swift-facade'
import { FLOW_PATH_HELPERS, FLOW_SET_CENTER_KEYS, isNilArg, resolveSwiftStaticFlowValue, swiftFlowConnectionLiteral, swiftFlowData, swiftFlowDurationOption, swiftFlowEdgeListLiteral, swiftFlowEdgeLiteral, swiftFlowExtentLiteral, swiftFlowGeometryLiteral, swiftFlowHandlesLiteral, swiftFlowLayoutOptions, swiftFlowMarkerLiteral, swiftFlowNodeExtentArgs, swiftFlowNodeListLiteral, swiftFlowNodeLiteral, swiftFlowPathHelper, swiftFlowPositionExpr, swiftFlowPositionLiteral, swiftFlowPositionsLiteral, swiftFlowReconnectLiteral, swiftFlowViewportLiteral, warnDroppedFlowFields } from './swift-literals'

const SWIFT_FUNCTION_ARMS: Record<string, (e: CallExprIR, indent: number) => string | undefined> = {}
const defineSwiftFunction = (names: readonly string[], arm: (e: CallExprIR, indent: number) => string | undefined): void => {
  for (const name of names) SWIFT_FUNCTION_ARMS[name] = arm
}

defineSwiftFunction(["computeLayout"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'computeLayout' && e.args.length >= 2 && e.args.length <= 4) {
            const options = swiftFlowLayoutOptions(e.args[3], indent)
            if (options !== null) {
              const args = [
                host.expr(e.args[0]!, indent),
                `edges: ${host.expr(e.args[1]!, indent)}`,
                ...(e.args[2] ? [`algorithm: ${host.expr(e.args[2]!, indent)}`] : []),
                ...(options ? [`options: ${options}`] : []),
              ]
              return `pyreonComputeFlowLayout(${args.join(', ')})`
            }
            host.warn('computeLayout options must be an object literal using direction/nodeSpacing/layerSpacing/animate/animationDuration to lower natively.')
          }
    return undefined
  })

defineSwiftFunction(["getBezierPath","getSmoothStepPath","getStepPath","getStraightPath","getWaypointPath"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && FLOW_PATH_HELPERS.has(e.callee.name) && e.args.length === 1) {
            const lowered = swiftFlowPathHelper(e.callee.name, e.args[0], indent)
            if (lowered !== null) return lowered
            host.warn(`${e.callee.name} requires one supported object-literal parameter to lower natively.`)
          }
    return undefined
  })

defineSwiftFunction(["resolveMarker"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'resolveMarker' && e.args.length === 1) {
            const marker = swiftFlowMarkerLiteral(e.args[0]!) ?? host.expr(e.args[0]!, indent)
            return `pyreonResolveFlowMarker(${marker})`
          }
    return undefined
  })

defineSwiftFunction(["markerId"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'markerId' && e.args.length === 1) {
            const marker = swiftFlowMarkerLiteral(e.args[0]!) ?? host.expr(e.args[0]!, indent)
            return `pyreonFlowMarkerId(${marker})`
          }
    return undefined
  })

defineSwiftFunction(["resolveEdgeMarkers"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'resolveEdgeMarkers' && e.args.length === 2) {
            const marker = swiftFlowMarkerLiteral(e.args[1]!) ?? host.expr(e.args[1]!, indent)
            return `pyreonResolveFlowEdgeMarkers(${host.expr(e.args[0]!, indent)}, defaultMarkerEnd: ${marker})`
          }
    return undefined
  })

defineSwiftFunction(["collectEdgeMarkers"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'collectEdgeMarkers' && e.args.length === 2) {
            const marker = swiftFlowMarkerLiteral(e.args[1]!) ?? host.expr(e.args[1]!, indent)
            return `pyreonCollectFlowEdgeMarkers(${host.expr(e.args[0]!, indent)}, defaultMarkerEnd: ${marker})`
          }
    return undefined
  })

defineSwiftFunction(["getHandlePosition"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getHandlePosition' && e.args.length === 5) {
            const position = swiftFlowPositionExpr(e.args[0]!)
            if (position !== null) return `pyreonHandlePosition(${position}, nodeX: ${host.expr(e.args[1]!, indent)}, nodeY: ${host.expr(e.args[2]!, indent)}, nodeWidth: ${host.expr(e.args[3]!, indent)}, nodeHeight: ${host.expr(e.args[4]!, indent)})`
            host.warn('getHandlePosition requires a literal Position value to lower natively.')
          }
    return undefined
  })

defineSwiftFunction(["getEdgePath"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getEdgePath' && (e.args.length === 7 || e.args.length === 8)) {
            const sourcePosition = swiftFlowPositionExpr(e.args[3]!)
            const targetPosition = swiftFlowPositionExpr(e.args[6]!)
            const options = e.args[7]
            const allowed = new Set(['borderRadius', 'offset', 'curvature'])
            if (sourcePosition !== null && targetPosition !== null && (options === undefined || (options.kind === 'object' && (options.spreads?.length ?? 0) === 0 && options.fields.every((field) => allowed.has(field.name))))) {
              const extras = options?.kind === 'object' ? options.fields.map((field) => `${field.name}: ${host.expr(field.value, indent)}`) : []
              return `pyreonEdgePath(type: ${host.expr(e.args[0]!, indent)}, sourceX: ${host.expr(e.args[1]!, indent)}, sourceY: ${host.expr(e.args[2]!, indent)}, sourcePosition: ${sourcePosition}, targetX: ${host.expr(e.args[4]!, indent)}, targetY: ${host.expr(e.args[5]!, indent)}, targetPosition: ${targetPosition}${extras.length ? `, ${extras.join(', ')}` : ''})`
            }
            host.warn('getEdgePath requires literal Position values and a supported object-literal options parameter to lower natively.')
          }
    return undefined
  })

defineSwiftFunction(["getNodeIntersection"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getNodeIntersection' && e.args.length === 2) {
            const box = swiftFlowGeometryLiteral(e.args[0]!, ['x', 'y', 'width', 'height'], 'PyreonFlowRect', indent)
            const toward = swiftFlowGeometryLiteral(e.args[1]!, ['x', 'y'], 'PyreonXYPosition', indent)
            if (box !== null && toward !== null) return `pyreonNodeIntersection(${box}, toward: ${toward})`
            host.warn('getNodeIntersection requires literal { x, y, width, height } and { x, y } parameters to lower natively.')
          }
    return undefined
  })

defineSwiftFunction(["getEffectiveDimensions"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getEffectiveDimensions' && (e.args.length === 1 || e.args.length === 2)) {
            if (e.args[0]!.kind !== 'object' && (e.args[1] === undefined || e.args[1]!.kind !== 'object')) {
              return `pyreonEffectiveDimensions(${host.expr(e.args[0]!, indent)}${e.args[1] ? `, measurement: ${host.expr(e.args[1], indent)}` : ''})`
            }
            host.warn('getEffectiveDimensions requires native Flow node/measurement expressions rather than anonymous object literals.')
          }
    return undefined
  })

defineSwiftFunction(["getFloatingEndpoints"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getFloatingEndpoints' && e.args.length === 3) {
            const dimensions = swiftFlowGeometryLiteral(e.args[2]!, ['sourceW', 'sourceH', 'targetW', 'targetH'], 'PyreonFlowNodeBoxDimensions', indent)
            if (e.args[0]!.kind !== 'object' && e.args[1]!.kind !== 'object' && dimensions !== null) {
              return `pyreonGetFloatingEndpoints(${host.expr(e.args[0]!, indent)}, targetNode: ${host.expr(e.args[1]!, indent)}, dimensions: ${dimensions})`
            }
            host.warn('getFloatingEndpoints requires native Flow node expressions and a literal { sourceW, sourceH, targetW, targetH } dimensions object.')
          }
    return undefined
  })

defineSwiftFunction(["getSmartHandlePositions"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'getSmartHandlePositions' && (e.args.length === 2 || e.args.length === 3)) {
            const dimensions = e.args[2] === undefined ? undefined : swiftFlowGeometryLiteral(e.args[2], ['sourceW', 'sourceH', 'targetW', 'targetH'], 'PyreonFlowNodeBoxDimensions', indent)
            if (e.args[0]!.kind !== 'object' && e.args[1]!.kind !== 'object' && dimensions !== null) {
              return `pyreonGetSmartHandlePositions(${host.expr(e.args[0]!, indent)}, targetNode: ${host.expr(e.args[1]!, indent)}${dimensions ? `, dimensions: ${dimensions}` : ''})`
            }
            host.warn('getSmartHandlePositions requires native Flow node expressions and, when provided, a literal { sourceW, sourceH, targetW, targetH } dimensions object.')
          }
    return undefined
  })

defineSwiftFunction(["resolveHandleAnchor"], (e: CallExprIR, indent: number): string | undefined => {
    if (e.callee.kind === 'identifier' && e.callee.name === 'resolveHandleAnchor' && (e.args.length === 4 || e.args.length === 5)) {
            if (e.args[0]!.kind !== 'object' && e.args[3]!.kind !== 'object' && (e.args[4] === undefined || e.args[4]!.kind !== 'object')) {
              return `pyreonResolveHandleAnchor(${host.expr(e.args[0]!, indent)}, handleId: ${host.expr(e.args[1]!, indent)}, type: ${host.expr(e.args[2]!, indent)}, dimensions: ${host.expr(e.args[3]!, indent)}${e.args[4] ? `, measurement: ${host.expr(e.args[4], indent)}` : ''})`
            }
            host.warn('resolveHandleAnchor requires native Flow node, dimensions, and measurement expressions rather than anonymous object literals.')
          }
    return undefined
  })

/** Lower a plain `name(args)` call to the flow runtime helper it maps to, or `undefined` to decline. */
export function lowerSwiftFlowFunction(name: string, args: readonly ExprIR[], indent: number): string | undefined {
  const arm = SWIFT_FUNCTION_ARMS[name]
  if (arm === undefined) return undefined
  return arm({ kind: 'call', callee: { kind: 'identifier', name }, args: [...args] }, indent)
}

/** A call rooted at a flow binding (`flow.addNode({…})`, `flow.nodes.set(x)`, `flow.nodeMap().get(id)`). */
export function lowerSwiftFlowCall(e: CallExprIR, indent: number): string | undefined {
// PyreonFlowState struct-literal ARGUMENTS: `addNode({...})` /
      // `addEdge({...})` / `updateNodePosition(id, {...})` pass an object
      // literal where the callee expects a NAMED runtime type
      // (`PyreonFlowNode<Row>` / `PyreonFlowEdge` / `PyreonXYPosition`).
      // Swift's type system is nominal, so the generic object-literal path
      // (which would synthesize its OWN unrelated `__ObjN` struct — same
      // field names, different type) cannot satisfy the parameter; this
      // rewrite constructs the RIGHT type by name instead. Falls through to
      // generic emission (unchanged) when the argument isn't a literal an
      // already-typed variable reference is the common non-literal case,
      // and needs no rewrite at all.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        host.isFlowState(e.callee.object.name)
      ) {
        const flowName = e.callee.object.name
        const member = e.callee.property
        const flowPatchArg = e.args[1] === undefined ? undefined : resolveSwiftStaticFlowValue(e.args[1])
        const flowPatchBody = flowPatchArg?.kind === 'arrow' && flowPatchArg.body.kind === 'paren' ? flowPatchArg.body.inner : flowPatchArg?.kind === 'arrow' ? flowPatchArg.body : undefined
        const flowPatchCallback = member === 'updateNodeData' && flowPatchArg?.kind === 'arrow' && flowPatchArg.params.length === 1 && flowPatchBody?.kind === 'object' && (flowPatchBody.spreads?.length ?? 0) === 0
        if (['updateNode', 'updateNodeData', 'updateEdge'].includes(member) && e.args.length === 2 && !flowPatchCallback && (flowPatchArg?.kind !== 'object' || (flowPatchArg.spreads?.length ?? 0) > 0)) {
          host.warn(`createFlow binding \`${flowName}\`: \`${member}\` currently lowers only a literal patch object without spreads on native targets; this call is emitted as written and may fail the native build.`)
        }
        if (e.args.length === 0 && member === 'getNodes') return `${swiftIdent(flowName)}.nodes`
        if (e.args.length === 0 && member === 'getEdges') return `${swiftIdent(flowName)}.edges`
        if (e.args.length === 0 && member === 'getViewport') return `${swiftIdent(flowName)}.viewport`
        if (member === '_clearNodeMeasurement' && e.args.length === 1) return `${swiftIdent(flowName)}.clearNodeMeasurement(${host.expr(e.args[0]!, indent)})`
        if (member === '_setNodeMeasurement' && (e.args.length === 3 || e.args.length === 4)) {
          const baseArgs = `${host.expr(e.args[0]!, indent)}, width: ${host.expr(e.args[1]!, indent)}, height: ${host.expr(e.args[2]!, indent)}`
          if (e.args.length === 3) return `${swiftIdent(flowName)}.updateNodeMeasurement(${baseArgs})`
          const handles = e.args[3]!
          if (handles.kind === 'array') {
            const emitted = handles.elements.map((item) => {
              if (item.kind !== 'object') return null
              const fields = new Map(item.fields.map((field) => [field.name, field.value]))
              const position = fields.get('position')
              if (!fields.has('id') || !fields.has('type') || !fields.has('x') || !fields.has('y') || position?.kind !== 'literal' || typeof position.value !== 'string') return null
              return `PyreonFlowMeasuredHandle(id: ${host.expr(fields.get('id')!, indent)}, type: ${host.expr(fields.get('type')!, indent)}, position: .${position.value}, x: ${host.expr(fields.get('x')!, indent)}, y: ${host.expr(fields.get('y')!, indent)})`
            })
            if (emitted.every((value) => value !== null)) return `${swiftIdent(flowName)}.updateNodeMeasurement(${baseArgs}, handles: [${emitted.join(', ')}])`
          }
          host.warn(`createFlow binding \`${flowName}\`: \`_setNodeMeasurement\` handle geometry must be a literal array to lower natively.`)
        }
        // Nothing silent inside the boundary: every member that is not in the
        // v1 surface is NAMED here (it is still emitted as written — the native
        // build is where it fails, but now the author heard about it first).
        if (!LOWERED_FLOW_METHODS.has(member) && !LOWERED_FLOW_PROPERTY_READS.has(member)) {
          host.warn(unloweredFlowMemberWarning(flowName, member))
        }
        // Every `on*` listener on the port takes a ONE-argument callback, and the
        // web lets a subscriber ignore that argument (`flow.onConnectStart(() =>
        // count++)`). A zero-parameter Swift closure in that position is
        // "contextual type for closure argument list expects 1 argument" —
        // Kotlin's one-parameter lambda already accepts the bare form.
        if (member.startsWith('on') && LOWERED_FLOW_METHODS.has(member) && e.args.length === 1) {
          const callback = e.args[0]!
          if (callback.kind === 'arrow' && callback.params.length === 0) {
            const closure = host.expr(callback, indent)
            if (closure.startsWith('{')) return `${swiftIdent(flowName)}.${member}({ _ in${closure.slice(1)})`
          }
        }
        // Swift's labeled parameters: the web call is positional, the port's
        // second parameter is labeled — an unlabeled emit fails ONLY on iOS.
        if ((member === 'selectNode' || member === 'selectNodes' || member === 'selectEdge') && e.args.length === 2) {
          return `${swiftIdent(flowName)}.${member}(${host.expr(e.args[0]!, indent)}, additive: ${host.expr(e.args[1]!, indent)})`
        }
        if (member === 'fitView' && e.args.length >= 1) {
          const first = e.args[0]!
          const ids = isNilArg(first) ? 'nil' : host.expr(first, indent)
          const duration = swiftFlowDurationOption(e.args[2])
          if (duration !== null) return `${swiftIdent(flowName)}.fitView(${ids}${e.args[1] ? `, padding: ${host.expr(e.args[1]!, indent)}` : ''}${duration ? `, duration: ${duration}` : ''})`
          host.warn(unsupportedFlowOptionsWarning(flowName, 'fitView', ['duration'], e.args[2]!))
        }
        if (member === 'paste' && e.args.length === 1) {
          const lit = swiftFlowPositionLiteral(resolveSwiftStaticFlowValue(e.args[0]!))
          if (lit !== null) return `${swiftIdent(flowName)}.paste(${lit})`
          if (resolveSwiftStaticFlowValue(e.args[0]!).kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 1`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        if (member === 'addNode' && e.args.length === 1) {
          const lit = swiftFlowNodeLiteral(resolveSwiftStaticFlowValue(e.args[0]!), flowName)
          if (lit !== null) return `${swiftIdent(flowName)}.addNode(${lit})`
        }
        if (member === 'addEdge' && e.args.length === 1) {
          const lit = swiftFlowEdgeLiteral(resolveSwiftStaticFlowValue(e.args[0]!), flowName)
          if (lit !== null) return `${swiftIdent(flowName)}.addEdge(${lit})`
        }
        if (e.callee.property === 'updateNodePosition' && e.args.length === 2) {
          const lit = swiftFlowPositionLiteral(resolveSwiftStaticFlowValue(e.args[1]!))
          if (lit !== null) {
            return `${swiftIdent(e.callee.object.name)}.updateNodePosition(${host.expr(e.args[0]!, indent)}, ${lit})`
          }
          if (resolveSwiftStaticFlowValue(e.args[1]!).kind === 'object') host.warn(unloweredFlowLiteralWarning(e.callee.object.name, '`updateNodePosition(...)` argument 2', 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        if (member === 'updateNodeData' && e.args.length === 2 && flowPatchArg?.kind === 'object') {
          const patch = flowPatchArg
          if (!patch.spreads || patch.spreads.length === 0) {
            const assignments = patch.fields.map(({ name, value }) => `data.${swiftIdent(name)} = ${host.expr(value, indent)}`).join('; ')
            return `${swiftIdent(flowName)}.updateNodeData(${host.expr(e.args[0]!, indent)}) { data in ${assignments} }`
          }
        }
        if (member === 'updateNodeData' && e.args.length === 2 && flowPatchCallback && flowPatchArg?.kind === 'arrow' && flowPatchBody?.kind === 'object') {
          const callback = flowPatchArg
          const assignments = flowPatchBody.fields.map(({ name, value }) => {
            const resolved = substituteIdentifier(value, callback.params[0]!, { kind: 'identifier', name: 'node' }) ?? value
            return `data.${swiftIdent(name)} = ${host.expr(resolved, indent)}`
          }).join('; ')
          return `${swiftIdent(flowName)}.updateNodeDataFromNode(${host.expr(e.args[0]!, indent)}) { node in var data = node.data; ${assignments}; return data }`
        }
        if (member === 'updateNode' && e.args.length === 2 && flowPatchArg?.kind === 'object') {
          const patch = flowPatchArg
          if (!patch.spreads || patch.spreads.length === 0) {
            warnDroppedFlowFields(`createFlow binding \`${flowName}\` updateNode(...)`, 'node', patch)
            const statements = patch.fields.flatMap(({ name, value }) => {
              if (name === 'id') { host.warn(`createFlow binding \`${flowName}\` updateNode(...): changing a node id is not supported natively; the original id is preserved.`); return [] }
              // A literal lowers to the native constructor; a NON-literal value
              // passes through as written (the addNode rule). Only a literal of
              // the right kind but the wrong shape is dropped — and named.
              if (name === 'position') {
                const position = swiftFlowPositionLiteral(value)
                if (position) return [`node.position = ${position}`]
                if (value.kind === 'object') { host.warn(unloweredFlowLiteralWarning(flowName, 'updateNode(...) field `position`', 'a `{ x, y }` literal with both coordinates')); return [] }
                return [`node.position = ${host.expr(value, indent)}`]
              }
              if (name === 'data' && value.kind === 'object') return value.fields.map((field) => `node.data.${swiftIdent(field.name)} = ${host.expr(field.value, indent)}`)
              if ((name === 'sourceHandles' || name === 'targetHandles')) {
                const handles = swiftFlowHandlesLiteral(value)
                if (handles) return [`node.${name} = ${handles}`]
                if (value.kind === 'array') { host.warn(unloweredFlowLiteralWarning(flowName, `updateNode(...) field \`${name}\``, "an array of `{ type, position }` literals (a string `type`, a literal side, an optional string `id`)")); return [] }
                return [`node.${name} = ${host.expr(value, indent)}`]
              }
              if (name === 'extent') {
                const extent = swiftFlowNodeExtentArgs(value)
                if (!extent) host.warn(`createFlow binding \`${flowName}\` updateNode(...): node field \`extent\` must be \`'parent'\` or a static [[minX, minY], [maxX, maxY]] tuple on native targets.`)
                return extent ? extent.map((part) => part === 'extentParent: true' ? 'node.extent = nil; node.extentParent = true' : `node.${part.replace(':', ' =')}; node.extentParent = false`) : []
              }
              if (name === 'class') return [`node.className = ${host.expr(value, indent)}`]
              return HANDLED_FLOW_NODE_FIELDS.has(name) ? [`node.${swiftIdent(name)} = ${host.expr(value, indent)}`] : []
            })
            return `${swiftIdent(flowName)}.updateNode(${host.expr(e.args[0]!, indent)}) { node in ${statements.join('; ')} }`
          }
        }
        if (member === 'updateEdge' && e.args.length === 2 && flowPatchArg?.kind === 'object') {
          const patch = flowPatchArg
          if (!patch.spreads || patch.spreads.length === 0) {
            warnDroppedFlowFields(`createFlow binding \`${flowName}\` updateEdge(...)`, 'edge', patch)
            const statements = patch.fields.flatMap(({ name, value }) => {
              if (name === 'id') { host.warn(`createFlow binding \`${flowName}\` updateEdge(...): changing an edge id is not supported natively; the original id is preserved.`); return [] }
              if (name === 'pathOptions') {
                if (value.kind !== 'object' || (value.spreads?.length ?? 0) > 0) { host.warn(droppedFlowEdgePatchWarning(flowName, 'pathOptions', 'an inline object literal')); return [] }
                const unknown = value.fields.filter((field) => !['curvature', 'borderRadius', 'offset'].includes(field.name)).map((field) => field.name)
                if (unknown.length > 0) host.warn(droppedFlowEdgePatchWarning(flowName, `pathOptions.${unknown.join('/')}`, 'one of `curvature`, `borderRadius`, `offset`'))
                return value.fields.flatMap((field) => ['curvature', 'borderRadius', 'offset'].includes(field.name) ? [`edge.${field.name === 'offset' ? 'pathOffset' : field.name} = ${host.expr(field.value, indent)}`] : [])
              }
              if (name === 'markerStart' || name === 'markerEnd') { const marker = swiftFlowMarkerLiteral(value); return marker ? [`edge.${name} = ${marker}`, ...(name === 'markerEnd' ? ['edge.markerEndSpecified = true'] : [])] : (host.warn(droppedFlowEdgePatchWarning(flowName, name, FLOW_MARKER_LITERAL_SHAPE)), []) }
              if (name === 'animated') return [`edge.animated = ${host.expr(value, indent)}`, 'edge.animatedSpecified = true']
              if (name === 'waypoints') {
                const points = swiftFlowPositionsLiteral(value)
                if (points) return [`edge.waypoints = ${points}`]
                if (value.kind === 'array') { host.warn(unloweredFlowLiteralWarning(flowName, 'updateEdge(...) field `waypoints`', 'an array of `{ x, y }` literals, each with both coordinates')); return [] }
                return [`edge.waypoints = ${host.expr(value, indent)}`]
              }
              if (name === 'data') { const data = swiftFlowData(value); if (!data) host.warn(`createFlow binding \`${flowName}\` updateEdge(...): edge \`data\` must be a static JSON-compatible object to lower natively.`); return data ? [`edge.data = ${data}`] : [] }
              if (name === 'class') return [`edge.className = ${host.expr(value, indent)}`]
              return HANDLED_FLOW_EDGE_FIELDS.has(name) ? [`edge.${swiftIdent(name)} = ${host.expr(value, indent)}`] : []
            })
            return `${swiftIdent(flowName)}.updateEdge(${host.expr(e.args[0]!, indent)}) { edge in ${statements.join('; ')} }`
          }
        }
        // React Flow's intersection helpers: a rect literal becomes the engine's
        // PyreonFlowRect, and the positional `partially` flag gets its label.
        if ((member === 'getIntersectingNodes' && e.args.length >= 1) || (member === 'isNodeIntersecting' && e.args.length >= 2)) {
          const target = (arg: ExprIR) => {
            const rect = flowRectLiteralFields(arg)
            if (!rect) return host.expr(arg, indent)
            const labels = ['x', 'y', 'width', 'height']
            return `PyreonFlowRect(${rect.map((v, i) => `${labels[i]}: ${v.kind === 'literal' ? host.expr(v, indent) : `Double(${host.expr(v, indent)})`}`).join(', ')})`
          }
          const rest = member === 'isNodeIntersecting' ? [target(e.args[0]!), target(e.args[1]!)] : [target(e.args[0]!)]
          const flag = e.args[member === 'isNodeIntersecting' ? 2 : 1]
          return `${swiftIdent(flowName)}.${member}(${rest.join(', ')}${flag ? `, partially: ${host.expr(flag, indent)}` : ''})`
        }
        if (['panTo', 'screenToFlowPosition', 'flowToScreenPosition'].includes(member) && e.args.length === 1) {
          const lit = swiftFlowPositionLiteral(e.args[0]!)
          if (lit !== null) return `${swiftIdent(flowName)}.${member}(${lit})`
          if (e.args[0]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 1`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        if (member === 'zoomTo' && e.args.length >= 1) {
          const duration = swiftFlowDurationOption(e.args[1])
          if (duration !== null) return `${swiftIdent(flowName)}.zoomTo(${host.expr(e.args[0]!, indent)}${duration ? `, duration: ${duration}` : ''})`
          host.warn(unsupportedFlowOptionsWarning(flowName, 'zoomTo', ['duration'], e.args[1]!))
        }
        if ((member === 'zoomIn' || member === 'zoomOut') && e.args.length <= 1) {
          const duration = swiftFlowDurationOption(e.args[0])
          if (duration !== null) return `${swiftIdent(flowName)}.${member}(${duration ? `duration: ${duration}` : ''})`
          host.warn(unsupportedFlowOptionsWarning(flowName, member, ['duration'], e.args[0]!))
        }
        if (member === 'addEdgeWaypoint' && e.args.length >= 2) {
          const point = swiftFlowPositionLiteral(e.args[1]!)
          if (point !== null) return `${swiftIdent(flowName)}.addEdgeWaypoint(${host.expr(e.args[0]!, indent)}, ${point}${e.args.length === 3 ? `, ${host.expr(e.args[2]!, indent)}` : ''})`
          if (e.args[1]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 2`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        if (member === 'updateEdgeWaypoint' && e.args.length === 3) {
          const point = swiftFlowPositionLiteral(e.args[2]!)
          if (point !== null) return `${swiftIdent(flowName)}.updateEdgeWaypoint(${host.expr(e.args[0]!, indent)}, ${host.expr(e.args[1]!, indent)}, ${point})`
          if (e.args[2]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 3`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        if (member === 'reconnectEdge' && e.args.length === 2) {
          const args = swiftFlowReconnectLiteral(e.args[1]!)
          if (args !== null) return `${swiftIdent(flowName)}.reconnectEdge(${host.expr(e.args[0]!, indent)}${args})`
          host.warn(unsupportedFlowOptionsWarning(flowName, 'reconnectEdge', ['source', 'target', 'sourceHandle', 'targetHandle'], e.args[1]!))
        }
        if (member === 'isValidConnection' && e.args.length === 1) {
          const connection = swiftFlowConnectionLiteral(e.args[0]!)
          if (connection !== null) return `${swiftIdent(flowName)}.isValidConnection(${connection})`
          if (e.args[0]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 1`, 'a `{ source, target }` literal (with optional `sourceHandle` / `targetHandle`)', 'emitted'))
        }
        if ((member === 'addNodes' || member === 'setNodes') && e.args.length === 1) {
          const nodes = swiftFlowNodeListLiteral(resolveSwiftStaticFlowValue(e.args[0]!), flowName)
          if (nodes !== null) return `${swiftIdent(flowName)}.${member}(${nodes})`
        }
        if ((member === 'addEdges' || member === 'setEdges') && e.args.length === 1) {
          const edges = swiftFlowEdgeListLiteral(resolveSwiftStaticFlowValue(e.args[0]!), flowName)
          if (edges !== null) return `${swiftIdent(flowName)}.${member}(${edges})`
        }
        if (member === 'setViewport' && e.args.length >= 1) {
          const args = swiftFlowViewportLiteral(resolveSwiftStaticFlowValue(e.args[0]!))
          const duration = swiftFlowDurationOption(e.args[1])
          if (args !== null && duration !== null) return `${swiftIdent(flowName)}.setViewport(${args}${duration ? `${args ? ', ' : ''}duration: ${duration}` : ''})`
          if (args === null) host.warn(unsupportedFlowOptionsWarning(flowName, 'setViewport', ['x', 'y', 'zoom', 'duration'], resolveSwiftStaticFlowValue(e.args[0]!)))
          if (duration === null) host.warn(unsupportedFlowOptionsWarning(flowName, 'setViewport', ['duration'], e.args[1]!))
        }
        if (member === 'animateViewport' && e.args.length >= 1) {
          const args = swiftFlowViewportLiteral(e.args[0]!)
          if (args !== null) return `${swiftIdent(flowName)}.animateViewport(${args}${e.args[1] ? `, duration: ${host.expr(e.args[1]!, indent)}` : ''})`
          host.warn(unsupportedFlowOptionsWarning(flowName, 'animateViewport', ['x', 'y', 'zoom'], e.args[0]!))
        }
        if (member === 'layout') {
          if (e.args.length === 0) return `${swiftIdent(flowName)}.layout()`
          const algorithm = host.expr(e.args[0]!, indent)
          if (e.args.length === 1) return `${swiftIdent(flowName)}.layout(${algorithm})`
          const options = e.args[1]!
          if (options.kind === 'object' && (!options.spreads || options.spreads.length === 0)) {
            const dropped: string[] = []
            const fields = options.fields.flatMap(({ name, value }) => {
              if (name === 'direction' || name === 'nodeSpacing' || name === 'layerSpacing' || name === 'animate' || name === 'animationDuration') return [`${name}: ${host.expr(value, indent)}`]
              dropped.push(name)
              return []
            })
            if (dropped.length > 0) host.warn(flowLayoutOptionsDroppedWarning(flowName, dropped))
            return `${swiftIdent(flowName)}.layout(${algorithm}, options: PyreonFlowLayoutOptions(${fields.join(', ')}))`
          }
          host.warn(unsupportedFlowOptionsWarning(flowName, 'layout', FLOW_LAYOUT_OPTION_KEYS, options))
        }
        if (member === 'setCenter' && e.args.length >= 2) {
          const options = e.args[2] ? swiftFlowViewportLiteral(e.args[2]!, FLOW_SET_CENTER_KEYS) : ''
          if (options !== null) return `${swiftIdent(flowName)}.setCenter(${host.expr(e.args[0]!, indent)}, ${host.expr(e.args[1]!, indent)}${options ? `, ${options}` : ''})`
          host.warn(unsupportedFlowOptionsWarning(flowName, 'setCenter', FLOW_SET_CENTER_KEYS, e.args[2]!))
        }
        if (member === 'setNodeExtent' && e.args.length === 1) {
          if (isNilArg(e.args[0]!)) return `${swiftIdent(flowName)}.clearNodeExtent()`
          const extent = swiftFlowExtentLiteral(e.args[0]!)
          if (extent !== null) return `${swiftIdent(flowName)}.setNodeExtent(${extent})`
        }
        if (member === 'clampToExtent' && e.args.length >= 1) {
          const position = swiftFlowPositionLiteral(e.args[0]!)
          if (position !== null) return `${swiftIdent(flowName)}.clampToExtent(${position}${e.args.slice(1).map((arg) => `, ${host.expr(arg, indent)}`).join('')})`
          if (e.args[0]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 1`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
        if (member === 'getSnapLines' && e.args.length >= 2) {
          const position = swiftFlowPositionLiteral(e.args[1]!)
          if (position !== null) return `${swiftIdent(flowName)}.getSnapLines(${host.expr(e.args[0]!, indent)}, ${position}${e.args[2] ? `, threshold: ${host.expr(e.args[2]!, indent)}` : ''})`
          if (e.args[1]!.kind === 'object') host.warn(unloweredFlowLiteralWarning(flowName, `\`${member}(...)\` argument 2`, 'a `{ x, y }` literal with both coordinates', 'emitted'))
        }
      }
// Flow lookup computeds are JavaScript Maps. Preserve their canonical
      // get/has operations while targeting Swift dictionaries.
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
        const flowName = swiftIdent(e.callee.object.callee.object.name)
        const webName = e.callee.object.callee.property
        const nativeName = webName === 'nodeMap' ? 'nodeLookup' : webName === 'edgeMap' ? 'edgeLookup' : webName
        const lookup = `${flowName}.${nativeName}[${host.expr(e.args[0]!, indent)}]`
        return e.callee.property === 'has' ? `(${lookup} != nil)` : lookup
      }
// A signal WRITE on a flow-state property (`flow.nodes.set(...)`): the
      // native port exposes the collections read-only — name it.
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
            const value = resolveSwiftStaticFlowValue(e.args[0]!)
            const literal = property === 'nodes' ? swiftFlowNodeListLiteral(value, flowName) : swiftFlowEdgeListLiteral(value, flowName)
            return `${swiftIdent(flowName)}.${method}(${literal ?? host.expr(e.args[0]!, indent)})`
          }
          return `${swiftIdent(flowName)}.${method}(${host.expr(e.args[0]!, indent)})`
        }
        if ((property === 'viewport' || property === 'containerSize') && e.args.length === 1) {
          const method = property === 'viewport' ? 'setViewport' : e.callee.property === 'set' ? 'replaceContainerSize' : 'updateContainerSize'
          const typeName = property === 'viewport' ? 'PyreonFlowViewport' : 'PyreonFlowContainerSize'
          const names = property === 'viewport' ? ['x', 'y', 'zoom'] : ['width', 'height']
          const arg = resolveSwiftStaticFlowValue(e.args[0]!)
          if (e.callee.property === 'set' && arg.kind === 'object' && (arg.spreads?.length ?? 0) === 0) {
            const values = new Map(arg.fields.map((field) => [field.name, field.value]))
            if (names.every((name) => values.has(name))) {
              return `${swiftIdent(flowName)}.${method}(${typeName}(${names.map((name) => `${name}: ${host.expr(values.get(name)!, indent)}`).join(', ')}))`
            }
          }
          const body = arg.kind === 'arrow' ? (arg.body.kind === 'paren' ? arg.body.inner : arg.body) : undefined
          if (e.callee.property === 'update' && arg.kind === 'arrow' && arg.params.length === 1 && body?.kind === 'object' && (body.spreads ?? []).every((spread) => spread.kind === 'identifier' && spread.name === arg.params[0])) {
            const values = new Map(body.fields.map((field) => [field.name, field.value]))
            const param = swiftIdent(arg.params[0]!)
            if (names.every((name) => values.has(name) || (body.spreads?.length ?? 0) > 0)) return `${swiftIdent(flowName)}.${method} { ${param} in ${typeName}(${names.map((name) => `${name}: ${values.has(name) ? host.expr(values.get(name)!, indent) : `${param}.${name}`}`).join(', ')}) }`
          }
        }
        if (property === 'measurements' && e.args.length === 1) {
          const arg = resolveSwiftStaticFlowValue(e.args[0]!)
          if (e.callee.property === 'set' && arg.kind === 'new-collection' && arg.collection === 'map' && (arg.entries?.length ?? 0) === 0) {
            return `${swiftIdent(flowName)}.replaceMeasurements([:])`
          }
          if (e.callee.property === 'set') {
            return `${swiftIdent(flowName)}.replaceMeasurements(${host.expr(arg, indent)})`
          }
          if (e.callee.property === 'update' && arg.kind === 'arrow') {
            return `${swiftIdent(flowName)}.updateMeasurements(${host.expr(arg, indent)})`
          }
        }
        host.warn(flowSignalWriteWarning(flowName, property, e.callee.property))
      }
// PyreonFlowState PROPERTY reads: web `flow.nodes()` / `flow.edges()` /
      // `flow.viewport()` / `flow.zoom()` are Signal/Computed accessor CALLS —
      // the native @Observable class exposes them as stored/computed Swift
      // properties, so the parens must drop (mirrors the table `page`/
      // `sortColumn` rewrite immediately above). `selectedNodes()`/
      // `selectedEdges()` stay METHODS on the Swift port (named that way on
      // purpose, matching the web CALL syntax with no rewrite needed) —
      // deliberately absent from this list.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        host.isFlowState(e.callee.object.name) &&
        e.args.length === 0 &&
        LOWERED_FLOW_PROPERTY_READS.has(e.callee.property)
      ) {
        const nativeName = e.callee.property === 'nodeMap' ? 'nodeLookup' : e.callee.property === 'edgeMap' ? 'edgeLookup' : e.callee.property
        return `${swiftIdent(e.callee.object.name)}.${swiftIdent(nativeName)}`
      }
  return undefined
}

/** A member read rooted at a flow binding (`flow.config.zoom`, `flow.nodeMap().size`). */
export function lowerSwiftFlowMember(e: MemberExprIR, _indent: number): string | undefined {
if (
        e.object.kind === 'member' && e.object.property === 'config' &&
        e.object.object.kind === 'identifier' && host.isFlowState(e.object.object.name)
      ) {
        const nativeProperty = LOWERED_FLOW_CONFIG_PROPERTIES.get(e.property)
        if (nativeProperty !== undefined) return `${swiftIdent(e.object.object.name)}.${nativeProperty}`
        host.warn(`createFlow binding \`${e.object.object.name}\`: \`config.${e.property}\` is not represented by the native Flow configuration.`)
      }
if (
        e.property === 'size' &&
        e.object.kind === 'call' &&
        e.object.args.length === 0 &&
        e.object.callee.kind === 'member' &&
        e.object.callee.object.kind === 'identifier' &&
        host.isFlowState(e.object.callee.object.name) &&
        ['nodeMap', 'edgeMap', 'measurements'].includes(e.object.callee.property)
      ) {
        const webName = e.object.callee.property
        const nativeName = webName === 'nodeMap' ? 'nodeLookup' : webName === 'edgeMap' ? 'edgeLookup' : webName
        return `${swiftIdent(e.object.callee.object.name)}.${nativeName}.count`
      }
  return undefined
}

/** `MarkerType.Arrow` / `MarkerType.ArrowClosed` → the marker-type string the runtime expects. */
export function lowerSwiftMarkerType(e: MemberExprIR): string | undefined {
  if (e.object.kind === 'identifier' && e.object.name === 'MarkerType' && (e.property === 'Arrow' || e.property === 'ArrowClosed')) {
          return JSON.stringify(e.property.toLowerCase())
        }
  return undefined
}
