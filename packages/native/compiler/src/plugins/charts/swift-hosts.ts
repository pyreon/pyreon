import { ACCESSOR_CHART_HOSTS, CHART_HOSTS, CHART_HOST_PALETTE, chartThemeDefaultFields, chartTooltipFields, GRAMMAR_CHART_HOST, GRAMMAR_CONFIG_TAGS, GRAMMAR_FAMILY_TAGS, GRAMMAR_MARK_TAGS, chartChromeUnlowered, chartChromeWarning, chartThemeFields, desugarChartGrammar, UNLOWERED_CHART_HOSTS, chartDouble, chartRichSelectWarning, chartOrientVertical, chartRoamConfig, chartVisualMap } from '../../chart-hosts'
import type { ChartHostArgs } from '../../chart-hosts'
import { swiftStr } from '../../string-literals'
import type { ExprIR } from '../../types'
import { host } from './swift-facade'
import { SWIFT_CHART_TARGET, chartAttrExpr, chartStructRef, swiftChartA11y, swiftChartAccessor, swiftChartAnimating, swiftChartCanvas, swiftChartChrome, swiftChartDouble, swiftChartEntrance, swiftChartGesture, swiftChartMap, swiftChartScheme, swiftChartSelectBody, swiftChartTheme, swiftChartThemeFields, swiftChartThemed, swiftFrameHost, swiftRtl, swiftVisualMapGesture, swiftVisualMapState } from './swift-support'
import { emitSwiftPlotHost } from './swift-plot'

/**
 * A chart host's `@State` lives on the enclosing component, so two hosts of
 * the same kind in one component (two zoomable plots) would both declare
 * `pyreonZoom`. Each host's NEW declarations that collide with one already
 * declared are renamed, in the declaration and in that host's code alike.
 */
export function emitSwiftChartHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const before = host.hostState.lines().length
  let out = emitSwiftChartHostCore(e, indent)
  const nameOf = (decl: string): string | undefined => /\b(?:var|let)\s+(\w+)/.exec(decl)?.[1]
  const taken = new Set(host.hostState.lines().slice(0, before).map(nameOf).filter((n): n is string => n !== undefined))
  const added = host.hostState.lines().slice(before)
  const renames: [string, string][] = []
  for (const decl of added) {
    const n = nameOf(decl)
    if (n === undefined) continue
    if (taken.has(n)) renames.push([n, `${n}_${host.hostState.freshSuffix()}`])
    else taken.add(n)
  }
  if (renames.length === 0) return out
  const rename = (text: string): string => renames.reduce((t, [from, to]) => t.replace(new RegExp(`\\b${from}\\b`, 'g'), to), text)
  out = rename(out)
  host.hostState.replaceFrom(before, added.map(rename))
  return out
}

function emitSwiftChartHostCore(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const inner = emitSwiftChartHostInner(e, indent)
  // `theme.background` — the web host paints the canvas ground with it (the
  // default is transparent, so a host without a theme is emitted as before).
  // The grammar element has no ground of its own: its desugared host does.
  if (e.tag === GRAMMAR_CHART_HOST || inner === 'EmptyView()') return inner
  const bg = chartThemeFields(chartAttrExpr(e, 'theme'), e.tag, () => {}, SWIFT_CHART_TARGET.list, host.colorScope(), swiftChartScheme).background
  return bg === '""' ? inner : `${inner}.background(pyreonChartColor(${bg}))`
}

function emitSwiftChartHostInner(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = e.tag
  // The grammar: `<Chart>` with mark children desugars to the `<PlotChart marks>` element the plot emit lowers.
  if (tag === GRAMMAR_CHART_HOST) {
    // The grammar desugars to the host it names (`<PlotChart marks>`, or a family host for `<Arc>` / `<Stage>` / `<Cell>` / `<Candle>`) and re-enters here as that element.
    return emitSwiftChartHost(desugarChartGrammar(e, (w) => host.warn(w)), indent)
  }
  if (Object.hasOwn(GRAMMAR_MARK_TAGS, tag) || Object.hasOwn(GRAMMAR_FAMILY_TAGS, tag) || GRAMMAR_CONFIG_TAGS.includes(tag)) {
    host.warn(`<${tag}> only means something as a child of <Chart>; on its own it renders nothing.`)
    return 'EmptyView()'
  }
  // Chrome the web host draws but this target does not yet — named, never silent.
  for (const p of chartChromeUnlowered(tag)) {
    if (chartAttrExpr(e, p) !== undefined) host.warn(chartChromeWarning(tag, p))
  }
  if (tag === 'GaugeChart') return emitSwiftGaugeHost(e, indent)
  if (tag === 'CandlestickChart') return emitSwiftCandlestickHost(e, indent)
  if (tag === 'BoxplotChart') return swiftChartEntrance(e, tag, indent, (i) => emitSwiftBoxplotHost(e, i))
  if (tag === 'HeatmapChart') return swiftChartEntrance(e, tag, indent, (i) => emitSwiftHeatmapHost(e, i))
  if (tag === 'RadarChart') return emitSwiftRadarHost(e, indent)

  if (tag === 'PlotChart') return swiftChartEntrance(e, tag, indent, (i) => emitSwiftPlotHost(e, i))
  if (Object.hasOwn(ACCESSOR_CHART_HOSTS, tag)) return swiftChartEntrance(e, tag, indent, (i) => emitSwiftAccessorHost(e, i))
  const unlowered = UNLOWERED_CHART_HOSTS[tag]
  if (unlowered !== undefined) {
    host.warn(`<${tag}> has no native lowering yet — ${unlowered}. Emitting an EmptyView().`)
    return 'EmptyView()'
  }
  const clockProp = CHART_HOSTS[tag]?.clock
  if (clockProp !== undefined && chartAttrExpr(e, clockProp) !== undefined) {
    // An animated host: the clock wraps the entrance so every frame re-renders with a new time.
    const pad = ' '.repeat(indent + 2)
    return `PyreonChartClock { pyreonClock in\n${pad}${swiftChartEntrance(e, tag, indent + 2, (i) => emitSwiftGenericChartHost(e, i))}\n${' '.repeat(indent)}}`
  }
  return swiftChartEntrance(e, tag, indent, (i) => emitSwiftGenericChartHost(e, i))
}

