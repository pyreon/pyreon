/**
 * The Swift flow hosts: `<Flow>`, the controls / minimap / background it consumes, the
 * custom edge paths and the `<FlowWebView>` host. Moved verbatim from the compiler's Swift emitter.
 */
import { type ChildIR, type ExprIR, swiftIdent, swiftStr } from '@pyreon/native-compiler/plugin-api'
import { PALETTE_STROKE, planBaseEdge } from './base-edge'
import { FLOW_ARBITRARY_PATH_WARNING, HANDLED_FLOW_WEBVIEW_PROPS, NODE_RESIZER_FOREIGN_NODE_WARNING, classifyFlowPathMember, resolveStaticFlowRendererMap } from './lowering'
import { type FlowPathPaintValue, resolveFlowPathPaint } from './path-paint'
import { type FlowSvgNumber, planFlowSvg } from './svg'
import { host } from './swift-facade'
import { swiftFlowParsedHandles } from './swift-literals'
import { DEFAULT_FLOW_WEBVIEW_HOST_HTML } from './webview-host.generated'

export function emitSwiftFlowHost(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'instance')
  if (attr === undefined || attr.kind !== 'attr' || attr.value === undefined) {
    host.warn('<Flow> requires `instance={flow}` for native lowering — the host was dropped.')
    return 'EmptyView()'
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
  const bgArg = background?.kind === 'jsx-element' ? `, background: ${emitSwiftFlowBackground(background)}` : ''
  const controlsArg = controls?.kind === 'jsx-element' ? `, controls: ${emitSwiftFlowControls(controls)}` : ''
  const controlsContentArg = controls?.kind === 'jsx-element' && controls.children.length > 0
    ? `, controlsContent: { AnyView(Group {\n${controls.children.map((child) => `      ${host.child(child, 6)}`).join('\n')}\n    }) }`
    : ''
  const miniMapArg = miniMap?.kind === 'jsx-element' ? `, miniMap: ${emitSwiftFlowMiniMap(miniMap)}` : ''
  const miniMapNodeColorAttr = miniMap?.kind === 'jsx-element' ? miniMap.attrs.find((a) => a.kind === 'attr' && a.name === 'nodeColor') : undefined
  const miniMapNodeColorValue = miniMapNodeColorAttr?.kind === 'attr' ? miniMapNodeColorAttr.value : undefined
  const miniMapNodeColorIsCallback = miniMapNodeColorValue?.kind === 'arrow' || (miniMapNodeColorValue?.kind === 'identifier' && (host.isFunctionName(miniMapNodeColorValue.name) || host.constExpr(miniMapNodeColorValue.name)?.kind === 'arrow'))
  const miniMapNodeColorArg = miniMapNodeColorValue !== undefined && miniMapNodeColorIsCallback
    ? `, miniMapNodeColor: ${host.expr(miniMapNodeColorValue, 0)}`
    : ''
  const ariaLabelAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'ariaLabel')
  const ariaLabelArg = ariaLabelAttr?.kind === 'attr' && ariaLabelAttr.value !== undefined ? `, ariaLabel: ${host.expr(ariaLabelAttr.value, 0)}` : ''
  const colorModeAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'colorMode')
  const colorModeArg = colorModeAttr?.kind === 'attr' && colorModeAttr.value !== undefined ? `, colorMode: ${host.expr(colorModeAttr.value, 0)}` : ''
  const handleCases = nodeTypes?.flatMap(({ type, component }) => {
    const handles = host.flowFile().handles.get(component) ?? []
    return handles.length > 0 ? [`case ${JSON.stringify(type)}: return ${swiftFlowParsedHandles(handles)}`] : []
  }) ?? []
  const nodeHandlesArg = handleCases.length > 0
    ? `, nodeHandles: { pyreonNode in\n    switch pyreonNode.type {\n    ${handleCases.join('\n    ')}\n    default: return []\n    }\n  }`
    : ''
  const resizerCases = nodeTypes?.flatMap(({ type, component }) => {
    const config = host.flowFile().resizers.get(component)
    return config ? [`case ${JSON.stringify(type)}: return PyreonFlowNodeResizerConfig(minWidth: ${config.minWidth}, minHeight: ${config.minHeight}, handleSize: ${config.handleSize}, showEdgeHandles: ${config.showEdgeHandles})`] : []
  }) ?? []
  const nodeResizerArg = resizerCases.length > 0
    ? `, nodeResizer: { pyreonNode in\n    switch pyreonNode.type {\n    ${resizerCases.join('\n    ')}\n    default: return nil\n    }\n  }`
    : ''
  const toolbarCases = nodeTypes?.flatMap(({ type, component }) => {
    const configs = host.flowFile().toolbars.get(component)
    return configs?.length ? [`case ${JSON.stringify(type)}: return [${configs.map((config) => `PyreonFlowNodeToolbarConfig(position: ${JSON.stringify(config.position)}, align: ${JSON.stringify(config.align)}, offset: ${config.offset}, showOnSelect: ${config.showOnSelect}${config.selectedOverride === undefined ? '' : `, selectedOverride: ${config.selectedOverride}`}${config.nodeIdOverride === undefined ? '' : `, nodeIdOverride: ${JSON.stringify(config.nodeIdOverride)}`})`).join(', ')}]`] : []
  }) ?? []
  const nodeToolbarConfigArg = toolbarCases.length > 0
    ? `, nodeToolbarConfigs: { pyreonNode in\n    switch pyreonNode.type {\n    ${toolbarCases.join('\n    ')}\n    default: return []\n    }\n  }`
    : ''
  const toolbarContentCases = nodeTypes?.flatMap(({ type, component }) => {
    const configs = host.flowFile().toolbars.get(component)
    return configs?.length ? [`case ${JSON.stringify(type)}:\n      switch pyreonToolbarIndex {\n${configs.map((config, index) => `      case ${index}: return AnyView(${swiftIdent(config.contentComponent)}(id: pyreonNode.id, data: { pyreonNode.data }, selected: { pyreonSelected }, dragging: { pyreonDragging }))`).join('\n')}\n      default: return nil\n      }`] : []
  }) ?? []
  const nodeToolbarArg = toolbarContentCases.length > 0
    ? `, nodeToolbar: { pyreonNode, pyreonToolbarIndex, pyreonSelected, pyreonDragging in\n    switch pyreonNode.type {\n    ${toolbarContentCases.join('\n    ')}\n    default: return nil\n    }\n  }`
    : ''
  const customEdgeTypesArg = edgeTypes && edgeTypes.length > 0
    ? `, customEdgeTypes: Set([${edgeTypes.map(({ type }) => JSON.stringify(type)).join(', ')}])`
    : ''
  const customEdgeArg = edgeTypes && edgeTypes.length > 0
    ? `, customEdge: { pyreonEdge in\n    switch pyreonEdge.edge.type {\n    ${edgeTypes.map(({ type, component }) => `case ${JSON.stringify(type)}: return AnyView(${swiftIdent(component)}(edge: pyreonEdge.edge, sourceX: { pyreonEdge.sourceX }, sourceY: { pyreonEdge.sourceY }, targetX: { pyreonEdge.targetX }, targetY: { pyreonEdge.targetY }, sourcePosition: { pyreonEdge.sourcePosition }, targetPosition: { pyreonEdge.targetPosition }, selected: { pyreonEdge.selected }, labelX: { pyreonEdge.labelX }, labelY: { pyreonEdge.labelY }))`).join('\n    ')}\n    default: return nil\n    }\n  }`
    : ''
  const customConnectionLineArg = connectionLine
    ? `, customConnectionLineEnabled: true, customConnectionLine: { pyreonLine in AnyView(${swiftIdent(connectionLine)}(sourceX: { pyreonLine.sourceX }, sourceY: { pyreonLine.sourceY }, targetX: { pyreonLine.targetX }, targetY: { pyreonLine.targetY }, sourcePosition: { pyreonLine.sourcePosition }, path: { pyreonLine.path })) }`
    : ''
  // A node without a custom `type` renders the web's DefaultNode box — palette
  // background, text and border, the selected colour while selected — not a
  // bare label.
  const nodeLabel = attr.value.kind === 'identifier' && host.hasLabelData(attr.value.name)
    ? 'String(describing: pyreonNode.data.label)'
    : 'pyreonNode.id'
  const nodeSelected = nodeTypes && nodeTypes.length > 0 ? 'pyreonSelected' : `${host.expr(attr.value, 0)}.isNodeSelected(pyreonNode.id)`
  const nodeText = `PyreonFlowDefaultNode(label: ${nodeLabel}, selected: ${nodeSelected})`
  const renderer = nodeTypes && nodeTypes.length > 0
    ? `switch pyreonNode.type {\n${nodeTypes.map(({ type, component }) => `  case ${swiftStr(type)}:\n    ${swiftIdent(component)}(id: pyreonNode.id, data: { pyreonNode.data }, selected: { pyreonSelected }, dragging: { pyreonDragging })`).join('\n')}\n  default:\n    ${nodeText}\n  }`
    : nodeText
  const rendererParams = nodeTypes && nodeTypes.length > 0 ? 'pyreonNode, pyreonSelected, pyreonDragging' : 'pyreonNode'
  const flowHost = `PyreonFlowView(state: ${host.expr(attr.value, 0)}${bgArg}${controlsArg}${controlsContentArg}${miniMapArg}${miniMapNodeColorArg}${ariaLabelArg}${colorModeArg}${nodeHandlesArg}${nodeResizerArg}${nodeToolbarConfigArg}${nodeToolbarArg}${customEdgeTypesArg}${customEdgeArg}${customConnectionLineArg}) { ${rendererParams} in\n  ${renderer}\n}`
  if (panels.length === 0 && otherChildren.length === 0) return flowHost
  const overlays = panels.map((panel) => {
    const position = host.staticAttr(panel, 'position')
    const hasPosition = panel.attrs.some((a) => a.kind === 'attr' && a.name === 'position')
    const alignment = position === 'top-right' ? '.topTrailing' : position === 'bottom-left' ? '.bottomLeading' : position === 'bottom-right' ? '.bottomTrailing' : '.topLeading'
    if (hasPosition && typeof position !== 'string') host.warn('<Panel position={…}> must be a string literal to lower natively; top-left is used.')
    for (const name of ['style', 'class']) if (panel.attrs.some((a) => a.kind === 'attr' && a.name === name)) host.warn(`<Panel ${name}> uses browser CSS and is not applied natively; its position and content still lower.`)
    const content = panel.children.map((child) => `      ${host.child(child, 6)}`).join('\n')
    return `    Group {\n${content}\n    }\n    .padding(10)\n    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: ${alignment})`
  })
  overlays.push(...otherChildren.map((child) => `    ${host.child(child, 4)}`))
  const overlaysCode = overlays.join('\n')
  // The overlays sit BESIDE the flow view, outside its own scoped colour
  // mode; re-apply it on the stack so a <Panel> under colorMode="dark"
  // themes like the web's `.pyreon-flow[data-color-mode]` descendants.
  const colorModeTail = colorModeAttr?.kind === 'attr' && colorModeAttr.value !== undefined ? `\n.pyreonFlowColorMode(${host.expr(colorModeAttr.value, 0)})` : ''
  return `ZStack {\n  ${flowHost}\n${overlaysCode}\n}${colorModeTail}`
}

