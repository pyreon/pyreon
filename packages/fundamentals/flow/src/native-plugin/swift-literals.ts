/**
 * Literal helpers for the Swift flow lowering: node / edge / marker / handle / position
 * literals and the path-helper calls, moved verbatim from the compiler's Swift emitter.
 */
import { type ExprIR, isNumericLiteralOrNegation, swiftStr } from '@pyreon/native-compiler/plugin-api'
import { type StaticFlowHandle } from './collect'
import { HANDLED_FLOW_EDGE_FIELDS, HANDLED_FLOW_NODE_FIELDS, SWIFT_FLOW_STATE_INIT_LABELS, addEdgeDropWarnings, droppedFlowFieldsWarning } from './lowering'
import { host } from './swift-facade'

export const SWIFT_FLOW_INIT_RANK: ReadonlyMap<string, number> = new Map(SWIFT_FLOW_STATE_INIT_LABELS.map((label, i) => [label, i]))

/** Declaration rank of one `label: value` init argument; an unknown label sorts last (and fails swiftc loudly). */
export function swiftFlowInitRank(arg: string): number {
  return SWIFT_FLOW_INIT_RANK.get(arg.slice(0, arg.indexOf(':')).trim()) ?? Number.MAX_SAFE_INTEGER
}

export function swiftFlowMarker(marker: { type: string; color?: string; width?: number; height?: number; strokeWidth?: number }): string {
  const args = [`type: ${swiftStr(marker.type)}`]
  if (marker.color !== undefined) args.push(`color: ${swiftStr(marker.color)}`)
  if (marker.width !== undefined) args.push(`width: ${marker.width}`)
  if (marker.height !== undefined) args.push(`height: ${marker.height}`)
  if (marker.strokeWidth !== undefined) args.push(`strokeWidth: ${marker.strokeWidth}`)
  return `PyreonFlowMarker(${args.join(', ')})`
}

export function swiftFlowMarkerLiteral(expr: ExprIR): string | null {
  if (expr.kind === 'literal' && expr.value === null) return 'nil'
  if (expr.kind === 'literal' && typeof expr.value === 'string') return swiftFlowMarker({ type: expr.value.toLowerCase() })
  if (expr.kind === 'member') return swiftFlowMarker({ type: expr.property.toLowerCase() })
  if (expr.kind !== 'object') return null
  const field = (name: string) => expr.fields.find((f) => f.name === name)?.value
  const type = field('type')
  const typeName = type?.kind === 'literal' && typeof type.value === 'string' ? type.value.toLowerCase() : type?.kind === 'member' ? type.property.toLowerCase() : null
  if (typeName !== 'arrow' && typeName !== 'arrowclosed') return null
  const args = [`type: ${swiftStr(typeName)}`]
  for (const name of ['color', 'width', 'height', 'strokeWidth'] as const) { const value = field(name); if (value) args.push(`${name}: ${host.expr(value, 0)}`) }
  return `PyreonFlowMarker(${args.join(', ')})`
}

export function swiftFlowHandlesLiteral(arg: ExprIR): string | null {
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
  return swiftFlowParsedHandles(parsed)
}

export function swiftFlowDataValue(expr: ExprIR): string | null {
  if (expr.kind === 'literal') {
    if (expr.value === null) return '.null'
    if (typeof expr.value === 'string') return `.string(${JSON.stringify(expr.value)})`
    if (typeof expr.value === 'number') return `.number(${expr.value})`
    if (typeof expr.value === 'boolean') return `.bool(${expr.value})`
    return null
  }
  if (expr.kind === 'array') {
    const values = expr.elements.map(swiftFlowDataValue)
    return values.some((value) => value === null) ? null : `.array([${values.join(', ')}])`
  }
  if (expr.kind === 'object' && (expr.spreads?.length ?? 0) === 0) {
    const values = expr.fields.map((field) => {
      const value = swiftFlowDataValue(field.value)
      return value === null ? null : `${JSON.stringify(field.name)}: ${value}`
    })
    return values.some((value) => value === null) ? null : `.object(PyreonFlowData([${values.join(', ')}]))`
  }
  return null
}

export function swiftFlowData(expr: ExprIR): string | null {
  if (expr.kind !== 'object' || (expr.spreads?.length ?? 0) > 0) return null
  const values = expr.fields.map((field) => {
    const value = swiftFlowDataValue(field.value)
    return value === null ? null : `${JSON.stringify(field.name)}: ${value}`
  })
  return values.some((value) => value === null) ? null : `PyreonFlowData([${values.join(', ')}])`
}