/** The table-driven hosts (`CHART_HOSTS`): data + options → layout → render, with the crossing chrome and the tap. */
function emitSwiftGenericChartHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = e.tag
  const spec = CHART_HOSTS[tag]!
  for (const p of spec.warnProps ?? []) {
    if (chartAttrExpr(e, p) !== undefined) host.warn(`<${tag}>: \`${p}\` is not lowered on native; the chart renders without it.`)
  }
  const attrs: Record<string, ExprIR> = {}
  for (const name of spec.data) {
    const v = chartAttrExpr(e, name)
    if (v === undefined) {
      if (spec.dataDefaults?.[name] !== undefined) continue
      host.warn(`<${tag}>: needs a \`${name}\` attribute on native; emitting an EmptyView().`)
      return 'EmptyView()'
    }
    attrs[name] = v
  }
  const data: string[] = []
  const clocked = spec.clock !== undefined && chartAttrExpr(e, spec.clock) !== undefined
  for (const name of spec.data) {
    if (name === 'effectTime' && clocked) {
      data.push('pyreonClock')
      continue
    }
    if (attrs[name] === undefined) {
      data.push(spec.dataDefaults![name]!(SWIFT_CHART_TARGET))
      continue
    }
    // A prop whose web shape has no native form goes through its literal adapter.
    const adapter = spec.adapt?.[name]
    if (adapter !== undefined) {
      const adapted = adapter(attrs, SWIFT_CHART_TARGET, (m) => host.warn(m), (n) => host.constExpr(n), (x) => host.expr(x, indent))
      if (adapted === 'unsupported') return 'EmptyView()'
      data.push(adapted)
    } else {
      data.push(host.expr(attrs[name]!, indent))
    }
  }
  const optV = chartAttrExpr(e, spec.options)
  const userOptions = optV === undefined ? 'nil' : host.exprAs(chartStructRef(spec.optionsStruct), optV, indent)
  // The theme, read once: chrome colours, the tooltip box, and — when the
  // options struct has a palette — its default, as the web host merges it.
  const tf = swiftChartThemeFields(e, tag)
  const themed = swiftChartThemed(e)
  const themeLets: string[] = []
  let options = userOptions
  const themeFields = chartThemeDefaultFields(spec, tf)
  if (themed && themeFields.length > 0) {
    themeLets.push(`let pyreonOptions: ${spec.optionsStruct} = ${SWIFT_CHART_TARGET.withThemeDefaults(userOptions, spec.optionsStruct, themeFields)}`)
    options = 'pyreonOptions'
  }
  const H = swiftChartDouble(e, 'height', spec.defaultHeight, indent)
  const hasWidth = chartAttrExpr(e, 'width') !== undefined
  const W = hasWidth ? swiftChartDouble(e, 'width', 300, indent) : 'Double(pyreonGeo.size.width)'
  // `roam`: the view lives in host state and is merged into the options every
  // render, so the layout, the paint and the hit all see the roamed map.
  const roamCfg = spec.roam === true ? chartRoamConfig((n) => host.staticAttr(e, n), (m) => host.warn(m), tag, (n) => chartAttrExpr(e, n)) : null
  if (roamCfg !== null) {
    host.hostState.declare('@State private var pyreonView: GeoView = GeoView(zoom: 1.0, panX: 0.0, panY: 0.0)')
    host.hostState.declare('@State private var pyreonPanFrom: PyreonChartPt = PyreonChartPt(x: 0.0, y: 0.0)')
    host.hostState.declare('@State private var pyreonPinchFrom: Double = 1.0')
    const base = options === 'nil' ? `${spec.optionsStruct}()` : options
    themeLets.push(`let pyreonRoamed: ${spec.optionsStruct} = { () -> ${spec.optionsStruct} in var pyreonO = ${base}; pyreonO.zoom = pyreonView.zoom; pyreonO.panX = pyreonView.panX; pyreonO.panY = pyreonView.panY; return pyreonO }()`)
    options = 'pyreonRoamed'
  }
  // `visualMap`: the strip is a compile-time literal; its range, piece
  // selection and the handle being dragged live in host state, merged into the
  // options every render so the values and the strip agree.
  const vm = spec.visualMap === true ? chartVisualMap(chartAttrExpr(e, 'visualMap'), (n) => host.constExpr(n), SWIFT_CHART_TARGET, (m) => host.warn(m), tag) : null
  if (vm !== null) {
    swiftVisualMapState(vm)
    themeLets.push(`let pyreonStrip: VisualStrip = ${vm.strip}`)
    const base = options === 'nil' ? `${spec.optionsStruct}()` : options
    themeLets.push(`let pyreonVmOptions: ${spec.optionsStruct} = { () -> ${spec.optionsStruct} in var pyreonO = ${base}; pyreonO.stops = pyreonStrip.stops; pyreonO.domain = pyreonStrip.domain; pyreonO.inRange = pyreonStrip.piecewise ? nil : pyreonVmRange; pyreonO.outBands = visualOutBands(pyreonStrip, pyreonVmSelected); pyreonO.outColor = pyreonStrip.outColor; return pyreonO }()`)
    options = 'pyreonVmOptions'
  }
  const args: ChartHostArgs = {
    data,
    options,
    W,
    H,
    gutter: swiftChartDouble(e, 'gutter', spec.gutterDefault ?? 80, indent),
    innerRatio: swiftChartDouble(e, 'innerRatio', 0.2, indent),
  }
  // Chrome — the title block, the legend and the tap tooltip — comes from the
  // crossing `chrome.ts`, the same functions the web canvas host calls, so
  // "what does the legend list" and "what does a tap say" cannot disagree by
  // target. The legend's ENTRIES need a layout and the plot's layout needs the
  // legend's HEIGHT: the entries are read off a probe layout over the full
  // box (they never depend on the box), the chrome is measured, and the plot
  // lays out once more in what is left — the web host's two-pass shape.
  const showLegend = spec.legend !== undefined && host.staticAttr(e, 'showLegend') === true
  const lets: string[] = [...themeLets]
  let entries = '[]'
  const transposed = spec.transposable === true && chartOrientVertical(e, tag, (name) => host.staticAttr(e, name), (w) => host.warn(w))
  if (showLegend) {
    lets.push(`let pyreonProbe = ${spec.layout(transposed ? { ...args, W: args.H, H: args.W } : args, SWIFT_CHART_TARGET)}`)
    entries = spec.legend!('pyreonProbe', args, SWIFT_CHART_TARGET)
  }
  const chrome = swiftChartChrome(e, entries, W, H, indent, true, tf)
  const plotArgs: ChartHostArgs = vm === null ? { ...args, W: chrome.width(W), H: chrome.height(H) } : { ...args, W: 'pyreonVmPlace.chartW', H: 'pyreonVmPlace.chartH' }
  // A transposed host lays out in the box reflected across the diagonal (W and H swapped) and transposes the draw list back; the tap is reflected before its hit.
  const layoutArgs: ChartHostArgs = transposed ? { ...plotArgs, W: plotArgs.H, H: plotArgs.W } : plotArgs
  const transpose = (cmds: string): string => (transposed ? `pyreonTransposeCmds(${cmds})` : cmds)
  const withChrome = chrome.top !== '0.0'
  lets.push(...chrome.lets)
  if (vm !== null) lets.push(`let pyreonVmPlace = visualStripPlace(pyreonStrip, ${chrome.width(W)}, ${chrome.height(H)})`)
  // A hoisted layout `let` only when something else reads it (the tap); the
  // chrome-free, tap-free host keeps its inline `render(layout(...))`.
  const tooltip = spec.tooltip !== undefined && host.staticAttr(e, 'tooltip') === true
  const onSel = e.attrs.find((a) => a.kind === 'event' && a.name === 'selectindex')
  const extraHits = (spec.extraHits ?? []).flatMap((extra) => {
    const event = e.attrs.find((a) => a.kind === 'event' && a.name === extra.event)
    return event?.kind === 'event' ? [{ extra, event }] : []
  })
  // A rich-hit `onSelect` (a cell, a node, a Sankey node-or-link) has no native
  // shape; it used to vanish with no diagnostic on all eleven of these hosts.
  if (e.attrs.some((a) => a.kind === 'event' && a.name === 'select')) host.warn(chartRichSelectWarning(tag))
  const tapping = onSel?.kind === 'event' || extraHits.length > 0 || tooltip
  const reuseLayout = tapping || spec.reuseLayout === true
  const layout = reuseLayout ? 'pyreonLayout' : spec.layout(layoutArgs, SWIFT_CHART_TARGET)
  if (reuseLayout) lets.push(`let pyreonLayout = ${spec.layout(layoutArgs, SWIFT_CHART_TARGET)}`)
  // The entrance reaches the RENDER only: the layout, the hit and the tooltip read the user's options.
  const animating = swiftChartAnimating(e, tag)
  if (animating) lets.push(`let pyreonOpts: ${spec.optionsStruct} = ${SWIFT_CHART_TARGET.withProgress(options, spec.optionsStruct, 'pyreonEntrance')}`)
  const renderArgs: ChartHostArgs = animating ? { ...plotArgs, options: 'pyreonOpts' } : plotArgs
  const tipCmds = tooltip
    ? ` + renderTooltip(pyreonTip, pyreonTipAt, ${SWIFT_CHART_TARGET.rect('0.0', '0.0', W, H)}, ${SWIFT_CHART_TARGET.struct('TooltipOptions', chartTooltipFields(tf))}, pyreonChartMeasure)`
    : ''
  const stripCmds = vm === null ? '' : ' + renderVisualStrip(pyreonStrip, pyreonVmPlace.at, pyreonVmRange, pyreonVmSelected)'
  const canvas = swiftChartCanvas(e, `${chrome.mirror(chrome.wrap(`${transpose(spec.render(layout, renderArgs, SWIFT_CHART_TARGET))}${stripCmds}`))}${tipCmds}`, indent)
  // `onSelectIndex` → a tap (a zero-distance drag, which reports its location)
  // over the engine's index hit, computed against the same layout the canvas
  // painted. `.contentShape` makes the whole canvas — not only its painted
  // pixels — hit-testable. With `tooltip`, the SAME tap also reads the lines
  // for the point (an empty list clears the box, so a tap on nothing dismisses).
  let gesture = ''
  if (tapping) {
    const tapY = withChrome ? 'Double(pyreonTap.location.y) - pyreonTop' : 'Double(pyreonTap.location.y)'
    const tapX = chrome.plotX('Double(pyreonTap.location.x)')
    const hitX = transposed ? tapY : tapX
    const hitY = transposed ? tapX : tapY
    const parts: string[] = []
    if (tooltip) {
      host.hostState.declare('@State private var pyreonTip: [String] = []')
      host.hostState.declare('@State private var pyreonTipAt: PyreonChartPt = PyreonChartPt(x: 0.0, y: 0.0)')
      parts.push(`pyreonTip = ${spec.tooltip!(layout, hitX, hitY, plotArgs, SWIFT_CHART_TARGET)}; pyreonTipAt = PyreonChartPt(x: Double(pyreonTap.location.x), y: Double(pyreonTap.location.y))`)
    }
    if (onSel?.kind === 'event') parts.push(swiftChartSelectBody(onSel.handler, spec.hit(layout, hitX, hitY, plotArgs, SWIFT_CHART_TARGET), indent))
    for (const { extra, event } of extraHits) {
      parts.push(`do { ${swiftChartSelectBody(event.handler, extra.hit(layout, hitX, hitY, plotArgs, SWIFT_CHART_TARGET), indent)} }`)
    }
    gesture = `.contentShape(Rectangle()).simultaneousGesture(SpatialTapGesture().onEnded { pyreonTap in ${parts.join('; ')} })`
  }
  if (roamCfg !== null) {
    const box = SWIFT_CHART_TARGET.rect('0.0', '0.0', plotArgs.W, plotArgs.H)
    const pan = `DragGesture(minimumDistance: 3).onChanged { pyreonG in let pyreonD = PyreonChartPt(x: Double(pyreonG.translation.width), y: Double(pyreonG.translation.height)); pyreonView = geoRoamPan(pyreonView, pyreonD.x - pyreonPanFrom.x, pyreonD.y - pyreonPanFrom.y); pyreonPanFrom = pyreonD }.onEnded { _ in pyreonPanFrom = PyreonChartPt(x: 0.0, y: 0.0) }`
    const pinch = `MagnificationGesture().onChanged { pyreonS in pyreonView = geoRoamZoom(pyreonView, Double(pyreonS) / pyreonPinchFrom, (${plotArgs.W}) / 2.0, (${plotArgs.H}) / 2.0, ${box}, ${chartDouble(roamCfg.min)}, ${chartDouble(roamCfg.max)}); pyreonPinchFrom = Double(pyreonS) }.onEnded { _ in pyreonPinchFrom = 1.0 }`
    // Simultaneous, so a vertical drag over the map still scrolls an enclosing
    // page, and a select tap keeps working beside the pan.
    if (gesture === '') gesture = '.contentShape(Rectangle())'
    if (roamCfg.move) gesture += `.simultaneousGesture(${pan})`
    if (roamCfg.scale) gesture += `.simultaneousGesture(${pinch})`
  }
  if (vm !== null) {
    // A handle drag moves its end of the range; a tap on a piece toggles it. Simultaneous, so a page still scrolls.
    if (gesture === '') gesture = '.contentShape(Rectangle())'
    gesture += swiftVisualMapGesture((loc) => [chrome.plotX(`Double(${loc}.x)`), withChrome ? `Double(${loc}.y) - pyreonTop` : `Double(${loc}.y)`])
  }
  if (lets.length === 0) {
    const tail = swiftChartA11y(e, undefined, indent) + host.layoutModifiers(e)
    if (hasWidth) return `${canvas}${gesture}.frame(width: ${W}, height: ${H})${tail}`
    const pad = ' '.repeat(indent + 2)
    return `GeometryReader { pyreonGeo in\n${pad}${canvas}${gesture}\n${' '.repeat(indent)}}.frame(height: ${H})${tail}`
  }
  return swiftFrameHost(e, lets, canvas, gesture, W, H, hasWidth, indent)
}

function emitSwiftAccessorHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = e.tag
  const spec = ACCESSOR_CHART_HOSTS[tag]!
  const dataV = chartAttrExpr(e, spec.data)
  if (dataV === undefined) {
    host.warn(`<${tag}>: needs a \`${spec.data}\` attribute on native; emitting an EmptyView().`)
    return 'EmptyView()'
  }
  const tf = swiftChartThemeFields(e, tag)
  const themed = swiftChartThemed(e)
  const fieldArgs: string[] = []
  for (const f of spec.fields) {
    const acc = swiftChartAccessor(e, tag, f.prop, indent)
    if (acc === 'unsupported') return 'EmptyView()'
    let value: string
    if (acc === null) {
      if (f.fallback !== 'palette') {
        host.warn(`<${tag}>: needs a \`${f.prop}\` accessor on native; emitting an EmptyView().`)
        return 'EmptyView()'
      }
      // The theme palette by index — the default palette's literal when no theme is given (as before).
      value = themed ? `${tf.palette}[pyreonI % ${tf.palette}.count]` : `[${CHART_HOST_PALETTE.map((c) => swiftStr(c)).join(', ')}][pyreonI % ${CHART_HOST_PALETTE.length}]`
    } else {
      value = f.double === true ? `Double(${acc})` : acc
    }
    fieldArgs.push(`${f.name}: ${value}`)
  }
  const mapped = `${host.expr(dataV, indent)}.enumerated().map { (pyreonI, pyreonD) in ${spec.struct}(${fieldArgs.join(', ')}) }`
  const optV = spec.options === undefined ? undefined : chartAttrExpr(e, spec.options)
  const options = optV === undefined ? 'nil' : host.exprAs(chartStructRef(spec.optionsStruct), optV, indent)
  const H = swiftChartDouble(e, 'height', spec.defaultHeight, indent)
  const hasWidth = chartAttrExpr(e, 'width') !== undefined
  const W = hasWidth ? swiftChartDouble(e, 'width', 300, indent) : 'Double(pyreonGeo.size.width)'
  // A pie with a legend hoists its slices so the legend entries and the arcs
  // come from one list; without chrome the inline map stays as it was.
  // The legend's entries come from the crossing `xLegend(items)` (the same
  // list the web host reads); the tooltip is the crossing `xTip`. See the
  // generic host for the chrome shape.
  const chrome = swiftChartChrome(e, spec.legend('pyreonItems'), W, H, indent, true, tf)
  const tooltip = host.staticAttr(e, 'tooltip') === true
  const withChrome = chrome.top !== '0.0'
  const animating = swiftChartAnimating(e, tag) && spec.optionsStruct !== undefined
  const hoist = withChrome || tooltip || animating
  const items = hoist ? 'pyreonItems' : mapped
  const lets = hoist ? [`let pyreonItems: [${spec.struct}] = ${mapped}`, ...chrome.lets] : []
  if (animating) lets.push(`let pyreonOpts: ${spec.optionsStruct} = ${SWIFT_CHART_TARGET.withProgress(options, spec.optionsStruct!, 'pyreonEntrance')}`)
  const args: ChartHostArgs = { data: [], options, W: chrome.width(W), H: chrome.height(H), gutter: '0.0', innerRatio: swiftChartDouble(e, 'innerRadius', 0, indent), showLabels: host.staticAttr(e, 'showLabels') === false ? 'false' : 'true', fontSize: tf.fontSize }
  const tipCmds = tooltip
    ? ` + renderTooltip(pyreonTip, pyreonTipAt, ${SWIFT_CHART_TARGET.rect('0.0', '0.0', W, H)}, ${SWIFT_CHART_TARGET.struct('TooltipOptions', chartTooltipFields(tf))}, pyreonChartMeasure)`
    : ''
  const canvas = swiftChartCanvas(e, `${chrome.mirror(chrome.wrap(spec.render(items, animating ? { ...args, options: 'pyreonOpts' } : args, SWIFT_CHART_TARGET)))}${tipCmds}`, indent)
  // Both `onSelect` (already an index on these hosts) and `onSelectIndex` lower to the tap; `tooltip` shares it.
  const onSel = e.attrs.find((a) => a.kind === 'event' && (a.name === 'selectindex' || a.name === 'select'))
  const tapY = withChrome ? 'Double(pyreonTap.location.y) - pyreonTop' : 'Double(pyreonTap.location.y)'
  const tapXOf = (x: string): string => chrome.plotX(x)
  const parts: string[] = []
  if (tooltip) {
    host.hostState.declare('@State private var pyreonTip: [String] = []')
    host.hostState.declare('@State private var pyreonTipAt: PyreonChartPt = PyreonChartPt(x: 0.0, y: 0.0)')
    parts.push(`pyreonTip = ${spec.tooltip(items, tapXOf('Double(pyreonTap.location.x)'), tapY, args, SWIFT_CHART_TARGET)}; pyreonTipAt = PyreonChartPt(x: Double(pyreonTap.location.x), y: Double(pyreonTap.location.y))`)
  }
  if (onSel?.kind === 'event') parts.push(swiftChartSelectBody(onSel.handler, spec.hit(items, tapXOf('Double(pyreonTap.location.x)'), tapY, args, SWIFT_CHART_TARGET), indent))
  const gesture = parts.length === 0 ? '' : `.contentShape(Rectangle()).simultaneousGesture(SpatialTapGesture().onEnded { pyreonTap in ${parts.join('; ')} })`
  const tail = swiftChartA11y(e, undefined, indent) + host.layoutModifiers(e)
  if (!hoist) {
    if (hasWidth) return `${canvas}${gesture}.frame(width: ${W}, height: ${H})${tail}`
    const pad = ' '.repeat(indent + 2)
    return `GeometryReader { pyreonGeo in\n${pad}${canvas}${gesture}\n${' '.repeat(indent)}}.frame(height: ${H})${tail}`
  }
  return swiftFrameHost(e, lets, canvas, gesture, W, H, hasWidth, indent)
}

