/**
 * The Kotlin flow hosts: `<Flow>`, the controls / minimap / background it consumes, the
 * custom edge paths and the `<FlowWebView>` host. Moved verbatim from the compiler's Kotlin emitter.
 */
import { type ChildIR, type ExprIR, kotlinIdent, kotlinStr } from '@pyreon/native-compiler/plugin-api'
import { PALETTE_STROKE, planBaseEdge } from './base-edge'
import { host } from './kotlin-facade'
import { kotlinFlowParsedHandles, ktChartDouble } from './kotlin-literals'
import { FLOW_ARBITRARY_PATH_WARNING, HANDLED_FLOW_WEBVIEW_PROPS, NODE_RESIZER_FOREIGN_NODE_WARNING, classifyFlowPathMember, resolveStaticFlowRendererMap } from './lowering'
import { type FlowPathPaintValue, resolveFlowPathPaint } from './path-paint'
import { type FlowSvgNumber, planFlowSvg } from './svg'
import { DEFAULT_FLOW_WEBVIEW_HOST_HTML } from './webview-host.generated'

/**
 * Emit a `<WebView onMessage={…}>` handler as a Kotlin `(String) -> Unit`
 * lambda. The single param is the page-posted string. An arrow with a
 * param keeps it (`{ m -> … }`); a zero-param arrow ignores it
 * (`{ _ -> … }`); a bare function reference is called with the message.
 */
/**
 * The `modifier = …` arg for a WebView-family host: the generic layout tail
 * (`padding`/`margin`, `data-testid` → `Modifier.testTag`, a11y props) every
 * primitive gets. `PyreonWebView` accepts `modifier` on the real runtime AND
 * the stub; a host that omitted it was unselectable by `onNodeWithTag` — the
 * same class the `<Toggle>` emitter had. Empty when nothing applies.
 */
export function kotlinWebViewModifierArg(e: Extract<ExprIR, { kind: 'jsx-element' }>, omit?: ReadonlySet<string>): string {
  const chain = omit === undefined ? host.layoutModifiers(e) : host.layoutModifiersFor(e, omit)
  return chain === '' ? '' : `, modifier = ${chain}`
}