/** Names every literal field the native node/edge type does not carry. */
export function warnDroppedFlowFields(site: string, kind: 'node' | 'edge', lit: ExprIR): void {
  if (lit.kind !== 'object') return
  const handled = kind === 'node' ? HANDLED_FLOW_NODE_FIELDS : HANDLED_FLOW_EDGE_FIELDS
  const dropped = lit.fields.map((f) => f.name).filter((n) => !handled.has(n))
  if (dropped.length > 0) host.warn(droppedFlowFieldsWarning(site, kind, dropped))
}

/** `undefined` / `null` in a Swift argument position. */
export function isNilArg(x: ExprIR): boolean {
  return (x.kind === 'literal' && x.value === null) || (x.kind === 'identifier' && x.name === 'undefined') || (x.kind as string) === 'null' || (x.kind as string) === 'undefined'
}

/**
 * `addNode({...})` — construct a `PyreonFlowNode(...)` from a call-site
 * object literal. Same field walk as the decl-time recognizer
 * (`tryDeclFromCreateFlow` in parse.ts), but over an already-parsed `ExprIR`
 * rather than a raw AST node, and returning `null` (never warning) for any
 * shape it doesn't recognize — the caller falls through to generic emission,
 * which is correct for the common non-literal case (an identifier already
 * holding a `PyreonFlowNode`).
 */
export function swiftFlowNodeLiteral(arg: ExprIR, flowName: string): string | null {
  if (arg.kind !== 'object') return null
  warnDroppedFlowFields(`createFlow binding \`${flowName}\` addNode(...)`, 'node', arg)
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
  const extent = extentExpr ? swiftFlowNodeExtentArgs(extentExpr) : null
  if (extentExpr && !extent) host.warn(`createFlow binding \`${flowName}\` addNode(...): node field \`extent\` must be \`'parent'\` or a static [[minX, minY], [maxX, maxY]] tuple on native targets.`)
  const beforeExtentFields = ['draggable', 'selectable', 'connectable', 'focusable', 'ariaLabel', 'hidden', 'deletable'] as const
  const afterExtentFields = ['expandParent', 'group'] as const
  const parts = [
    `id: ${host.expr(idExpr, 0)}`,
    ...(typeExpr ? [`type: ${host.expr(typeExpr, 0)}`] : []),
    `position: PyreonXYPosition(x: ${swiftFlowCoord(posX)}, y: ${swiftFlowCoord(posY)})`,
    `data: ${host.expr(dataExpr, 0)}`,
    ...(widthExpr ? [`width: ${host.expr(widthExpr, 0)}`] : []),
    ...(heightExpr ? [`height: ${host.expr(heightExpr, 0)}`] : []),
    ...beforeExtentFields.flatMap((name) => {
      const value = field(name)
      return value ? [`${name}: ${host.expr(value, 0)}`] : []
    }),
    ...(field('class') ? [`className: ${host.expr(field('class')!, 0)}`] : []),
    ...(field('style') ? [`style: ${host.expr(field('style')!, 0)}`] : []),
    ...(field('parentId') ? [`parentId: ${host.expr(field('parentId')!, 0)}`] : []),
    ...(extent ? extent : []),
    ...afterExtentFields.flatMap((name) => {
      const value = field(name)
      return value ? [`${name}: ${host.expr(value, 0)}`] : []
    }),
    ...(sourceHandlesExpr ? [`sourceHandles: ${swiftFlowHandlesLiteral(sourceHandlesExpr) ?? host.expr(sourceHandlesExpr, 0)}`] : []),
    ...(targetHandlesExpr ? [`targetHandles: ${swiftFlowHandlesLiteral(targetHandlesExpr) ?? host.expr(targetHandlesExpr, 0)}`] : []),
    ...(field('zIndex') ? [`zIndex: Double(${host.expr(field('zIndex')!, 0)})`] : []),
  ]
  return `PyreonFlowNode(${parts.join(', ')})`
}

export function swiftFlowNodeExtentArgs(expr: ExprIR): string[] | null {
  if (expr.kind === 'literal' && expr.value === 'parent') return ['extentParent: true']
  const args = swiftFlowExtentLiteral(expr)
  return args ? [`extent: PyreonFlowNodeExtent(${args})`] : null
}

export function swiftFlowParsedHandles(handles: StaticFlowHandle[]): string {
  return `[${handles.map((h) => `PyreonFlowHandleConfig(${h.id === undefined ? '' : `id: ${swiftStr(h.id)}, `}type: ${swiftStr(h.type)}, position: .${h.position}${'offset' in h && typeof h.offset === 'number' ? `, offset: ${h.offset}` : ''})`).join(', ')}]`
}

