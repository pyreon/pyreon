/**
 * Literal helpers for the Kotlin flow lowering: node / edge / marker / handle / position
 * literals and the path-helper calls, moved verbatim from the compiler's Kotlin emitter.
 */
import { type ExprIR, isNumericLiteralOrNegation, kotlinStr } from '@pyreon/native-compiler/plugin-api'
import { type StaticFlowHandle } from './collect'
import { host } from './kotlin-facade'
import { HANDLED_FLOW_EDGE_FIELDS, HANDLED_FLOW_NODE_FIELDS, addEdgeDropWarnings, droppedFlowFieldsWarning } from './lowering'

export function kotlinFlowMarker(marker: { type: string; color?: string; width?: number; height?: number; strokeWidth?: number }): string {
  const args = [kotlinStr(marker.type)]
  if (marker.color !== undefined) args.push(`color = ${kotlinStr(marker.color)}`)
  if (marker.width !== undefined) args.push(`width = ${ktChartDouble(String(marker.width))}`)
  if (marker.height !== undefined) args.push(`height = ${ktChartDouble(String(marker.height))}`)
  if (marker.strokeWidth !== undefined) args.push(`strokeWidth = ${ktChartDouble(String(marker.strokeWidth))}`)
  return `PyreonFlowMarker(${args.join(', ')})`
}

export function kotlinFlowMarkerLiteral(expr: ExprIR): string | null {
  if (expr.kind === 'literal' && expr.value === null) return 'null'
  if (expr.kind === 'literal' && typeof expr.value === 'string') return kotlinFlowMarker({ type: expr.value.toLowerCase() })
  if (expr.kind === 'member') return kotlinFlowMarker({ type: expr.property.toLowerCase() })
  if (expr.kind !== 'object') return null
  const field = (name: string) => expr.fields.find((f) => f.name === name)?.value
  const type = field('type')
  const typeName = type?.kind === 'literal' && typeof type.value === 'string' ? type.value.toLowerCase() : type?.kind === 'member' ? type.property.toLowerCase() : null
  if (typeName !== 'arrow' && typeName !== 'arrowclosed') return null
  const args = [kotlinStr(typeName)]
  const color = field('color'); if (color) args.push(`color = ${host.expr(color, 0)}`)
  for (const name of ['width', 'height', 'strokeWidth'] as const) { const value = field(name); if (value) args.push(`${name} = ${ktChartDouble(host.expr(value, 0))}`) }
  return `PyreonFlowMarker(${args.join(', ')})`
}

export function kotlinFlowHandlesLiteral(arg: ExprIR): string | null {
  if (arg.kind !== 'array') return null
  const parsed: { id?: string; type: string; position: string }[] = []
  for (const item of arg.elements) {
    if (item.kind !== 'object') return null
    const field = (name: string) => item.fields.find((f) => f.name === name)?.value
    const type = field('type'), position = field('position'), id = field('id')
    if (type?.kind !== 'literal' || typeof type.value !== 'string') return null
    const positionName = position?.kind === 'literal' && typeof position.value === 'string' ? position.value.toLowerCase() : position?.kind === 'member' ? position.property.toLowerCase() : undefined
    if (!positionName || !['top', 'right', 'bottom', 'left'].includes(positionName) || (id && (id.kind !== 'literal' || typeof id.value !== 'string'))) return null
    parsed.push({ type: type.value, position: positionName, ...(id?.kind === 'literal' ? { id: id.value as string } : {}) })
  }
  return kotlinFlowParsedHandles(parsed)
}

export function kotlinFlowDataValue(expr: ExprIR): string | null {
  if (expr.kind === 'literal') {
    if (expr.value === null) return 'PyreonFlowDataValue.NullValue'
    if (typeof expr.value === 'string') return `PyreonFlowDataValue.StringValue(${JSON.stringify(expr.value)})`
    if (typeof expr.value === 'number') return `PyreonFlowDataValue.NumberValue(${ktChartDouble(String(expr.value))})`
    if (typeof expr.value === 'boolean') return `PyreonFlowDataValue.BoolValue(${expr.value})`
    return null
  }
  if (expr.kind === 'array') {
    const values = expr.elements.map(kotlinFlowDataValue)
    return values.some((value) => value === null) ? null : `PyreonFlowDataValue.ArrayValue(listOf(${values.join(', ')}))`
  }
  if (expr.kind === 'object' && (expr.spreads?.length ?? 0) === 0) {
    const data = kotlinFlowData(expr)
    return data === null ? null : `PyreonFlowDataValue.ObjectValue(${data})`
  }
  return null
}