export function emitSwiftStandaloneFlowControls(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const instance = e.attrs.find((a) => a.kind === 'attr' && a.name === 'instance')
  if (instance?.kind !== 'attr' || instance.value === undefined) {
    host.warn('<Controls> outside <Flow> requires `instance={flow}` for native lowering; it was dropped.')
    return 'EmptyView()'
  }
  const content = e.children.length > 0
    ? `, extraContent: { AnyView(Group {\n${e.children.map((child) => `    ${host.child(child, indent + 4)}`).join('\n')}\n${' '.repeat(indent + 2)}}) }`
    : ''
  return `PyreonStandaloneFlowControls(state: ${host.expr(instance.value, 0)}, style: ${emitSwiftFlowControls(e)}${content})`
}

export function emitSwiftFlowCustomPath(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
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
      ? `${swiftIdent(value.property)}()`
    : value?.kind === 'call' && value.args.length === 0 && value.callee.kind === 'member' && value.callee.property === 'path'
      ? host.expr(value, indent)
      : value !== undefined
        ? `PyreonFlowPathResult(svgPath: ${host.expr(value, indent)})`
        : undefined
  if (resultCode === undefined) {
    host.warn(FLOW_ARBITRARY_PATH_WARNING)
    return 'EmptyView()'
  }
  const paint = resolveFlowPathPaint(e)
  for (const w of paint.warnings) host.warn(w)
  const color = (v: FlowPathPaintValue) => v.kind === 'none' ? 'nil' : v.kind === 'literal' ? JSON.stringify(v.value) : host.expr(v.expr, indent)
  const width = paint.width.kind === 'literal' ? String(paint.width.value) : `Double(${host.expr(paint.width.expr, indent)})`
  return `PyreonFlowCustomEdgePath(result: ${resultCode}, color: ${color(paint.stroke)}, width: ${width}, fill: ${color(paint.fill)})`
}