/** `<GaugeChart value min max thickness trackColor valueColor showValue>` → renderGauge over a double-height box (a half circle) + the value text. */
function emitSwiftGaugeHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const valueV = chartAttrExpr(e, 'value')
  if (valueV === undefined) {
    host.warn('<GaugeChart>: needs a `value` attribute on native; emitting an EmptyView().')
    return 'EmptyView()'
  }
  const value = `Double(${host.expr(valueV, indent)})`
  const H = swiftChartDouble(e, 'height', 140, indent)
  const hasWidth = chartAttrExpr(e, 'width') !== undefined
  const W = hasWidth ? swiftChartDouble(e, 'width', 240, indent) : 'Double(pyreonGeo.size.width)'
  const opts = `GaugeOptions(min: ${swiftChartDouble(e, 'min', 0, indent)}, max: ${swiftChartDouble(e, 'max', 100, indent)}, sweep: Double.pi, thickness: ${swiftChartDouble(e, 'thickness', 22, indent)}, trackColor: ${host.stringAttr(e, 'trackColor', indent) ?? '"rgba(132,150,165,0.22)"'}, valueColor: ${host.stringAttr(e, 'valueColor', indent) ?? '"#0f766e"'})`
  const showValue = host.staticAttr(e, 'showValue') !== false
  const text = showValue
    ? ` + [PyreonDrawCmd(kind: "text", fill: "#10161d", text: plain(${value}), at: PyreonChartPt(x: ${W} / 2.0, y: ${H} - 6.0), size: 20.0, align: "middle", baseline: "bottom")]`
    : ''
  // A full `dial` (built on the web by `gaugeDial()`) is a runtime value with no native form: named, and the half-circle track drawn.
  if (chartAttrExpr(e, 'dial') !== undefined) host.warn('<GaugeChart dial>: the full dial is web-only; native draws the half-circle gauge track.')
  const canvas = swiftChartCanvas(e, swiftRtl(e, W).mirror(`renderGauge(${value}, PyreonChartRect(x: 0.0, y: 0.0, w: ${W}, h: ${H} * 2.0), ${opts})${text}`), indent)
  const tail = swiftChartA11y(e, undefined, indent) + host.layoutModifiers(e)
  if (hasWidth) return `${canvas}.frame(width: ${W}, height: ${H})${tail}`
  const pad = ' '.repeat(indent + 2)
  return `GeometryReader { pyreonGeo in\n${pad}${canvas}\n${' '.repeat(indent)}}.frame(height: ${H})${tail}`
}