/** `addEdge({...})` — the `PyreonFlowEdge` twin of `swiftFlowNodeLiteral`. */
export function swiftFlowEdgeLiteral(arg: ExprIR, flowName: string): string | null {
  if (arg.kind !== 'object') return null
  warnDroppedFlowFields(`createFlow binding \`${flowName}\` addEdge(...)`, 'edge', arg)
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
  for (const w of addEdgeDropWarnings(flowName, { pathOptions: pathOptionsExpr, markerStart: markerStartExpr, markerEnd: markerEndExpr }, (m) => swiftFlowMarkerLiteral(m) !== null)) host.warn(w)
  const portableData = dataExpr ? swiftFlowData(dataExpr) : null
  if (dataExpr && portableData === null) host.warn(`createFlow binding \`${flowName}\` addEdge(...): edge \`data\` must be a static JSON-compatible object to lower natively.`)
  const leadingFields = ['sourceHandle', 'targetHandle'] as const
  const interactionFields = ['focusable', 'ariaLabel', 'hidden', 'deletable', 'reconnectable', 'interactionWidth'] as const
  const parts = [
    `id: ${idExpr ? host.expr(idExpr, 0) : `pyreonFlowEdgeId(source: ${host.expr(sourceExpr, 0)}, target: ${host.expr(targetExpr, 0)}${field('sourceHandle') ? `, sourceHandle: ${host.expr(field('sourceHandle')!, 0)}` : ''}${field('targetHandle') ? `, targetHandle: ${host.expr(field('targetHandle')!, 0)}` : ''})`}`,
    `source: ${host.expr(sourceExpr, 0)}`,
    `target: ${host.expr(targetExpr, 0)}`,
    ...leadingFields.flatMap((name) => { const value = field(name); return value ? [`${name}: ${host.expr(value, 0)}`] : [] }),
    ...(typeExpr ? [`type: ${host.expr(typeExpr, 0)}`] : []),
    ...(labelExpr ? [`label: ${host.expr(labelExpr, 0)}`] : []),
    ...(animatedExpr ? [`animated: ${host.expr(animatedExpr, 0)}`, 'animatedSpecified: true'] : []),
    ...interactionFields.flatMap((name) => { const value = field(name); return value ? [`${name}: ${host.expr(value, 0)}`] : [] }),
    ...(field('class') ? [`className: ${host.expr(field('class')!, 0)}`] : []),
    ...(field('style') ? [`style: ${host.expr(field('style')!, 0)}`] : []),
    ...(portableData ? [`data: ${portableData}`] : []),
    ...(pathOptionsExpr?.kind === 'object' ? pathOptionsExpr.fields.flatMap(({ name, value }) => {
      const nativeName = name === 'offset' ? 'pathOffset' : name
      return ['curvature', 'borderRadius', 'pathOffset'].includes(nativeName) ? [`${nativeName}: ${host.expr(value, 0)}`] : []
    }) : []),
    ...(markerStartExpr ? (() => { const marker = swiftFlowMarkerLiteral(markerStartExpr); return marker && marker !== 'nil' ? [`markerStart: ${marker}`] : [] })() : []),
    ...(markerEndExpr ? (() => { const marker = swiftFlowMarkerLiteral(markerEndExpr); return marker ? [`markerEnd: ${marker}`, 'markerEndSpecified: true'] : [] })() : []),
    ...(waypointsExpr ? (() => {
      const value = swiftFlowPositionsLiteral(waypointsExpr)
      return [`waypoints: ${value ?? host.expr(waypointsExpr, 0)}`]
    })() : []),
    ...(field('zIndex') ? [`zIndex: Double(${host.expr(field('zIndex')!, 0)})`] : []),
  ]
  return `PyreonFlowEdge(${parts.join(', ')})`
}

export function swiftFlowNodeListLiteral(arg: ExprIR, flowName: string): string | null {
  if (arg.kind !== 'array') return null
  const nodes = arg.elements.map((item) => swiftFlowNodeLiteral(item, flowName))
  return nodes.some((node) => node === null) ? null : `[${nodes.join(', ')}]`
}

export function swiftFlowEdgeListLiteral(arg: ExprIR, flowName: string): string | null {
  if (arg.kind !== 'array') return null
  const edges = arg.elements.map((item) => swiftFlowEdgeLiteral(item, flowName))
  return edges.some((edge) => edge === null) ? null : `[${edges.join(', ')}]`
}