export function emitKotlinFlowHost(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'instance')
  if (attr === undefined || attr.kind !== 'attr' || attr.value === undefined) {
    host.warn('<Flow> requires `instance={flow}` for native lowering — the host was dropped.')
    return 'Box {}'
  }
  for (const name of ['style', 'class']) if (e.attrs.some((a) => a.kind === 'attr' && a.name === name)) host.warn(`<Flow ${name}> is browser CSS and is not applied to the native canvas; use native layout primitives around <Flow> for container sizing and decoration.`)
  const nodeTypesAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'nodeTypes')
  const nodeTypes = resolveStaticFlowRendererMap(nodeTypesAttr?.kind === 'attr' ? nodeTypesAttr.value : undefined, (name) => host.constExpr(name))
  if (nodeTypesAttr !== undefined && nodeTypes === undefined) {
    host.warn('<Flow nodeTypes={…}> must be a literal { type: Component } map to lower natively; the native default node renderer is used.')
  }
  for (const entry of nodeTypes ?? []) {
    if (host.flowFile().invalidHandles.has(entry.component)) host.warn(`<Flow nodeTypes> component \`${entry.component}\`: <Handle> requires literal \`type\` and \`position\` props for native extraction; the dynamic handle was not attached to the node.`)
    if (host.flowFile().invalidResizers.has(entry.component)) host.warn(`<Flow nodeTypes> component \`${entry.component}\`: <NodeResizer> size and edge-handle options must be literals for native extraction; dynamic values use native defaults.`)
    if (host.flowFile().foreignResizers.has(entry.component)) host.warn(NODE_RESIZER_FOREIGN_NODE_WARNING(entry.component))
    if (host.flowFile().invalidToolbars.has(entry.component)) host.warn(`<Flow nodeTypes> component \`${entry.component}\`: <NodeToolbar> requires literal position, align, offset, and showOnSelect props on native; unsupported values use native defaults.`)
  }
  const edgeTypesAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'edgeTypes')
  const edgeTypes = resolveStaticFlowRendererMap(edgeTypesAttr?.kind === 'attr' ? edgeTypesAttr.value : undefined, (name) => host.constExpr(name))
  if (edgeTypesAttr !== undefined && edgeTypes === undefined) {
    host.warn('<Flow edgeTypes={…}> must be a literal { type: Component } map to lower natively; the native default edge renderer is used.')
  }
  const connectionLineAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'connectionLine')
  const connectionLine = connectionLineAttr?.kind === 'attr' && connectionLineAttr.value?.kind === 'identifier'
    ? connectionLineAttr.value.name
    : undefined
  if (connectionLineAttr !== undefined && connectionLine === undefined) {
    host.warn('<Flow connectionLine={…}> must reference a component identifier to lower natively; the built-in connection line is used.')
  }
  const flowChildren = e.children.flatMap(function flatten(child): ChildIR[] {
    return child.kind === 'expr' && child.expr.kind === 'jsx-fragment'
      ? child.expr.children.flatMap(flatten)
      : [child]
  })
  const background = flowChildren
    .filter((child) => child.kind === 'expr' && child.expr.kind === 'jsx-element' && child.expr.tag === 'Background')
    .map((child) => child.kind === 'expr' ? child.expr : undefined)[0]
  const controls = flowChildren
    .filter((child) => child.kind === 'expr' && child.expr.kind === 'jsx-element' && child.expr.tag === 'Controls')
    .map((child) => child.kind === 'expr' ? child.expr : undefined)[0]
  const miniMap = flowChildren
    .filter((child) => child.kind === 'expr' && child.expr.kind === 'jsx-element' && child.expr.tag === 'MiniMap')
    .map((child) => child.kind === 'expr' ? child.expr : undefined)[0]
  const panels = flowChildren
    .filter((child) => child.kind === 'expr' && child.expr.kind === 'jsx-element' && child.expr.tag === 'Panel')
    .map((child) => child.kind === 'expr' ? child.expr : undefined)
    .filter((panel): panel is Extract<ExprIR, { kind: 'jsx-element' }> => panel?.kind === 'jsx-element')
  const otherChildren = flowChildren.filter((child) => !(child.kind === 'expr' && child.expr.kind === 'jsx-element' && (child.expr.tag === 'Background' || child.expr.tag === 'Controls' || child.expr.tag === 'MiniMap' || child.expr.tag === 'Panel')))
  const bgArg = background?.kind === 'jsx-element' ? `, background = ${emitKotlinFlowBackground(background)}` : ''
  const controlsArg = controls?.kind === 'jsx-element' ? `, controls = ${emitKotlinFlowControls(controls)}` : ''
  const controlsContentArg = controls?.kind === 'jsx-element' && controls.children.length > 0
    ? `, controlsContent = {\n${controls.children.map((child) => `    ${host.child(child, 4)}`).join('\n')}\n  }`
    : ''
  const miniMapArg = miniMap?.kind === 'jsx-element' ? `, miniMap = ${emitKotlinFlowMiniMap(miniMap)}` : ''
  const miniMapNodeColorAttr = miniMap?.kind === 'jsx-element' ? miniMap.attrs.find((a) => a.kind === 'attr' && a.name === 'nodeColor') : undefined
  const miniMapNodeColorValue = miniMapNodeColorAttr?.kind === 'attr' ? miniMapNodeColorAttr.value : undefined
  const miniMapNodeColorIsCallback = miniMapNodeColorValue?.kind === 'arrow' || (miniMapNodeColorValue?.kind === 'identifier' && (host.isFunctionName(miniMapNodeColorValue.name) || host.constExpr(miniMapNodeColorValue.name)?.kind === 'arrow'))
  const miniMapNodeColorArg = miniMapNodeColorValue !== undefined && miniMapNodeColorIsCallback
    ? `, miniMapNodeColor = ${host.expr(miniMapNodeColorValue, 0)}`
    : ''
  const ariaLabelAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'ariaLabel')
  const ariaLabelArg = ariaLabelAttr?.kind === 'attr' && ariaLabelAttr.value !== undefined ? `, ariaLabel = ${host.expr(ariaLabelAttr.value, 0)}` : ''
  const colorModeAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'colorMode')
  const colorModeArg = colorModeAttr?.kind === 'attr' && colorModeAttr.value !== undefined ? `, colorMode = ${host.expr(colorModeAttr.value, 0)}` : ''
  const handleCases = nodeTypes?.flatMap(({ type, component }) => {
    const handles = host.flowFile().handles.get(component) ?? []
    return handles.length > 0 ? [`${JSON.stringify(type)} -> ${kotlinFlowParsedHandles(handles)}`] : []
  }) ?? []
  const nodeHandlesArg = handleCases.length > 0
    ? `, nodeHandles = { pyreonNode ->\n    when (pyreonNode.type) {\n      ${handleCases.join('\n      ')}\n      else -> emptyList()\n    }\n  }`
    : ''
  const resizerCases = nodeTypes?.flatMap(({ type, component }) => {
    const config = host.flowFile().resizers.get(component)
    return config ? [`${JSON.stringify(type)} -> PyreonFlowNodeResizerConfig(minWidth = ${ktChartDouble(String(config.minWidth))}, minHeight = ${ktChartDouble(String(config.minHeight))}, handleSize = ${ktChartDouble(String(config.handleSize))}, showEdgeHandles = ${config.showEdgeHandles})`] : []
  }) ?? []
  const nodeResizerArg = resizerCases.length > 0
    ? `, nodeResizer = { pyreonNode ->\n    when (pyreonNode.type) {\n      ${resizerCases.join('\n      ')}\n      else -> null\n    }\n  }`
    : ''
  const toolbarCases = nodeTypes?.flatMap(({ type, component }) => {
    const configs = host.flowFile().toolbars.get(component)
    return configs?.length ? [`${JSON.stringify(type)} -> listOf(${configs.map((config) => `PyreonFlowNodeToolbarConfig(position = ${JSON.stringify(config.position)}, align = ${JSON.stringify(config.align)}, offset = ${ktChartDouble(String(config.offset))}, showOnSelect = ${config.showOnSelect}${config.selectedOverride === undefined ? '' : `, selectedOverride = ${config.selectedOverride}`}${config.nodeIdOverride === undefined ? '' : `, nodeIdOverride = ${JSON.stringify(config.nodeIdOverride)}`})`).join(', ')})`] : []
  }) ?? []
  const nodeToolbarConfigArg = toolbarCases.length > 0
    ? `, nodeToolbarConfigs = { pyreonNode ->\n    when (pyreonNode.type) {\n      ${toolbarCases.join('\n      ')}\n      else -> emptyList()\n    }\n  }`
    : ''
  const toolbarContentCases = nodeTypes?.flatMap(({ type, component }) => {
    const configs = host.flowFile().toolbars.get(component)
    return configs?.length ? [`${JSON.stringify(type)} -> when (pyreonToolbarIndex) {\n${configs.map((config, index) => `        ${index} -> ${kotlinIdent(config.contentComponent)}(id = pyreonNode.id, data = { pyreonNode.data }, selected = { pyreonSelected }, dragging = { pyreonDragging })`).join('\n')}\n        else -> Unit\n      }`] : []
  }) ?? []
  const nodeToolbarArg = toolbarContentCases.length > 0
    ? `, nodeToolbar = { pyreonNode, pyreonToolbarIndex, pyreonSelected, pyreonDragging ->\n    when (pyreonNode.type) {\n      ${toolbarContentCases.join('\n      ')}\n      else -> Unit\n    }\n  }`
    : ''
  const customEdgeTypesArg = edgeTypes && edgeTypes.length > 0
    ? `, customEdgeTypes = setOf(${edgeTypes.map(({ type }) => JSON.stringify(type)).join(', ')})`
    : ''
  const customEdgeArg = edgeTypes && edgeTypes.length > 0
    ? `, customEdge = { pyreonEdge ->\n    when (pyreonEdge.edge.type) {\n      ${edgeTypes.map(({ type, component }) => `${JSON.stringify(type)} -> ${kotlinIdent(component)}(edge = pyreonEdge.edge, sourceX = { pyreonEdge.sourceX }, sourceY = { pyreonEdge.sourceY }, targetX = { pyreonEdge.targetX }, targetY = { pyreonEdge.targetY }, sourcePosition = { pyreonEdge.sourcePosition }, targetPosition = { pyreonEdge.targetPosition }, selected = { pyreonEdge.selected }, labelX = { pyreonEdge.labelX }, labelY = { pyreonEdge.labelY })`).join('\n      ')}\n      else -> Unit\n    }\n  }`
    : ''
  const customConnectionLineArg = connectionLine
    ? `, customConnectionLineEnabled = true, customConnectionLine = { pyreonLine -> ${kotlinIdent(connectionLine)}(sourceX = { pyreonLine.sourceX }, sourceY = { pyreonLine.sourceY }, targetX = { pyreonLine.targetX }, targetY = { pyreonLine.targetY }, sourcePosition = { pyreonLine.sourcePosition }, path = { pyreonLine.path }) }`
    : ''
  // A node without a custom `type` renders the web's DefaultNode box — palette
  // background, text and border, the selected colour while selected — not a
  // bare label.
  const nodeLabel = attr.value.kind === 'identifier' && host.hasLabelData(attr.value.name)
    ? 'pyreonNode.data.label.toString()'
    : 'pyreonNode.id'
  const nodeSelected = nodeTypes && nodeTypes.length > 0 ? 'pyreonSelected' : `${host.expr(attr.value, 0)}.isNodeSelected(pyreonNode.id)`
  const nodeText = `PyreonFlowDefaultNode(label = ${nodeLabel}, selected = ${nodeSelected})`
  const renderer = nodeTypes && nodeTypes.length > 0
    ? `when (pyreonNode.type) {\n${nodeTypes.map(({ type, component }) => `    ${kotlinStr(type)} -> ${kotlinIdent(component)}(id = pyreonNode.id, data = { pyreonNode.data }, selected = { pyreonSelected }, dragging = { pyreonDragging })`).join('\n')}\n    else -> ${nodeText}\n  }`
    : nodeText
  const rendererParams = nodeTypes && nodeTypes.length > 0 ? 'pyreonNode, pyreonSelected, pyreonDragging' : 'pyreonNode'
  const flowHost = `PyreonFlowView(state = ${host.expr(attr.value, 0)}${bgArg}${controlsArg}${controlsContentArg}${miniMapArg}${miniMapNodeColorArg}${ariaLabelArg}${colorModeArg}${nodeHandlesArg}${nodeResizerArg}${nodeToolbarConfigArg}${nodeToolbarArg}${customEdgeTypesArg}${customEdgeArg}${customConnectionLineArg}) { ${rendererParams} ->\n  ${renderer}\n}`
  if (panels.length === 0 && otherChildren.length === 0) return flowHost
  const overlays = panels.map((panel) => {
    const position = host.staticAttr(panel, 'position')
    const hasPosition = panel.attrs.some((a) => a.kind === 'attr' && a.name === 'position')
    const alignment = position === 'top-right' ? 'TopEnd' : position === 'bottom-left' ? 'BottomStart' : position === 'bottom-right' ? 'BottomEnd' : 'TopStart'
    if (hasPosition && typeof position !== 'string') host.warn('<Panel position={…}> must be a string literal to lower natively; top-left is used.')
    for (const name of ['style', 'class']) if (panel.attrs.some((a) => a.kind === 'attr' && a.name === name)) host.warn(`<Panel ${name}> uses browser CSS and is not applied natively; its position and content still lower.`)
    const content = panel.children.map((child) => `      ${host.child(child, 6)}`).join('\n')
    return `    Box(modifier = Modifier.align(Alignment.${alignment}).padding(10.dp)) {\n${content}\n    }`
  })
  overlays.push(...otherChildren.map((child) => `    ${host.child(child, 4)}`))
  const overlaysCode = overlays.join('\n')
  // The overlays sit BESIDE the flow view, outside its own scoped colour
  // mode; re-apply it around the stack so a <Panel> under colorMode="dark"
  // themes like the web's `.pyreon-flow[data-color-mode]` descendants.
  const stack = `Box {\n  ${flowHost}\n${overlaysCode}\n}`
  return colorModeAttr?.kind === 'attr' && colorModeAttr.value !== undefined ? `PyreonFlowColorMode(${host.expr(colorModeAttr.value, 0)}) {\n${stack}\n}` : stack
}