/** `<CandlestickChart data open high low close x? candle? height width title>` → the shared frame over the mapped candles. */
function emitSwiftCandlestickHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = 'CandlestickChart'
  const dataV = chartAttrExpr(e, 'data')
  if (dataV === undefined) {
    host.warn(`<${tag}>: needs a \`data\` attribute on native; emitting an EmptyView().`)
    return 'EmptyView()'
  }
  const data = host.expr(dataV, indent)
  const fields: string[] = []
  for (const f of ['open', 'high', 'low', 'close']) {
    const acc = swiftChartAccessor(e, tag, f, indent)
    if (acc === 'unsupported') return 'EmptyView()'
    if (acc === null) {
      host.warn(`<${tag}>: needs an \`${f}\` accessor on native; emitting an EmptyView().`)
      return 'EmptyView()'
    }
    fields.push(`${f}: pyreonChartDouble(${acc})`)
  }
  const lets = [`let pyreonCandles: [Ohlc] = ${data}.enumerated().map { (pyreonI, pyreonD) in Ohlc(${fields.join(', ')}) }`]
  const catsM = swiftChartMap(e, tag, data, 'x', (b) => `pyreonChartString(${b})`, indent)
  if (catsM === 'unsupported') return 'EmptyView()'
  lets.push(`let pyreonCats: [String] = ${catsM ?? '[]'}`)
  const theme = swiftChartTheme(e, tag)
  lets.push(`let pyreonTheme: ChartTheme = ${theme}`)
  const optV = chartAttrExpr(e, 'candle')
  const options = optV === undefined ? 'nil' : host.expr(optV, indent)
  const H = swiftChartDouble(e, 'height', 200, indent)
  const hasWidth = chartAttrExpr(e, 'width') !== undefined
  const W = hasWidth ? swiftChartDouble(e, 'width', 300, indent) : 'Double(pyreonGeo.size.width)'
  const rtlC = swiftRtl(e, W)
  const canvas = swiftChartCanvas(e, rtlC.mirror(`renderCandlestickChart(pyreonCandles, ${W}, ${H}, pyreonCats, pyreonTheme, ${options}, pyreonChartMeasure)`), indent)
  const gesture = swiftChartGesture(e, (x, y) => `hitCandlestickChart(pyreonCandles, ${W}, ${H}, pyreonCats, pyreonTheme.fontSize, pyreonChartMeasure, ${x}, ${y})`, indent, ['selectindex', 'select'], rtlC.tapX)
  return swiftFrameHost(e, lets, canvas, gesture, W, H, hasWidth, indent)
}