export function emitSwiftFlowSvg(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const plan = planFlowSvg(e)
  for (const w of plan.warnings) host.warnOnce(w)
  const num = (n: FlowSvgNumber) => n.kind === 'literal' ? String(n.value) : `Double(${host.expr(n.expr, indent)})`
  const color = (v: FlowPathPaintValue) => v.kind === 'none' ? 'nil' : v.kind === 'literal' ? JSON.stringify(v.value) : host.expr(v.expr, indent)
  const pad = ' '.repeat(indent + 2)
  const shapes = plan.shapes.map((s) =>
    `${pad}PyreonFlowSvgShape(result: PyreonFlowPathResult(svgPath: ${host.expr(s.d, indent + 2)}), stroke: ${color(s.paint.stroke)}, strokeWidth: ${s.paint.width.kind === 'literal' ? String(s.paint.width.value) : `Double(${host.expr(s.paint.width.expr, indent)})`}, fill: ${color(s.paint.fill)})`,
  )
  const args = [
    ...(plan.width ? [`width: ${num(plan.width)}`] : []),
    ...(plan.height ? [`height: ${num(plan.height)}`] : []),
    ...(plan.viewBox ? [`viewBox: [${plan.viewBox.join(', ')}]`] : []),
    ...(plan.stretch ? ['stretch: true'] : []),
  ]
  const body = shapes.length > 0 ? `[\n${shapes.join(',\n')}\n${' '.repeat(indent)}]` : '[]'
  return `PyreonFlowSvg(${[...args, `shapes: ${body}`].join(', ')})`
}