export function kotlinFlowData(expr: ExprIR): string | null {
  if (expr.kind !== 'object' || (expr.spreads?.length ?? 0) > 0) return null
  const values = expr.fields.map((field) => {
    const value = kotlinFlowDataValue(field.value)
    return value === null ? null : `${JSON.stringify(field.name)} to ${value}`
  })
  return values.some((value) => value === null) ? null : `PyreonFlowData(mapOf(${values.join(', ')}))`
}

/** Names every literal field the native node/edge type does not carry. */
export function warnDroppedFlowFieldsKt(site: string, kind: 'node' | 'edge', lit: ExprIR): void {
  if (lit.kind !== 'object') return
  const handled = kind === 'node' ? HANDLED_FLOW_NODE_FIELDS : HANDLED_FLOW_EDGE_FIELDS
  const dropped = lit.fields.map((f) => f.name).filter((n) => !handled.has(n))
  if (dropped.length > 0) host.warn(droppedFlowFieldsWarning(site, kind, dropped))
}

/**
 * `addNode({...})` — construct a `PyreonFlowNode(...)` from a call-site
 * object literal. Kotlin twin of `swiftFlowNodeLiteral` (emit-swift.ts) —
 * same reasoning: the generic object-literal path would synthesize its own
 * unrelated `__ObjN` data class (same field names, different NOMINAL type),
 * which Kotlin's type system rejects just as Swift's does. Returns `null`
 * (never warns) for any shape it doesn't recognize; the caller falls
 * through to generic emission — correct for a non-literal argument (an
 * identifier already holding a `PyreonFlowNode`).
 */
export function kotlinFlowNodeLiteral(arg: ExprIR, flowName: string): string | null {
  if (arg.kind !== 'object') return null
  warnDroppedFlowFieldsKt(`createFlow binding \`${flowName}\` addNode(...)`, 'node', arg)
  const field = (n: string): ExprIR | undefined => arg.fields.find((f) => f.name === n)?.value
  const idExpr = field('id')
  const posExpr = field('position')
  const dataExpr = field('data')
  if (!idExpr || !posExpr || posExpr.kind !== 'object' || !dataExpr) return null
  const posX = posExpr.fields.find((f) => f.name === 'x')?.value
  const posY = posExpr.fields.find((f) => f.name === 'y')?.value
  if (!posX || !posY) return null
  const typeExpr = field('type')
  const widthExpr = field('width')
  const heightExpr = field('height')
  const sourceHandlesExpr = field('sourceHandles')
  const targetHandlesExpr = field('targetHandles')
  const extentExpr = field('extent')
  const extent = extentExpr ? kotlinFlowNodeExtentArgs(extentExpr) : null
  if (extentExpr && !extent) host.warn(`createFlow binding \`${flowName}\` addNode(...): node field \`extent\` must be \`'parent'\` or a static [[minX, minY], [maxX, maxY]] tuple on native targets.`)
  const optionalFields = ['draggable', 'selectable', 'connectable', 'focusable', 'ariaLabel', 'hidden', 'deletable', 'style', 'parentId', 'expandParent', 'group'] as const
  const parts = [
    `id = ${host.expr(idExpr, 0)}`,
    ...(typeExpr ? [`type = ${host.expr(typeExpr, 0)}`] : []),
    `position = PyreonXYPosition(${kotlinFlowCoord(posX)}, ${kotlinFlowCoord(posY)})`,
    `data = ${host.expr(dataExpr, 0)}`,
    ...(widthExpr ? [`width = ${ktChartDouble(host.expr(widthExpr, 0))}`] : []),
    ...(heightExpr ? [`height = ${ktChartDouble(host.expr(heightExpr, 0))}`] : []),
    ...(field('zIndex') ? [`zIndex = ${ktChartDouble(host.expr(field('zIndex')!, 0))}`] : []),
    ...(extent ? extent : []),
    ...optionalFields.flatMap((name) => {
      const value = field(name)
      return value ? [`${name} = ${host.expr(value, 0)}`] : []
    }),
    ...(field('class') ? [`className = ${host.expr(field('class')!, 0)}`] : []),
    ...(sourceHandlesExpr ? [`sourceHandles = ${kotlinFlowHandlesLiteral(sourceHandlesExpr) ?? host.expr(sourceHandlesExpr, 0)}`] : []),
    ...(targetHandlesExpr ? [`targetHandles = ${kotlinFlowHandlesLiteral(targetHandlesExpr) ?? host.expr(targetHandlesExpr, 0)}`] : []),
  ]
  return `PyreonFlowNode(${parts.join(', ')})`
}