export function swiftFlowPositionsLiteral(arg: ExprIR): string | null {
  if (arg.kind !== 'array') return null
  const values: string[] = []
  for (const item of arg.elements) {
    const value = swiftFlowPositionLiteral(item)
    if (value === null) return null
    values.push(value)
  }
  return `[${values.join(', ')}]`
}

export function swiftFlowReconnectLiteral(arg: ExprIR): string | null {
  if (arg.kind !== 'object') return null
  const allowed = new Set(['source', 'target', 'sourceHandle', 'targetHandle'])
  if (arg.fields.some((field) => !allowed.has(field.name))) return null
  return arg.fields.map((field) => `, ${field.name}: ${host.expr(field.value, 0)}`).join('')
}

export function swiftFlowConnectionLiteral(arg: ExprIR): string | null {
  if (arg.kind !== 'object') return null
  const field = (name: string): ExprIR | undefined => arg.fields.find((f) => f.name === name)?.value
  const source = field('source'), target = field('target')
  if (source === undefined || target === undefined) return null
  const sourceHandle = field('sourceHandle'), targetHandle = field('targetHandle')
  return `PyreonFlowConnection(source: ${host.expr(source, 0)}, target: ${host.expr(target, 0)}${sourceHandle ? `, sourceHandle: ${host.expr(sourceHandle, 0)}` : ''}${targetHandle ? `, targetHandle: ${host.expr(targetHandle, 0)}` : ''})`
}

export const FLOW_VIEWPORT_KEYS: readonly string[] = ['x', 'y', 'zoom', 'duration']

export const FLOW_SET_CENTER_KEYS: readonly string[] = ['zoom', 'duration']

/**
 * `setViewport` takes `{ x, y, zoom, duration }`; `setCenter(x, y, opts)` takes
 * only `{ zoom, duration }` (its position is the first two arguments, and the
 * native init has no `x`/`y` labels there), so the accepted keys are the
 * caller's.
 */
export function swiftFlowViewportLiteral(arg: ExprIR, keys: readonly string[] = FLOW_VIEWPORT_KEYS): string | null {
  if (arg.kind !== 'object') return null
  const allowed = new Set(keys)
  if (arg.fields.some((field) => !allowed.has(field.name))) return null
  return arg.fields.map((field) => `${field.name}: ${host.expr(field.value, 0)}`).join(', ')
}

export function resolveSwiftStaticFlowValue(arg: ExprIR): ExprIR {
  let value = host.inlineConsts(arg)
  const seen = new Set<string>()
  for (;;) {
    while (value.kind === 'paren') value = value.inner
    if (value.kind !== 'identifier' || seen.has(value.name)) return value
    const next = host.constExpr(value.name)
    if (next === undefined) return value
    seen.add(value.name)
    value = host.inlineConsts(next)
  }
}

export function swiftFlowDurationOption(arg: ExprIR | undefined): string | null | undefined {
  if (arg === undefined) return undefined
  if (arg.kind !== 'object' || arg.fields.some((field) => field.name !== 'duration')) return null
  const duration = arg.fields.find((field) => field.name === 'duration')?.value
  return duration === undefined ? undefined : host.expr(duration, 0)
}

export function swiftFlowLayoutOptions(arg: ExprIR | undefined, indent: number): string | null | undefined {
  if (arg === undefined) return undefined
  if (arg.kind !== 'object' || (arg.spreads?.length ?? 0) > 0) return null
  const supported = new Set(['direction', 'nodeSpacing', 'layerSpacing', 'animate', 'animationDuration'])
  if (arg.fields.some((field) => !supported.has(field.name))) return null
  const fields = arg.fields.map(({ name, value }) => `${name}: ${host.expr(value, indent)}`)
  return `PyreonFlowLayoutOptions(${fields.join(', ')})`
}

export const FLOW_PATH_HELPERS = new Set(['getBezierPath', 'getSmoothStepPath', 'getStepPath', 'getStraightPath', 'getWaypointPath'])

export function swiftFlowPositionExpr(value: ExprIR): string | null {
  if (value.kind === 'member' && value.object.kind === 'identifier' && value.object.name === 'Position') return `.${value.property.toLowerCase()}`
  if (value.kind === 'literal' && typeof value.value === 'string' && ['top', 'right', 'bottom', 'left'].includes(value.value)) return `.${value.value}`
  if (value.kind === 'call') return host.expr(value, 0)
  return null
}