/** `<BoxplotChart data values x? box? format? height width title onSelect? onSelectIndex?>` → five-number summaries per row + the shared frame (`renderBoxplotChart`). */
function emitSwiftBoxplotHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = 'BoxplotChart'
  const dataV = chartAttrExpr(e, 'data')
  if (dataV === undefined) {
    host.warn(`<${tag}>: needs a \`data\` attribute on native; emitting an EmptyView().`)
    return 'EmptyView()'
  }
  const data = host.expr(dataV, indent)
  // `values` yields the raw samples of a row; the engine's `fiveNumber` reduces them natively.
  const summaryV = chartAttrExpr(e, 'summary')
  const rowsM = summaryV === undefined
    ? swiftChartMap(e, tag, data, 'values', (b) => `fiveNumber((${b}).map { pyreonChartDouble($0) })`, indent)
    : swiftChartMap(e, tag, data, 'summary', (b) => `FiveNumber(min: pyreonChartDouble((${b}).min), q1: pyreonChartDouble((${b}).q1), median: pyreonChartDouble((${b}).median), q3: pyreonChartDouble((${b}).q3), max: pyreonChartDouble((${b}).max), outliers: [])`, indent)
  if (rowsM === 'unsupported') return 'EmptyView()'
  if (rowsM === null) {
    host.warn(`<${tag}>: needs a \`values\` or \`summary\` accessor on native; emitting an EmptyView().`)
    return 'EmptyView()'
  }
  const lets = [`let pyreonBoxes: [FiveNumber] = ${rowsM}`]
  const catsM = swiftChartMap(e, tag, data, 'x', (b) => `pyreonChartString(${b})`, indent)
  if (catsM === 'unsupported') return 'EmptyView()'
  lets.push(`let pyreonCats: [String] = ${catsM ?? '[]'}`)
  lets.push(`let pyreonTheme: ChartTheme = ${swiftChartTheme(e, tag)}`)
  if (chartAttrExpr(e, 'format') !== undefined) host.warn(`<${tag} format>: a formatter is not lowered on native; the axis prints plain numbers.`)
  const optV = chartAttrExpr(e, 'box')
  const options = optV === undefined ? 'BoxplotOptions()' : host.expr(optV, indent)
  const H = swiftChartDouble(e, 'height', 240, indent)
  const hasWidth = chartAttrExpr(e, 'width') !== undefined
  const W = hasWidth ? swiftChartDouble(e, 'width', 300, indent) : 'Double(pyreonGeo.size.width)'
  // The entrance reaches the RENDER only (its trailing `progress`, as the heat host's); the hit reads the frame without it.
  const rtlB = swiftRtl(e, W)
  const canvas = swiftChartCanvas(e, rtlB.mirror(`renderBoxplotChart(pyreonBoxes, ${W}, ${H}, pyreonCats, pyreonTheme, ${options}, pyreonChartMeasure${swiftChartAnimating(e, tag) ? ', nil, pyreonEntrance' : ''})`), indent)
  const gesture = swiftChartGesture(e, (x, y) => `hitBoxplotChart(pyreonBoxes.count, ${W}, ${H}, pyreonCats, pyreonTheme.fontSize, pyreonChartMeasure, ${x}, ${y}, pyreonBoxes)`, indent, ['selectindex', 'select'], rtlB.tapX)
  return swiftFrameHost(e, lets, canvas, gesture, W, H, hasWidth, indent)
}