export function kotlinFlowNodeExtentArgs(expr: ExprIR): string[] | null {
  if (expr.kind === 'literal' && expr.value === 'parent') return ['extentParent = true']
  const args = kotlinFlowExtentLiteral(expr)
  return args ? [`extent = PyreonFlowNodeExtent(${args})`] : null
}

export function kotlinFlowParsedHandles(handles: StaticFlowHandle[]): string {
  const positionName = (position: string) => position[0]!.toUpperCase() + position.slice(1)
  return `listOf(${handles.map((h) => `PyreonFlowHandleConfig(${h.id === undefined ? '' : `id = ${kotlinStr(h.id)}, `}type = ${kotlinStr(h.type)}, position = PyreonFlowPosition.${positionName(h.position)}${'offset' in h && typeof h.offset === 'number' ? `, offset = ${ktChartDouble(String(h.offset))}` : ''})`).join(', ')})`
}

/** `addEdge({...})` — the `PyreonFlowEdge` twin of `kotlinFlowNodeLiteral`. */
export function kotlinFlowEdgeLiteral(arg: ExprIR, flowName: string): string | null {
  if (arg.kind !== 'object') return null
  warnDroppedFlowFieldsKt(`createFlow binding \`${flowName}\` addEdge(...)`, 'edge', arg)
  const field = (n: string): ExprIR | undefined => arg.fields.find((f) => f.name === n)?.value
  const sourceExpr = field('source')
  const targetExpr = field('target')
  if (!sourceExpr || !targetExpr) return null
  const idExpr = field('id')
  const typeExpr = field('type')
  const labelExpr = field('label')
  const animatedExpr = field('animated')
  const pathOptionsExpr = field('pathOptions')
  const markerStartExpr = field('markerStart')
  const markerEndExpr = field('markerEnd')
  const waypointsExpr = field('waypoints')
  const dataExpr = field('data')
  for (const w of addEdgeDropWarnings(flowName, { pathOptions: pathOptionsExpr, markerStart: markerStartExpr, markerEnd: markerEndExpr }, (m) => kotlinFlowMarkerLiteral(m) !== null)) host.warn(w)
  const portableData = dataExpr ? kotlinFlowData(dataExpr) : null
  if (dataExpr && portableData === null) host.warn(`createFlow binding \`${flowName}\` addEdge(...): edge \`data\` must be a static JSON-compatible object to lower natively.`)
  const optionalFields = ['sourceHandle', 'targetHandle', 'focusable', 'ariaLabel', 'hidden', 'deletable', 'reconnectable', 'style'] as const
  const interactionWidthExpr = field('interactionWidth')
  const parts = [
    `id = ${idExpr ? host.expr(idExpr, 0) : `pyreonFlowEdgeId(source = ${host.expr(sourceExpr, 0)}, target = ${host.expr(targetExpr, 0)}${field('sourceHandle') ? `, sourceHandle = ${host.expr(field('sourceHandle')!, 0)}` : ''}${field('targetHandle') ? `, targetHandle = ${host.expr(field('targetHandle')!, 0)}` : ''})`}`,
    `source = ${host.expr(sourceExpr, 0)}`,
    `target = ${host.expr(targetExpr, 0)}`,
    ...(typeExpr ? [`type = ${host.expr(typeExpr, 0)}`] : []),
    ...(labelExpr ? [`label = ${host.expr(labelExpr, 0)}`] : []),
    ...(animatedExpr ? [`animated = ${host.expr(animatedExpr, 0)}`] : []),
    ...(field('zIndex') ? [`zIndex = ${ktChartDouble(host.expr(field('zIndex')!, 0))}`] : []),
    ...(portableData ? [`data = ${portableData}`] : []),
    ...(pathOptionsExpr?.kind === 'object' ? pathOptionsExpr.fields.flatMap(({ name, value }) => {
      const nativeName = name === 'offset' ? 'pathOffset' : name
      return ['curvature', 'borderRadius', 'pathOffset'].includes(nativeName) ? [`${nativeName} = ${ktChartDouble(host.expr(value, 0))}`] : []
    }) : []),
    ...(markerStartExpr ? (() => { const marker = kotlinFlowMarkerLiteral(markerStartExpr); return marker && marker !== 'null' ? [`markerStart = ${marker}`] : [] })() : []),
    ...(markerEndExpr ? (() => { const marker = kotlinFlowMarkerLiteral(markerEndExpr); return marker ? [`markerEnd = ${marker}`, 'markerEndSpecified = true'] : [] })() : []),
    ...optionalFields.flatMap((name) => {
      const value = field(name)
      return value ? [`${name} = ${host.expr(value, 0)}`] : []
    }),
    ...(field('class') ? [`className = ${host.expr(field('class')!, 0)}`] : []),
    ...(interactionWidthExpr ? [`interactionWidth = ${ktChartDouble(host.expr(interactionWidthExpr, 0))}`] : []),
    ...(waypointsExpr ? (() => {
      const value = kotlinFlowPositionsLiteral(waypointsExpr)
      return [`waypoints = ${value ?? host.expr(waypointsExpr, 0)}`]
    })() : []),
  ]
  return `PyreonFlowEdge(${parts.join(', ')})`
}