export function emitKotlinStandaloneFlowControls(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const instance = e.attrs.find((a) => a.kind === 'attr' && a.name === 'instance')
  if (instance?.kind !== 'attr' || instance.value === undefined) {
    host.warn('<Controls> outside <Flow> requires `instance={flow}` for native lowering; it was dropped.')
    return 'Box {}'
  }
  const content = e.children.length > 0
    ? `, extraContent = {\n${e.children.map((child) => `    ${host.child(child, indent + 4)}`).join('\n')}\n${' '.repeat(indent + 2)}}`
    : ''
  return `PyreonStandaloneFlowControls(state = ${host.expr(instance.value, 0)}, style = ${emitKotlinFlowControls(e)}${content})`
}

export function emitKotlinFlowCustomPath(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'd')
  let value = attr?.kind === 'attr' ? attr.value : undefined
  if (value?.kind === 'arrow' && value.params.length === 0) value = value.body
  // A structured helper result (`get*Path({...}).path`, or a local bound to
  // one) or the connection line's `path()` keeps its segments; any other `d`
  // is SVG path data, parsed at runtime into the same segments.
  const pathMember = value?.kind === 'member' && value.property === 'path'
    ? classifyFlowPathMember(value.object, host.component().propsParamName, host.component().valueConsts)
    : undefined
  const resultCode = value?.kind === 'member' && pathMember === 'object'
    ? host.expr(value.object, indent)
    : value?.kind === 'member' && pathMember === 'accessor'
      ? `${kotlinIdent(value.property)}()`
    : value?.kind === 'call' && value.args.length === 0 && value.callee.kind === 'member' && value.callee.property === 'path'
      ? host.expr(value, indent)
      : value !== undefined
        ? `pyreonFlowPathResultFromSvg(${host.expr(value, indent)})`
        : undefined
  if (resultCode === undefined) {
    host.warn(FLOW_ARBITRARY_PATH_WARNING)
    return 'Box {}'
  }
  const paint = resolveFlowPathPaint(e)
  for (const w of paint.warnings) host.warn(w)
  const color = (v: FlowPathPaintValue) => v.kind === 'none' ? 'null' : v.kind === 'literal' ? JSON.stringify(v.value) : host.expr(v.expr, indent)
  const width = paint.width.kind === 'literal' ? ktChartDouble(String(paint.width.value)) : `(${host.expr(paint.width.expr, indent)}).toDouble()`
  return `PyreonFlowCustomEdgePath(result = ${resultCode}, color = ${color(paint.stroke)}, width = ${width}, fill = ${color(paint.fill)})`
}