/** `<HeatmapChart data x y value colors? gap? height width title onSelectIndex?>` → heatGridFrom over the mapped rows + the shared frame. */
function emitSwiftHeatmapHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = 'HeatmapChart'
  const dataV = chartAttrExpr(e, 'data')
  if (dataV === undefined) {
    host.warn(`<${tag}>: needs a \`data\` attribute on native; emitting an EmptyView().`)
    return 'EmptyView()'
  }
  const data = host.expr(dataV, indent)
  const lets: string[] = []
  for (const [prop, name, type, wrap] of [
    ['x', 'pyreonXs', '[String]', (b: string) => b],
    ['y', 'pyreonYs', '[String]', (b: string) => b],
    ['value', 'pyreonVals', '[Double]', (b: string) => `pyreonChartDouble(${b})`],
  ] as const) {
    const m = swiftChartMap(e, tag, data, prop, wrap, indent)
    if (m === 'unsupported') return 'EmptyView()'
    if (m === null) {
      host.warn(`<${tag}>: needs a \`${prop}\` accessor on native; emitting an EmptyView().`)
      return 'EmptyView()'
    }
    lets.push(`let ${name}: ${type} = ${m}`)
  }
  lets.push('let pyreonGrid: HeatGrid = heatGridFrom(pyreonXs, pyreonYs, pyreonVals)')
  lets.push(`let pyreonTheme: ChartTheme = ${swiftChartTheme(e, tag)}`)
  if (e.attrs.some((a) => a.kind === 'event' && a.name === 'select')) {
    host.warn(`<${tag} onSelect>: the cell-shaped callback is not lowered on native; use \`onSelectIndex\` (the index into the grid's cells).`)
  }
  const colorsV = chartAttrExpr(e, 'colors')
  // Read the theme the line above already resolved, not a constant: that
  // picks up a `theme` prop, a `<ChartThemeProvider>` scope AND the device's
  // colour scheme. Emitting HEAT_RAMP_DEFAULT hardwired the LIGHT ramp, whose
  // contrast FALLS as the value rises on a dark ground — so a dark heatmap
  // drew its highest cells faintest, exactly the inversion this branch fixes
  // on the web.
  const stops = colorsV === undefined ? 'pyreonTheme.ramp' : host.expr(colorsV, indent)
  const gap = swiftChartDouble(e, 'gap', 1, indent)
  const H = swiftChartDouble(e, 'height', 200, indent)
  const hasWidth = chartAttrExpr(e, 'width') !== undefined
  const W = hasWidth ? swiftChartDouble(e, 'width', 300, indent) : 'Double(pyreonGeo.size.width)'
  const rtlH = swiftRtl(e, W)
  // `visualMap`: the strip takes its edge of the box; the grid, its hit and its colours read the selection.
  const vm = chartVisualMap(chartAttrExpr(e, 'visualMap'), (n) => host.constExpr(n), SWIFT_CHART_TARGET, (m) => host.warn(m), tag)
  let gW = W
  let gH = H
  let cellStops = stops
  let selection = ''
  let stripCmds = ''
  if (vm !== null) {
    swiftVisualMapState(vm)
    lets.push(`let pyreonStrip: VisualStrip = ${vm.strip}`)
    lets.push(`let pyreonVmPlace = visualStripPlace(pyreonStrip, ${W}, ${H})`)
    gW = 'pyreonVmPlace.chartW'
    gH = 'pyreonVmPlace.chartH'
    if (colorsV === undefined) cellStops = 'pyreonStrip.stops'
    selection = ', HeatSelection(domain: pyreonStrip.domain, inRange: pyreonStrip.piecewise ? nil : pyreonVmRange, outBands: visualOutBands(pyreonStrip, pyreonVmSelected), outColor: pyreonStrip.outColor)'
    stripCmds = ' + renderVisualStrip(pyreonStrip, pyreonVmPlace.at, pyreonVmRange, pyreonVmSelected)'
  }
  const progress = swiftChartAnimating(e, tag) ? ', pyreonEntrance' : selection === '' ? '' : ', 1.0'
  const canvas = swiftChartCanvas(e, rtlH.mirror(`renderHeatChart(pyreonGrid, ${gW}, ${gH}, pyreonTheme, ${cellStops}, ${gap}, pyreonChartMeasure${progress}${selection})${stripCmds}`), indent)
  let gesture = swiftChartGesture(e, (x, y) => `hitHeatChart(pyreonGrid, ${gW}, ${gH}, pyreonTheme.fontSize, ${gap}, pyreonChartMeasure, ${x}, ${y})`, indent, ['selectindex'], rtlH.tapX)
  if (vm !== null) {
    if (gesture === '') gesture = '.contentShape(Rectangle())'
    gesture += swiftVisualMapGesture((loc) => [rtlH.tapX(`Double(${loc}.x)`), `Double(${loc}.y)`])
  }
  return swiftFrameHost(e, lets, canvas, gesture, W, H, hasWidth, indent)
}