export function kotlinFlowNodeListLiteral(arg: ExprIR, flowName: string): string | null {
  if (arg.kind !== 'array') return null
  const nodes = arg.elements.map((item) => kotlinFlowNodeLiteral(item, flowName))
  return nodes.some((node) => node === null) ? null : `listOf(${nodes.join(', ')})`
}

export function kotlinFlowEdgeListLiteral(arg: ExprIR, flowName: string): string | null {
  if (arg.kind !== 'array') return null
  const edges = arg.elements.map((item) => kotlinFlowEdgeLiteral(item, flowName))
  return edges.some((edge) => edge === null) ? null : `listOf(${edges.join(', ')})`
}

export function kotlinFlowPositionsLiteral(arg: ExprIR): string | null {
  if (arg.kind !== 'array') return null
  const values: string[] = []
  for (const item of arg.elements) {
    const value = kotlinFlowPositionLiteral(item)
    if (value === null) return null
    values.push(value)
  }
  return `listOf(${values.join(', ')})`
}

export function kotlinFlowReconnectLiteral(arg: ExprIR): string | null {
  if (arg.kind !== 'object') return null
  const allowed = new Set(['source', 'target', 'sourceHandle', 'targetHandle'])
  if (arg.fields.some((field) => !allowed.has(field.name))) return null
  return arg.fields.map((field) => `, ${field.name} = ${host.expr(field.value, 0)}`).join('')
}

export function kotlinFlowConnectionLiteral(arg: ExprIR): string | null {
  if (arg.kind !== 'object') return null
  const field = (name: string): ExprIR | undefined => arg.fields.find((f) => f.name === name)?.value
  const source = field('source'), target = field('target')
  if (source === undefined || target === undefined) return null
  const sourceHandle = field('sourceHandle'), targetHandle = field('targetHandle')
  return `PyreonFlowConnection(source = ${host.expr(source, 0)}, target = ${host.expr(target, 0)}${sourceHandle ? `, sourceHandle = ${host.expr(sourceHandle, 0)}` : ''}${targetHandle ? `, targetHandle = ${host.expr(targetHandle, 0)}` : ''})`
}

export const FLOW_VIEWPORT_KEYS: readonly string[] = ['x', 'y', 'zoom', 'duration']

export const FLOW_SET_CENTER_KEYS: readonly string[] = ['zoom', 'duration']

/**
 * `setViewport` takes `{ x, y, zoom, duration }`; `setCenter(x, y, opts)` takes
 * only `{ zoom, duration }` (its position is the first two arguments, and the
 * native init has no `x`/`y` labels there), so the accepted keys are the
 * caller's.
 */
export function kotlinFlowViewportLiteral(arg: ExprIR, keys: readonly string[] = FLOW_VIEWPORT_KEYS): string | null {
  if (arg.kind !== 'object') return null
  const allowed = new Set(keys)
  if (arg.fields.some((field) => !allowed.has(field.name))) return null
  return arg.fields.map((field) => `${field.name} = ${ktChartDouble(host.expr(field.value, 0))}`).join(', ')
}