export function emitSwiftFlowBaseEdge(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const plan = planBaseEdge(e)
  for (const w of plan.warnings) host.warnOnce(w)
  if (!plan.path) return 'EmptyView()'
  const stroke = plan.paint.stroke
  const color = stroke.kind === 'none' ? '"#00000000"' : stroke.kind === 'literal' ? (stroke.value === PALETTE_STROKE ? 'nil' : JSON.stringify(stroke.value)) : host.expr(stroke.expr, indent)
  const width = plan.paint.width.kind === 'literal' ? String(plan.paint.width.value) : `Double(${host.expr(plan.paint.width.expr, indent)})`
  const path = `PyreonFlowBaseEdgePath(result: PyreonFlowPathResult(svgPath: ${host.expr(plan.path, indent)}), color: ${color}, width: ${width})`
  if (!plan.label) return path
  const pad = ' '.repeat(indent + 2)
  return `Group {\n${pad}${path}\n${pad}PyreonFlowEdgeText(x: Double(${host.expr(plan.label.x, indent)}), y: Double(${host.expr(plan.label.y, indent)}), label: ${host.expr(plan.label.text, indent)})\n${' '.repeat(indent)}}`
}

export function emitSwiftFlowMiniMap(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  for (const name of ['style', 'class']) if (e.attrs.some((a) => a.kind === 'attr' && a.name === name)) host.warn(`<MiniMap ${name}> is browser CSS and is not applied natively; its dimensions, colors, and interactions still lower.`)
  const expr = (name: string, fallback: string): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    return attr?.kind === 'attr' && attr.value !== undefined ? host.expr(attr.value, 0) : fallback
  }
  const str = (name: string, fallback: string): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    const value = attr?.kind === 'attr' ? attr.value : undefined
    const callback = value?.kind === 'arrow' || (value?.kind === 'identifier' && (host.isFunctionName(value.name) || host.constExpr(value.name)?.kind === 'arrow'))
    return callback ? swiftStr(fallback) : expr(name, swiftStr(fallback))
  }
  const num = (name: string, fallback: number): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    if (attr?.kind !== 'attr' || attr.value === undefined) return String(fallback)
    return attr.value.kind === 'literal' ? host.expr(attr.value, 0) : `Double(${host.expr(attr.value, 0)})`
  }
  const bool = (name: string, fallback: boolean): string => expr(name, String(fallback))
  // A static node colour lowers verbatim; an absent one (or a per-node
  // callback, which travels separately as `miniMapNodeColor`) stays `nil` so
  // the palette's `minimapNode` — light or dark — decides at render time.
  const nodeColorAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'nodeColor')
  const nodeColorValue = nodeColorAttr?.kind === 'attr' ? nodeColorAttr.value : undefined
  const nodeColorIsCallback = nodeColorValue?.kind === 'arrow' || (nodeColorValue?.kind === 'identifier' && (host.isFunctionName(nodeColorValue.name) || host.constExpr(nodeColorValue.name)?.kind === 'arrow'))
  const nodeColor = nodeColorValue === undefined || nodeColorIsCallback ? 'nil' : host.expr(nodeColorValue, 0)
  return `PyreonFlowMiniMapStyle(nodeColor: ${nodeColor}, maskColor: ${str('maskColor', '#000000')}, width: ${num('width', 200)}, height: ${num('height', 150)}, pannable: ${bool('pannable', true)}, zoomable: ${bool('zoomable', true)})`
}