export function emitKotlinFlowSvg(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const plan = planFlowSvg(e)
  for (const w of plan.warnings) host.warnOnce(w)
  const num = (n: FlowSvgNumber) => n.kind === 'literal' ? ktChartDouble(String(n.value)) : `(${host.expr(n.expr, indent)}).toDouble()`
  const color = (v: FlowPathPaintValue) => v.kind === 'none' ? 'null' : v.kind === 'literal' ? JSON.stringify(v.value) : host.expr(v.expr, indent)
  const pad = ' '.repeat(indent + 2)
  const shapes = plan.shapes.map((s) =>
    `${pad}PyreonFlowSvgShape(result = pyreonFlowPathResultFromSvg(${host.expr(s.d, indent + 2)}), stroke = ${color(s.paint.stroke)}, strokeWidth = ${s.paint.width.kind === 'literal' ? ktChartDouble(String(s.paint.width.value)) : `(${host.expr(s.paint.width.expr, indent)}).toDouble()`}, fill = ${color(s.paint.fill)})`,
  )
  const args = [
    ...(plan.width ? [`width = ${num(plan.width)}`] : []),
    ...(plan.height ? [`height = ${num(plan.height)}`] : []),
    ...(plan.viewBox ? [`viewBox = listOf(${plan.viewBox.map((v) => ktChartDouble(String(v))).join(', ')})`] : []),
    ...(plan.stretch ? ['stretch = true'] : []),
  ]
  const body = shapes.length > 0 ? `listOf(\n${shapes.join(',\n')}\n${' '.repeat(indent)})` : 'emptyList()'
  return `PyreonFlowSvg(${[...args, `shapes = ${body}`].join(', ')})`
}