export function resolveKotlinStaticFlowValue(arg: ExprIR): ExprIR {
  let value = arg
  const seen = new Set<string>()
  for (;;) {
    while (value.kind === 'paren') value = value.inner
    if (value.kind !== 'identifier' || seen.has(value.name)) return value
    const next = host.component().valueConsts.get(value.name) ?? host.constExpr(value.name)
    if (next === undefined) return value
    seen.add(value.name)
    value = next
  }
}

export function kotlinFlowDurationOption(arg: ExprIR | undefined): string | null | undefined {
  if (arg === undefined) return undefined
  if (arg.kind !== 'object' || arg.fields.some((field) => field.name !== 'duration')) return null
  const duration = arg.fields.find((field) => field.name === 'duration')?.value
  return duration === undefined ? undefined : ktChartDouble(host.expr(duration, 0))
}

export function kotlinFlowLayoutOptions(arg: ExprIR | undefined, indent: number): string | null | undefined {
  if (arg === undefined) return undefined
  if (arg.kind !== 'object' || (arg.spreads?.length ?? 0) > 0) return null
  const supported = new Set(['direction', 'nodeSpacing', 'layerSpacing', 'animate', 'animationDuration'])
  if (arg.fields.some((field) => !supported.has(field.name))) return null
  const fields = arg.fields.map(({ name, value }) => {
    const emitted = host.expr(value, indent)
    return `${name} = ${name === 'direction' || name === 'animate' ? emitted : ktChartDouble(emitted)}`
  })
  return `PyreonFlowLayoutOptions(${fields.join(', ')})`
}

export const FLOW_PATH_HELPERS_KOTLIN = new Set(['getBezierPath', 'getSmoothStepPath', 'getStepPath', 'getStraightPath', 'getWaypointPath'])

export function kotlinFlowPositionExpr(value: ExprIR): string | null {
  if (value.kind === 'member' && value.object.kind === 'identifier' && value.object.name === 'Position') return `PyreonFlowPosition.${value.property}`
  if (value.kind === 'literal' && typeof value.value === 'string' && ['top', 'right', 'bottom', 'left'].includes(value.value)) return `PyreonFlowPosition.${value.value[0]!.toUpperCase()}${value.value.slice(1)}`
  if (value.kind === 'call') return host.expr(value, 0)
  return null
}

export function kotlinFlowGeometryLiteral(arg: ExprIR, fields: readonly string[], typeName: string, indent: number): string | null {
  if (arg.kind !== 'object' || (arg.spreads?.length ?? 0) > 0 || arg.fields.length !== fields.length) return null
  const values = new Map(arg.fields.map((field) => [field.name, field.value]))
  if (fields.some((field) => !values.has(field))) return null
  return `${typeName}(${fields.map((field) => ktChartDouble(host.expr(values.get(field)!, indent))).join(', ')})`
}