/** `<RadarChart data axes values label color? fillAlpha? rings? showLabels? height width title>` → renderRadar over the mapped series. */
function emitSwiftRadarHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = 'RadarChart'
  const dataV = chartAttrExpr(e, 'data')
  const axesV = chartAttrExpr(e, 'axes')
  if (dataV === undefined || axesV === undefined) {
    host.warn(`<${tag}>: needs \`data\` and \`axes\` attributes on native; emitting an EmptyView().`)
    return 'EmptyView()'
  }
  const data = host.expr(dataV, indent)
  const values = swiftChartAccessor(e, tag, 'values', indent)
  if (values === 'unsupported') return 'EmptyView()'
  if (values === null) {
    host.warn(`<${tag}>: needs a \`values\` accessor on native; emitting an EmptyView().`)
    return 'EmptyView()'
  }
  const colorAcc = swiftChartAccessor(e, tag, 'color', indent)
  if (colorAcc === 'unsupported') return 'EmptyView()'
  const tf = swiftChartThemeFields(e, tag)
  const color = colorAcc ?? (swiftChartThemed(e) ? `${tf.palette}[pyreonI % ${tf.palette}.count]` : `[${CHART_HOST_PALETTE.map((c) => swiftStr(c)).join(', ')}][pyreonI % ${CHART_HOST_PALETTE.length}]`)
  const fillAlpha = swiftChartDouble(e, 'fillAlpha', 0.25, indent)
  const lets = [
    `let pyreonSeries: [RadarSeries] = ${data}.enumerated().map { (pyreonI, pyreonD) in RadarSeries(values: (${values}).map { pyreonChartDouble($0) }, color: ${color}, fillAlpha: ${fillAlpha}) }`,
  ]
  const H = swiftChartDouble(e, 'height', 260, indent)
  const hasWidth = chartAttrExpr(e, 'width') !== undefined
  const W = hasWidth ? swiftChartDouble(e, 'width', 300, indent) : 'Double(pyreonGeo.size.width)'
  let entries = '[]'
  if (host.staticAttr(e, 'showLegend') === true) {
    const label = swiftChartAccessor(e, tag, 'label', indent)
    if (label === 'unsupported') return 'EmptyView()'
    if (label === null) {
      host.warn(`<${tag} showLegend>: needs a \`label\` accessor for the legend on native; emitting an EmptyView().`)
      return 'EmptyView()'
    }
    entries = `${data}.enumerated().map { (pyreonI, pyreonD) in LegendEntry(label: ${label}, color: ${color}) }`
  }
  const chrome = swiftChartChrome(e, entries, W, H, indent, false, tf)
  lets.push(...chrome.lets)
  const ringsV = chartAttrExpr(e, 'rings')
  const ringsRaw = host.staticAttr(e, 'rings')
  const rings = ringsV === undefined ? '4' : typeof ringsRaw === 'number' ? String(Math.trunc(ringsRaw)) : host.expr(ringsV, indent)
  const showRaw = host.staticAttr(e, 'showLabels')
  const showV = chartAttrExpr(e, 'showLabels')
  const showLabels = showV === undefined ? 'true' : typeof showRaw === 'boolean' ? String(showRaw) : host.expr(showV, indent)
  const opts = `RadarOptions(rings: ${rings}, gridColor: "rgba(132,150,165,0.35)", labelColor: "#5a6b7a", fontSize: 11.0, showLabels: ${showLabels})`
  const box = `PyreonChartRect(x: 0.0, y: 0.0, w: ${chrome.width(W)}, h: ${chrome.height(H)})`
  const canvas = swiftChartCanvas(e, chrome.mirror(chrome.wrap(`renderRadar(${host.expr(axesV, indent)}, pyreonSeries, ${box}, ${opts})`)), indent)
  // The tap: the engine's `hitRadarIndex` (a `{ series, axis }` — the shape BOTH
  // web callbacks receive), against the same box the canvas painted, the
  // chrome's height taken off the tap's y. Radar had no tap on either target.
  const tapY = chrome.top === '0.0' ? 'Double(pyreonTap.location.y)' : `Double(pyreonTap.location.y) - ${chrome.top}`
  const gesture = swiftChartGesture(e, (x) => `hitRadarIndex(${host.expr(axesV, indent)}, pyreonSeries, ${box}, ${opts}, ${x}, ${tapY}, 8.0)`, indent, ['selectindex', 'select'], chrome.plotX)
  return swiftFrameHost(e, lets, canvas, gesture, W, H, hasWidth, indent)
}