export function emitKotlinFlowBaseEdge(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const plan = planBaseEdge(e)
  for (const w of plan.warnings) host.warnOnce(w)
  if (!plan.path) return 'Box {}'
  const stroke = plan.paint.stroke
  const color = stroke.kind === 'none' ? '"#00000000"' : stroke.kind === 'literal' ? (stroke.value === PALETTE_STROKE ? 'null' : JSON.stringify(stroke.value)) : host.expr(stroke.expr, indent)
  const width = plan.paint.width.kind === 'literal' ? ktChartDouble(String(plan.paint.width.value)) : `(${host.expr(plan.paint.width.expr, indent)}).toDouble()`
  const path = `PyreonFlowBaseEdgePath(result = pyreonFlowPathResultFromSvg(${host.expr(plan.path, indent)}), color = ${color}, width = ${width})`
  if (!plan.label) return path
  const pad = ' '.repeat(indent + 2)
  return `Box {\n${pad}${path}\n${pad}PyreonFlowEdgeText(x = (${host.expr(plan.label.x, indent)}).toDouble(), y = (${host.expr(plan.label.y, indent)}).toDouble(), label = ${host.expr(plan.label.text, indent)})\n${' '.repeat(indent)}}`
}

export function emitKotlinFlowMiniMap(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  for (const name of ['style', 'class']) if (e.attrs.some((a) => a.kind === 'attr' && a.name === name)) host.warn(`<MiniMap ${name}> is browser CSS and is not applied natively; its dimensions, colors, and interactions still lower.`)
  const expr = (name: string, fallback: string): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    return attr?.kind === 'attr' && attr.value !== undefined ? host.expr(attr.value, 0) : fallback
  }
  const str = (name: string, fallback: string): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    const value = attr?.kind === 'attr' ? attr.value : undefined
    const callback = value?.kind === 'arrow' || (value?.kind === 'identifier' && (host.isFunctionName(value.name) || host.constExpr(value.name)?.kind === 'arrow'))
    return callback ? kotlinStr(fallback) : expr(name, kotlinStr(fallback))
  }
  const num = (name: string, fallback: number): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    if (attr?.kind !== 'attr' || attr.value === undefined) return `${fallback}.0`
    if (attr.value.kind !== 'literal') return `(${host.expr(attr.value, 0)}).toDouble()`
    const value = attr.value.value
    return typeof value === 'number' ? `${value}${Number.isInteger(value) ? '.0' : ''}` : host.expr(attr.value, 0)
  }
  const bool = (name: string, fallback: boolean): string => expr(name, String(fallback))
  // A static node colour lowers verbatim; an absent one (or a per-node
  // callback, which travels separately as `miniMapNodeColor`) stays `null` so
  // the palette's `minimapNode` — light or dark — decides at render time.
  const nodeColorAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'nodeColor')
  const nodeColorValue = nodeColorAttr?.kind === 'attr' ? nodeColorAttr.value : undefined
  const nodeColorIsCallback = nodeColorValue?.kind === 'arrow' || (nodeColorValue?.kind === 'identifier' && (host.isFunctionName(nodeColorValue.name) || host.constExpr(nodeColorValue.name)?.kind === 'arrow'))
  const nodeColor = nodeColorValue === undefined || nodeColorIsCallback ? 'null' : host.expr(nodeColorValue, 0)
  return `PyreonFlowMiniMapStyle(nodeColor = ${nodeColor}, maskColor = ${str('maskColor', '#000000')}, width = ${num('width', 200)}, height = ${num('height', 150)}, pannable = ${bool('pannable', true)}, zoomable = ${bool('zoomable', true)})`
}