export function swiftFlowGeometryLiteral(arg: ExprIR, fields: readonly string[], typeName: string, indent: number): string | null {
  if (arg.kind !== 'object' || (arg.spreads?.length ?? 0) > 0 || arg.fields.length !== fields.length) return null
  const values = new Map(arg.fields.map((field) => [field.name, field.value]))
  if (fields.some((field) => !values.has(field))) return null
  return `${typeName}(${fields.map((field) => `${field}: ${host.expr(values.get(field)!, indent)}`).join(', ')})`
}

export function swiftFlowPathHelper(name: string, arg: ExprIR | undefined, indent: number): string | null {
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
  const required = (key: string): string | null => fields.has(key) ? host.expr(fields.get(key)!, indent) : null
  const sx = required('sourceX'), sy = required('sourceY'), tx = required('targetX'), ty = required('targetY')
  if (sx === null || sy === null || tx === null || ty === null) return null
  const position = (key: string, fallback: string): string | null => {
    const value = fields.get(key)
    if (value === undefined) return fallback
    return swiftFlowPositionExpr(value)
  }
  if (name === 'getStraightPath') return `pyreonStraightPath(sourceX: ${sx}, sourceY: ${sy}, targetX: ${tx}, targetY: ${ty})`
  if (name === 'getWaypointPath') {
    const waypoints = fields.get('waypoints')
    if (waypoints?.kind !== 'array') return null
    const points = waypoints.elements.map((point) => {
      if (point.kind !== 'object') return null
      const x = point.fields.find((field) => field.name === 'x')?.value
      const y = point.fields.find((field) => field.name === 'y')?.value
      return x && y ? `PyreonXYPosition(x: ${swiftFlowCoord(x, indent)}, y: ${swiftFlowCoord(y, indent)})` : null
    })
    if (points.some((point) => point === null)) return null
    return `pyreonWaypointPath(sourceX: ${sx}, sourceY: ${sy}, targetX: ${tx}, targetY: ${ty}, waypoints: [${points.join(', ')}])`
  }
  const sourcePosition = position('sourcePosition', '.bottom'), targetPosition = position('targetPosition', '.top')
  if (sourcePosition === null || targetPosition === null) return null
  const common = `sourceX: ${sx}, sourceY: ${sy}, sourcePosition: ${sourcePosition}, targetX: ${tx}, targetY: ${ty}, targetPosition: ${targetPosition}`
  if (name === 'getBezierPath') return `pyreonBezierPath(${common}${fields.has('curvature') ? `, curvature: ${host.expr(fields.get('curvature')!, indent)}` : ''})`
  const extra = [
    ...(name === 'getSmoothStepPath' && fields.has('borderRadius') ? [`borderRadius: ${host.expr(fields.get('borderRadius')!, indent)}`] : []),
    ...(fields.has('offset') ? [`offset: ${host.expr(fields.get('offset')!, indent)}`] : []),
  ]
  return `${name === 'getStepPath' ? 'pyreonStepPath' : 'pyreonSmoothStepPath'}(${common}${extra.length ? `, ${extra.join(', ')}` : ''})`
}

export function swiftFlowExtentLiteral(arg: ExprIR): string | null {
  if (arg.kind !== 'array' || arg.elements.length !== 2) return null
  const [minPoint, maxPoint] = arg.elements
  if (minPoint?.kind !== 'array' || maxPoint?.kind !== 'array' || minPoint.elements.length !== 2 || maxPoint.elements.length !== 2) return null
  return `minX: ${host.expr(minPoint.elements[0]!, 0)}, minY: ${host.expr(minPoint.elements[1]!, 0)}, maxX: ${host.expr(maxPoint.elements[0]!, 0)}, maxY: ${host.expr(maxPoint.elements[1]!, 0)}`
}

/** `updateNodePosition(id, {x, y})` — the `PyreonXYPosition` twin. */
export function swiftFlowPositionLiteral(arg: ExprIR): string | null {
  if (arg.kind !== 'object') return null
  const x = arg.fields.find((f) => f.name === 'x')?.value
  const y = arg.fields.find((f) => f.name === 'y')?.value
  if (!x || !y) return null
  return `PyreonXYPosition(x: ${swiftFlowCoord(x)}, y: ${swiftFlowCoord(y)})`
}

/**
 * A flow coordinate as a Swift Double. A literal already converts; an integer
 * EXPRESSION (`col * 200` in a loop) does not, and `Double(_:)` is identity on
 * a Double, so a non-literal is wrapped without needing its inferred type.
 */
export function swiftFlowCoord(x: ExprIR, indent = 0): string {
  const text = host.expr(x, indent)
  return isNumericLiteralOrNegation(x) ? text : `Double(${text})`
}