export function emitSwiftFlowControls(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const expr = (name: string, fallback: string): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    return attr?.kind === 'attr' && attr.value !== undefined ? host.expr(attr.value, 0) : fallback
  }
  const bool = (name: string, fallback: boolean): string => expr(name, String(fallback))
  const position = host.staticAttr(e, 'position')
  const positionAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'position')
  const pos = position === 'top-left' ? '.topLeft' : position === 'top-right' ? '.topRight' : position === 'bottom-right' ? '.bottomRight' : typeof position === 'string' || positionAttr === undefined ? '.bottomLeft' : `PyreonFlowControlsPosition.from(${host.expr(positionAttr.kind === 'attr' && positionAttr.value !== undefined ? positionAttr.value : { kind: 'literal', value: 'bottom-left' }, 0)})`
  return `PyreonFlowControlsStyle(showZoomIn: ${bool('showZoomIn', true)}, showZoomOut: ${bool('showZoomOut', true)}, showFitView: ${bool('showFitView', true)}, showLock: ${bool('showLock', false)}, position: ${pos})`
}

export function emitSwiftFlowBackground(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const variant = host.staticAttr(e, 'variant')
  const variantAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'variant')
  const resolvedVariant = variant === 'lines' ? '.lines' : variant === 'cross' ? '.cross' : variant === 'dots' || variantAttr === undefined ? '.dots' : `.from(${host.expr(variantAttr.kind === 'attr' && variantAttr.value !== undefined ? variantAttr.value : { kind: 'literal', value: 'dots' }, 0)})`
  const expr = (name: string, fallback: string): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    return attr?.kind === 'attr' && attr.value !== undefined ? host.expr(attr.value, 0) : fallback
  }
  const num = (name: string, fallback: number): string => {
    const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
    if (attr?.kind !== 'attr' || attr.value === undefined) return String(fallback)
    return attr.value.kind === 'literal' ? host.expr(attr.value, 0) : `Double(${host.expr(attr.value, 0)})`
  }
  // No colour → `nil`: the renderer's palette supplies the light `#dddddd` or
  // the dark `#374151` (`--pyreon-flow-bg-pattern`), which a baked literal
  // would silently pin to light under `colorMode="dark"`.
  return `PyreonFlowBackgroundStyle(variant: ${resolvedVariant}, gap: ${num('gap', 20)}, size: ${num('size', 1)}, color: ${expr('color', 'nil')})`
}