export function kotlinFlowPathHelper(name: string, arg: ExprIR | undefined, indent: number): string | null {
  if (arg?.kind !== 'object' || (arg.spreads?.length ?? 0) > 0) return null
  const fields = new Map(arg.fields.map((field) => [field.name, field.value]))
  const commonFields = ['sourceX', 'sourceY', 'targetX', 'targetY']
  const optionalFields = name === 'getStraightPath' ? []
    : name === 'getWaypointPath' ? ['waypoints']
    : name === 'getBezierPath' ? ['sourcePosition', 'targetPosition', 'curvature']
    : name === 'getSmoothStepPath' ? ['sourcePosition', 'targetPosition', 'borderRadius', 'offset']
    : ['sourcePosition', 'targetPosition', 'offset']
  const allowed = new Set([...commonFields, ...optionalFields])
  if (arg.fields.some((field) => !allowed.has(field.name))) return null
  const required = (key: string): string | null => fields.has(key) ? ktChartDouble(host.expr(fields.get(key)!, indent)) : null
  const sx = required('sourceX'), sy = required('sourceY'), tx = required('targetX'), ty = required('targetY')
  if (sx === null || sy === null || tx === null || ty === null) return null
  const position = (key: string, fallback: string): string | null => {
    const value = fields.get(key)
    if (value === undefined) return fallback
    return kotlinFlowPositionExpr(value)
  }
  if (name === 'getStraightPath') return `pyreonStraightPath(${sx}, ${sy}, ${tx}, ${ty})`
  if (name === 'getWaypointPath') {
    const waypoints = fields.get('waypoints')
    if (waypoints?.kind !== 'array') return null
    const points = waypoints.elements.map((point) => {
      if (point.kind !== 'object') return null
      const x = point.fields.find((field) => field.name === 'x')?.value
      const y = point.fields.find((field) => field.name === 'y')?.value
      return x && y ? `PyreonFlowPathPoint(${ktChartDouble(host.expr(x, indent))}, ${ktChartDouble(host.expr(y, indent))})` : null
    })
    if (points.some((point) => point === null)) return null
    return `pyreonWaypointPath(${sx}, ${sy}, ${tx}, ${ty}, listOf(${points.join(', ')}))`
  }
  const sourcePosition = position('sourcePosition', 'PyreonFlowPosition.Bottom'), targetPosition = position('targetPosition', 'PyreonFlowPosition.Top')
  if (sourcePosition === null || targetPosition === null) return null
  const common = `${sx}, ${sy}, ${sourcePosition}, ${tx}, ${ty}, ${targetPosition}`
  if (name === 'getBezierPath') return `pyreonBezierPath(${common}${fields.has('curvature') ? `, curvature = ${ktChartDouble(host.expr(fields.get('curvature')!, indent))}` : ''})`
  const extra = [
    ...(name === 'getSmoothStepPath' && fields.has('borderRadius') ? [`borderRadius = ${ktChartDouble(host.expr(fields.get('borderRadius')!, indent))}`] : []),
    ...(fields.has('offset') ? [`offset = ${ktChartDouble(host.expr(fields.get('offset')!, indent))}`] : []),
  ]
  return `${name === 'getStepPath' ? 'pyreonStepPath' : 'pyreonSmoothStepPath'}(${common}${extra.length ? `, ${extra.join(', ')}` : ''})`
}

export function kotlinFlowExtentLiteral(arg: ExprIR): string | null {
  if (arg.kind !== 'array' || arg.elements.length !== 2) return null
  const [minPoint, maxPoint] = arg.elements
  if (minPoint?.kind !== 'array' || maxPoint?.kind !== 'array' || minPoint.elements.length !== 2 || maxPoint.elements.length !== 2) return null
  return `minX = ${ktChartDouble(host.expr(minPoint.elements[0]!, 0))}, minY = ${ktChartDouble(host.expr(minPoint.elements[1]!, 0))}, maxX = ${ktChartDouble(host.expr(maxPoint.elements[0]!, 0))}, maxY = ${ktChartDouble(host.expr(maxPoint.elements[1]!, 0))}`
}

/** `updateNodePosition(id, {x, y})` — the `PyreonXYPosition` twin. */
export function kotlinFlowPositionLiteral(arg: ExprIR): string | null {
  if (arg.kind !== 'object') return null
  const x = arg.fields.find((f) => f.name === 'x')?.value
  const y = arg.fields.find((f) => f.name === 'y')?.value
  if (!x || !y) return null
  return `PyreonXYPosition(${kotlinFlowCoord(x)}, ${kotlinFlowCoord(y)})`
}

/** Kotlin refuses Int literals for Double params — `height={200}` must emit `200.0`. */
/**
 * A flow coordinate as a Kotlin Double. `PyreonXYPosition` takes Doubles, and
 * an integer EXPRESSION (`col * 200` in a loop) does not widen implicitly, so
 * `ktChartDouble`'s literal-only rewrite left it an Int argument mismatch. A
 * non-literal is wrapped: `.toDouble()` is identity on a Double, so the wrap
 * needs no type inference to be safe.
 */
export function kotlinFlowCoord(x: ExprIR): string {
  const text = host.expr(x, 0)
  if (isNumericLiteralOrNegation(x)) return ktChartDouble(text.replace(/^\((-\d+L?)\)$/, '$1'))
  return `(${text}).toDouble()`
}

export function ktChartDouble(text: string): string {
  // An integer literal emits with the Long suffix (see KOTLIN_INT); a
  // Double position takes the digits with `.0` instead.
  const m = /^(-?\d+)L?$/.exec(text)
  return m ? `${m[1]}.0` : text
}