export function emitKotlinFlowControls(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const expr = (name: string, fallback: string): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    return attr?.kind === 'attr' && attr.value !== undefined ? host.expr(attr.value, 0) : fallback
  }
  const bool = (name: string, fallback: boolean): string => expr(name, String(fallback))
  const position = host.staticAttr(e, 'position')
  const positionAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'position')
  const pos = position === 'top-left' ? 'PyreonFlowControlsPosition.TopLeft' : position === 'top-right' ? 'PyreonFlowControlsPosition.TopRight' : position === 'bottom-right' ? 'PyreonFlowControlsPosition.BottomRight' : typeof position === 'string' || positionAttr === undefined ? 'PyreonFlowControlsPosition.BottomLeft' : `pyreonFlowControlsPosition(${host.expr(positionAttr.kind === 'attr' && positionAttr.value !== undefined ? positionAttr.value : { kind: 'literal', value: 'bottom-left' }, 0)})`
  return `PyreonFlowControlsStyle(showZoomIn = ${bool('showZoomIn', true)}, showZoomOut = ${bool('showZoomOut', true)}, showFitView = ${bool('showFitView', true)}, showLock = ${bool('showLock', false)}, position = ${pos})`
}

export function emitKotlinFlowBackground(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const variant = host.staticAttr(e, 'variant')
  const variantAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'variant')
  const resolvedVariant = variant === 'lines' ? 'PyreonFlowBackgroundVariant.Lines' : variant === 'cross' ? 'PyreonFlowBackgroundVariant.Cross' : variant === 'dots' || variantAttr === undefined ? 'PyreonFlowBackgroundVariant.Dots' : `pyreonFlowBackgroundVariant(${host.expr(variantAttr.kind === 'attr' && variantAttr.value !== undefined ? variantAttr.value : { kind: 'literal', value: 'dots' }, 0)})`
  const expr = (name: string, fallback: string): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    return attr?.kind === 'attr' && attr.value !== undefined ? host.expr(attr.value, 0) : fallback
  }
  const num = (name: string, fallback: number): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    if (attr?.kind !== 'attr' || attr.value === undefined) return `${fallback}.0`
    if (attr.value.kind !== 'literal') return `(${host.expr(attr.value, 0)}).toDouble()`
    const value = attr.value.value
    return typeof value === 'number' ? `${value}${Number.isInteger(value) ? '.0' : ''}` : host.expr(attr.value, 0)
  }
  // No colour → `null`: the renderer's palette supplies the light `#dddddd` or
  // the dark `#374151` (`--pyreon-flow-bg-pattern`), which a baked literal
  // would silently pin to light under `colorMode="dark"`.
  return `PyreonFlowBackgroundStyle(variant = ${resolvedVariant}, gap = ${num('gap', 20)}, size = ${num('size', 1)}, color = ${expr('color', 'null')})`
}