export function flowWebViewHostHtml(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  read: (e: Extract<ExprIR, { kind: 'jsx-element' }>, name: string) => unknown,
): string {
  let html = DEFAULT_FLOW_WEBVIEW_HOST_HTML
  for (const prop of ['nodeWidth', 'nodeHeight', 'nodeFill', 'nodeStroke', 'labelColor', 'edgeColor', 'background']) {
    const present = e.attrs.some((a) => a.kind === 'attr' && a.name === prop)
    if (present && read(e, prop) === undefined) {
      host.warn(`<FlowWebView ${prop}={…}>: native host styling must be statically resolvable; using the documented default.`)
    }
  }
  const nodeWidth = read(e, 'nodeWidth')
  const nodeHeight = read(e, 'nodeHeight')
  if (typeof nodeWidth === 'number' || typeof nodeHeight === 'number') {
    html = html.replace(
      'var NODE_W = 150, NODE_H = 44;',
      `var NODE_W = ${typeof nodeWidth === 'number' && Number.isFinite(nodeWidth) ? nodeWidth : 150}, NODE_H = ${typeof nodeHeight === 'number' && Number.isFinite(nodeHeight) ? nodeHeight : 44};`,
    )
  }
  const safeColor = (value: string): string => value.replace(/[^#a-zA-Z0-9(),.%\s-]/g, '')
  const colors = [
    ['nodeFill', '#ffffff'],
    ['nodeStroke', '#c9ced6'],
    ['labelColor', '#1f2933'],
    ['edgeColor', '#98a2b3'],
  ] as const
  for (const [prop, fallback] of colors) {
    const value = read(e, prop)
    if (typeof value === 'string') html = html.replaceAll(fallback, safeColor(value))
  }
  const background = read(e, 'background')
  if (typeof background === 'string') {
    html = html.replace('background:transparent}', `background:${background.replace(/[<>"']/g, '')}}`)
  }
  return html
}

export function emitSwiftFlowWebView(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const graph = host.webView.dynamicAttr(e, 'graph')
  if (graph === undefined) {
    host.warn('<FlowWebView>: `graph` is required on native; emitting an empty host.')
  }
  const explicitHtml = host.webView.dynamicAttr(e, 'html')
  const generatedHtml = flowWebViewHostHtml(e, host.staticAttr)
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
    : `pyreonFlowWebViewData(graph: ${graphJson}, commands: ${host.webView.dataArg(commands)})`
  const callbacks = ['select', 'message', 'event', 'error'] as const
  const callbackArgs = callbacks.flatMap((name) => {
    const attr = e.attrs.find((a) => a.kind === 'event' && a.name === name)
    return attr?.kind === 'event' ? [`on${name[0]!.toUpperCase()}${name.slice(1)}: ${host.webView.messageHandler(attr.handler)}`] : []
  })
  const onMessage = callbackArgs.length === 0
    ? undefined
    : `onMessage: { pyreonMsg in pyreonDispatchFlowWebViewMessage(pyreonMsg, ${callbackArgs.join(', ')}) }`
  return `PyreonWebView(html: ${html}, data: ${data}${onMessage ? `, ${onMessage}` : ''})${host.layoutModifiersFor(e, HANDLED_FLOW_WEBVIEW_PROPS)}`
}