export function flowWebViewHostHtmlKotlin(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  let html = DEFAULT_FLOW_WEBVIEW_HOST_HTML
  for (const prop of ['nodeWidth', 'nodeHeight', 'nodeFill', 'nodeStroke', 'labelColor', 'edgeColor', 'background']) {
    const present = e.attrs.some((a) => a.kind === 'attr' && a.name === prop)
    if (present && host.staticAttr(e, prop) === undefined) {
      host.warn(`<FlowWebView ${prop}={…}>: native host styling must be statically resolvable; using the documented default.`)
    }
  }
  const nodeWidth = host.staticAttr(e, 'nodeWidth')
  const nodeHeight = host.staticAttr(e, 'nodeHeight')
  if (typeof nodeWidth === 'number' || typeof nodeHeight === 'number') {
    html = html.replace(
      'var NODE_W = 150, NODE_H = 44;',
      `var NODE_W = ${typeof nodeWidth === 'number' && Number.isFinite(nodeWidth) ? nodeWidth : 150}, NODE_H = ${typeof nodeHeight === 'number' && Number.isFinite(nodeHeight) ? nodeHeight : 44};`,
    )
  }
  const safeColor = (value: string): string => value.replace(/[^#a-zA-Z0-9(),.%\s-]/g, '')
  const colors = [
    ['nodeFill', '#ffffff'], ['nodeStroke', '#c9ced6'],
    ['labelColor', '#1f2933'], ['edgeColor', '#98a2b3'],
  ] as const
  for (const [prop, fallback] of colors) {
    const value = host.staticAttr(e, prop)
    if (typeof value === 'string') html = html.replaceAll(fallback, safeColor(value))
  }
  const background = host.staticAttr(e, 'background')
  if (typeof background === 'string') {
    html = html.replace('background:transparent}', `background:${background.replace(/[<>"']/g, '')}}`)
  }
  return html
}

export function emitKotlinFlowWebView(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const graph = host.webView.dynamicAttr(e, 'graph')
  if (graph === undefined) host.warn('<FlowWebView>: `graph` is required on native; emitting an empty host.')
  const explicitHtml = host.webView.dynamicAttr(e, 'html')
  const generatedHtml = flowWebViewHostHtmlKotlin(e)
  if (explicitHtml !== undefined) {
    for (const prop of ['nodeWidth', 'nodeHeight', 'nodeFill', 'nodeStroke', 'labelColor', 'edgeColor', 'background']) {
      if (e.attrs.some((a) => a.kind === 'attr' && a.name === prop)) {
        host.warn(`<FlowWebView html={…} ${prop}={…}>: ${prop} is ignored because custom host HTML owns its presentation.`)
      }
    }
  }
  const html = explicitHtml === undefined ? JSON.stringify(generatedHtml) : host.expr(explicitHtml, 0)
  const graphJson = graph === undefined ? '"{\\"nodes\\":[],\\"edges\\":[]}"' : host.webView.dataArg(graph)
  const commands = host.webView.dynamicAttr(e, 'commands')
  const data = commands === undefined
    ? graphJson
    : `pyreonFlowWebViewData(graph = ${graphJson}, commands = ${host.webView.dataArg(commands)})`
  const callbacks = ['select', 'message', 'event', 'error'] as const
  const callbackArgs = callbacks.flatMap((name) => {
    const attr = e.attrs.find((a) => a.kind === 'event' && a.name === name)
    return attr?.kind === 'event' ? [`on${name[0]!.toUpperCase()}${name.slice(1)} = ${host.webView.messageHandler(attr.handler)}`] : []
  })
  const onMessage = callbackArgs.length === 0
    ? undefined
    : `onMessage = { pyreonMsg -> pyreonDispatchFlowWebViewMessage(pyreonMsg, ${callbackArgs.join(', ')}) }`
  return `PyreonWebView(html = ${html}, data = ${data}${onMessage ? `, ${onMessage}` : ''}${kotlinWebViewModifierArg(e, HANDLED_FLOW_WEBVIEW_PROPS)})`
}
