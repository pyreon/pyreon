import { ACCESSOR_CHART_HOSTS, CHART_HOSTS, CHART_HOST_PALETTE, chartThemeDefaultFields, chartTooltipFields, GRAMMAR_CHART_HOST, GRAMMAR_CONFIG_TAGS, GRAMMAR_FAMILY_TAGS, GRAMMAR_MARK_TAGS, chartChromeUnlowered, chartChromeWarning, chartThemeFields, desugarChartGrammar, UNLOWERED_CHART_HOSTS, chartDouble, chartRichSelectWarning, chartOrientVertical, chartRoamConfig, chartVisualMap } from '../../chart-hosts'
import type { ChartHostArgs } from '../../chart-hosts'
import { substituteIdentifier } from '../../expr-utils'
import { kotlinStr } from '../../string-literals'
import type { ExprIR } from '../../types'
import { host } from './kotlin-facade'
import { KOTLIN_CHART_TARGET, chartStructRefKotlin, kotlinChartAnimating, kotlinChartEntrance, chartAttrExprKotlin, kotlinChartDouble, kotlinChartCanvas, kotlinChartSelectBody, kotlinChartA11y, kotlinRtl, kotlinVisualMapGesture, kotlinVisualMapState, kotlinFrameHostLets, kotlinChartChrome, kotlinFrameHostWithTap, kotlinChartTheme, kotlinChartThemeFields, kotlinChartScheme, kotlinChartThemed } from './kotlin-support'
import { emitKotlinPlotHost } from './kotlin-plot'

export function emitKotlinChartHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const inner = emitKotlinChartHostInner(e, indent)
  // `theme.background` — the ground the web host paints; see the Swift emitter. A Box carries it, since the host is a composable call.
  if (e.tag === GRAMMAR_CHART_HOST || inner === 'Box {}') return inner
  const bg = chartThemeFields(chartAttrExprKotlin(e, 'theme'), e.tag, () => {}, KOTLIN_CHART_TARGET.list, host.colorScope(), kotlinChartScheme).background
  if (bg === '""') return inner
  const pad = ' '.repeat(indent + 2)
  return `Box(modifier = Modifier.background(pyreonChartColor(${bg}))) {\n${pad}${inner}\n${' '.repeat(indent)}}`
}

function emitKotlinChartHostInner(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = e.tag
  // The grammar: `<Chart>` with mark children desugars to the `<PlotChart marks>` element the plot emit lowers.
  if (tag === GRAMMAR_CHART_HOST) {
    // The grammar desugars to the host it names (`<PlotChart marks>`, or a family host for `<Arc>` / `<Stage>` / `<Cell>` / `<Candle>`) and re-enters here as that element.
    return emitKotlinChartHost(desugarChartGrammar(e, (w) => host.warn(w)), indent)
  }
  if (Object.hasOwn(GRAMMAR_MARK_TAGS, tag) || Object.hasOwn(GRAMMAR_FAMILY_TAGS, tag) || GRAMMAR_CONFIG_TAGS.includes(tag)) {
    host.warn(`<${tag}> only means something as a child of <Chart>; on its own it renders nothing.`)
    return 'Box {}'
  }
  // Chrome the web host draws but this target does not yet — named, never silent.
  for (const p of chartChromeUnlowered(tag)) {
    if (chartAttrExprKotlin(e, p) !== undefined) host.warn(chartChromeWarning(tag, p))
  }
  if (tag === 'GaugeChart') return emitKotlinGaugeHost(e, indent)
  if (tag === 'CandlestickChart') return emitKotlinCandlestickHost(e, indent)
  if (tag === 'BoxplotChart') return kotlinChartEntrance(e, tag, indent, (i) => emitKotlinBoxplotHost(e, i))
  if (tag === 'HeatmapChart') return kotlinChartEntrance(e, tag, indent, (i) => emitKotlinHeatmapHost(e, i))
  if (tag === 'RadarChart') return emitKotlinRadarHost(e, indent)

  if (tag === 'PlotChart') return kotlinChartEntrance(e, tag, indent, (i) => emitKotlinPlotHost(e, i))
  if (Object.hasOwn(ACCESSOR_CHART_HOSTS, tag)) return kotlinChartEntrance(e, tag, indent, (i) => emitKotlinAccessorHost(e, i))
  const unlowered = UNLOWERED_CHART_HOSTS[tag]
  if (unlowered !== undefined) {
    host.warn(`<${tag}> has no native lowering yet — ${unlowered}. Emitting an empty Box().`)
    return 'Box {}'
  }
  const clockProp = CHART_HOSTS[tag]?.clock
  if (clockProp !== undefined && chartAttrExprKotlin(e, clockProp) !== undefined) {
    // An animated host: the clock wraps the entrance so every frame re-renders with a new time.
    const pad = ' '.repeat(indent + 2)
    return `PyreonChartClock { pyreonClock ->\n${pad}${kotlinChartEntrance(e, tag, indent + 2, (i) => emitKotlinGenericChartHost(e, i))}\n${' '.repeat(indent)}}`
  }
  return kotlinChartEntrance(e, tag, indent, (i) => emitKotlinGenericChartHost(e, i))
}

function emitKotlinGenericChartHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const describe: string | undefined = undefined
  const tag = e.tag
  const spec = CHART_HOSTS[tag]!
  for (const p of spec.warnProps ?? []) {
    if (chartAttrExprKotlin(e, p) !== undefined) host.warn(`<${tag}>: \`${p}\` is not lowered on native; the chart renders without it.`)
  }
  const attrs: Record<string, ExprIR> = {}
  for (const name of spec.data) {
    const v = chartAttrExprKotlin(e, name)
    if (v === undefined) {
      if (spec.dataDefaults?.[name] !== undefined) continue
      host.warn(`<${tag}>: needs a \`${name}\` attribute on native; emitting an empty Box().`)
      return 'Box {}'
    }
    attrs[name] = v
  }
  const data: string[] = []
  const clocked = spec.clock !== undefined && chartAttrExprKotlin(e, spec.clock) !== undefined
  for (const name of spec.data) {
    if (name === 'effectTime' && clocked) {
      data.push('pyreonClock')
      continue
    }
    if (attrs[name] === undefined) {
      data.push(spec.dataDefaults![name]!(KOTLIN_CHART_TARGET))
      continue
    }
    const adapter = spec.adapt?.[name]
    if (adapter !== undefined) {
      const adapted = adapter(attrs, KOTLIN_CHART_TARGET, (m) => host.warn(m), (n) => host.constExpr(n), (x) => host.expr(x, indent))
      if (adapted === 'unsupported') return 'Box {}'
      data.push(adapted)
    } else {
      data.push(host.expr(attrs[name]!, indent))
    }
  }
  const optV = chartAttrExprKotlin(e, spec.options)
  const userOptions = optV === undefined ? 'null' : host.exprAs(chartStructRefKotlin(spec.optionsStruct), optV, indent)
  const tf = kotlinChartThemeFields(e, tag)
  const themed = kotlinChartThemed(e)
  const themeLets: string[] = []
  let options = userOptions
  const themeFields = chartThemeDefaultFields(spec, tf)
  if (themed && themeFields.length > 0) {
    themeLets.push(`val pyreonOptions: ${spec.optionsStruct} = ${KOTLIN_CHART_TARGET.withThemeDefaults(userOptions, spec.optionsStruct, themeFields)}`)
    options = 'pyreonOptions'
  }
  const H = kotlinChartDouble(e, 'height', spec.defaultHeight, indent)
  const hasWidth = chartAttrExprKotlin(e, 'width') !== undefined
  const W = hasWidth ? kotlinChartDouble(e, 'width', 300, indent) : 'pyreonW'
  // `roam` (mirror of the Swift host): a remembered view merged into the options every composition.
  const roamCfg = spec.roam === true ? chartRoamConfig((n) => host.staticAttr(e, n), (m) => host.warn(m), tag, (n) => chartAttrExprKotlin(e, n)) : null
  if (roamCfg !== null) {
    themeLets.push('var pyreonView by remember { mutableStateOf(GeoView(1.0, 0.0, 0.0)) }')
    const base = options === 'null' ? `${spec.optionsStruct}()` : options
    themeLets.push(`val pyreonRoamed: ${spec.optionsStruct} = (${base}).copy(zoom = pyreonView.zoom, panX = pyreonView.panX, panY = pyreonView.panY)`)
    options = 'pyreonRoamed'
  }
  // `visualMap` (mirror of the Swift host): the strip literal, and its selection in remembered state merged into the options.
  const vm = spec.visualMap === true ? chartVisualMap(chartAttrExprKotlin(e, 'visualMap'), (n) => host.constExpr(n), KOTLIN_CHART_TARGET, (m) => host.warn(m), tag) : null
  if (vm !== null) {
    themeLets.push(...kotlinVisualMapState(vm))
    themeLets.push(`val pyreonStrip: VisualStrip = ${vm.strip}`)
    const base = options === 'null' ? `${spec.optionsStruct}()` : options
    themeLets.push(`val pyreonVmOptions: ${spec.optionsStruct} = (${base}).copy(stops = pyreonStrip.stops, domain = pyreonStrip.domain, inRange = if (pyreonStrip.piecewise) null else pyreonVmRange, outBands = visualOutBands(pyreonStrip, pyreonVmSelected), outColor = pyreonStrip.outColor)`)
    options = 'pyreonVmOptions'
  }
  const args: ChartHostArgs = {
    data,
    options,
    W,
    H,
    gutter: kotlinChartDouble(e, 'gutter', spec.gutterDefault ?? 80, indent),
    innerRatio: kotlinChartDouble(e, 'innerRatio', 0.2, indent),
  }
  // Chrome from the crossing `chrome.ts` — mirror of the Swift generic host:
  // a probe layout for the legend's entries, the chrome measured, the plot
  // laid out in what is left.
  const showLegend = spec.legend !== undefined && host.staticAttr(e, 'showLegend') === true
  const lets: string[] = [...themeLets]
  let entries = 'listOf<LegendEntry>()'
  const transposed = spec.transposable === true && chartOrientVertical(e, tag, (name) => host.staticAttr(e, name), (w) => host.warn(w))
  if (showLegend) {
    lets.push(`val pyreonProbe = ${spec.layout(transposed ? { ...args, W: args.H, H: args.W } : args, KOTLIN_CHART_TARGET)}`)
    entries = spec.legend!('pyreonProbe', args, KOTLIN_CHART_TARGET)
  }
  const chrome = kotlinChartChrome(e, entries, W, H, indent, true, tf)
  const plotArgs: ChartHostArgs = vm === null ? { ...args, W: chrome.width(W), H: chrome.height(H) } : { ...args, W: 'pyreonVmPlace.chartW', H: 'pyreonVmPlace.chartH' }
  // A transposed host lays out in the box reflected across the diagonal (W and H swapped) and transposes the draw list back; the tap is reflected before its hit.
  const layoutArgs: ChartHostArgs = transposed ? { ...plotArgs, W: plotArgs.H, H: plotArgs.W } : plotArgs
  const transpose = (cmds: string): string => (transposed ? `pyreonTransposeCmds(${cmds})` : cmds)
  const withChrome = chrome.top !== '0.0'
  lets.push(...chrome.lets)
  if (vm !== null) lets.push(`val pyreonVmPlace = visualStripPlace(pyreonStrip, ${chrome.width(W)}, ${chrome.height(H)})`)
  const tooltip = spec.tooltip !== undefined && host.staticAttr(e, 'tooltip') === true
  const onSel = e.attrs.find((a) => a.kind === 'event' && a.name === 'selectindex')
  const extraHits = (spec.extraHits ?? []).flatMap((extra) => {
    const event = e.attrs.find((a) => a.kind === 'event' && a.name === extra.event)
    return event?.kind === 'event' ? [{ extra, event }] : []
  })
  if (e.attrs.some((a) => a.kind === 'event' && a.name === 'select')) host.warn(chartRichSelectWarning(tag))
  const tapping = onSel?.kind === 'event' || extraHits.length > 0 || tooltip
  const reuseLayout = tapping || spec.reuseLayout === true
  const layout = reuseLayout ? 'pyreonLayout' : spec.layout(layoutArgs, KOTLIN_CHART_TARGET)
  if (reuseLayout) lets.push(`val pyreonLayout = ${spec.layout(layoutArgs, KOTLIN_CHART_TARGET)}`)
  // The entrance reaches the RENDER only: the layout, the hit and the tooltip read the user's options.
  const animating = kotlinChartAnimating(e, tag)
  if (animating) lets.push(`val pyreonOpts: ${spec.optionsStruct} = ${KOTLIN_CHART_TARGET.withProgress(options, spec.optionsStruct, 'pyreonEntrance')}`)
  const renderArgs: ChartHostArgs = animating ? { ...plotArgs, options: 'pyreonOpts' } : plotArgs
  if (tooltip) {
    lets.push('var pyreonTip by remember { mutableStateOf(listOf<String>()) }')
    lets.push('var pyreonTipAt by remember { mutableStateOf(PyreonChartPt(0.0, 0.0)) }')
  }
  const tipCmds = tooltip
    ? ` + renderTooltip(pyreonTip, pyreonTipAt, ${KOTLIN_CHART_TARGET.rect('0.0', '0.0', W, H)}, ${KOTLIN_CHART_TARGET.struct('TooltipOptions', chartTooltipFields(tf))}, ::pyreonChartMeasure)`
    : ''
  const stripCmds = vm === null ? '' : ' + renderVisualStrip(pyreonStrip, pyreonVmPlace.at, pyreonVmRange, pyreonVmSelected)'
  const cmds = `${chrome.mirror(chrome.wrap(`${transpose(spec.render(layout, renderArgs, KOTLIN_CHART_TARGET))}${stripCmds}`))}${tipCmds}`
  // `onSelectIndex` → a tap over the engine's index hit. The tap position is
  // in pixels while the draw list is laid out in dp (PyreonChartCanvas scales
  // by the density when it paints), so the position is divided by the density
  // read in the enclosing composable scope. With `tooltip`, the SAME tap also
  // reads the lines for the point (an empty list clears the box).
  let tap = ''
  if (tapping) {
    // The HIT reads PLOT space (`chrome.plotX` — unmirrored, and out of a
    // left legend's indent); the tooltip's ANCHOR stays raw, because the
    // tooltip is drawn unmirrored at the finger.
    const rawTx = '(pyreonTap.x / pyreonDensity).toDouble()'
    const tx = chrome.plotX(rawTx)
    const tapY = withChrome ? '(pyreonTap.y / pyreonDensity).toDouble() - pyreonTop' : '(pyreonTap.y / pyreonDensity).toDouble()'
    const hitX = transposed ? tapY : tx
    const hitY = transposed ? tx : tapY
    const parts: string[] = []
    if (tooltip) parts.push(`pyreonTip = ${spec.tooltip!(layout, hitX, hitY, plotArgs, KOTLIN_CHART_TARGET)}; pyreonTipAt = PyreonChartPt(${rawTx}, (pyreonTap.y / pyreonDensity).toDouble())`)
    if (onSel?.kind === 'event') parts.push(kotlinChartSelectBody(onSel.handler, spec.hit(layout, hitX, hitY, plotArgs, KOTLIN_CHART_TARGET), indent))
    for (const { extra, event } of extraHits) {
      parts.push(`run { ${kotlinChartSelectBody(event.handler, extra.hit(layout, hitX, hitY, plotArgs, KOTLIN_CHART_TARGET), indent)} }`)
    }
    // Keyed on the layout the lambda captures: a `pointerInput(Unit)` keeps the FIRST composition's val (the plot host's #3294 lesson).
    tap = `.pointerInput(pyreonLayout) { detectTapGestures { pyreonTap -> ${parts.join('; ')} } }`
  }
  if (roamCfg !== null) {
    const box = KOTLIN_CHART_TARGET.rect('0.0', '0.0', plotArgs.W, plotArgs.H)
    const panPart = roamCfg.move ? 'geoRoamPan(pyreonView, (pyreonPan.x / pyreonDensity).toDouble(), (pyreonPan.y / pyreonDensity).toDouble())' : 'pyreonView'
    const next = roamCfg.scale
      ? `geoRoamZoom(${panPart}, pyreonZoom.toDouble(), (pyreonC.x / pyreonDensity).toDouble(), (pyreonC.y / pyreonDensity).toDouble(), ${box}, ${chartDouble(roamCfg.min)}, ${chartDouble(roamCfg.max)})`
      : panPart
    // Keyed on the box, which the gesture lambda captures.
    tap += `.pointerInput(${plotArgs.W}, ${plotArgs.H}) { detectTransformGestures { pyreonC, pyreonPan, pyreonZoom, _ -> pyreonView = ${next} } }`
  }
  if (vm !== null) {
    // A handle drag moves its end of the range; a tap on a piece toggles it.
    tap += kotlinVisualMapGesture((o) => [chrome.plotX(`(${o}.x / pyreonDensity).toDouble()`), withChrome ? `(${o}.y / pyreonDensity).toDouble() - pyreonTop` : `(${o}.y / pyreonDensity).toDouble()`])
  }
  if (lets.length > 0) return kotlinFrameHostWithTap(e, lets, cmds, tap, W, H, hasWidth, indent)
  // Size modifiers first (they are the host's own layout), then the tap, the
  // title as the content description, then the generic tail — testTag / a11y
  // / padding — so `data-testid` reaches the node.
  const size = hasWidth ? `Modifier.width((${W}).dp).height((${H}).dp)` : `Modifier.fillMaxWidth().height((${H}).dp)`
  const generic = host.layoutModifiers(e)
  const titleMod = kotlinChartA11y(e, describe)
  const modifier = size + tap + titleMod + (generic === '' ? '' : generic.replace(/^Modifier/, ''))
  const canvas = kotlinChartCanvas(e, cmds, modifier, indent)
  // A tap needs the density from a composable scope, so a tappable host always
  // sits in a BoxWithConstraints even when its width is explicit.
  if (hasWidth && tap === '') return canvas
  const pad = ' '.repeat(indent + 2)
  const widthLine = hasWidth ? '' : `${pad}val pyreonW = maxWidth.value.toDouble()\n`
  const densityLine = tap === '' ? '' : `${pad}val pyreonDensity = LocalDensity.current.density\n`
  return `BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {\n${widthLine}${densityLine}${pad}${canvas}\n${' '.repeat(indent)}}`
}


// ---- accessor-prop hosts (FunnelChart / PieChart) + GaugeChart ------------

/** Mirror of the Swift accessor inliner: the body with its params substituted for `pyreonD` / `pyreonI`. */
function kotlinChartAccessor(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string, prop: string, indent: number): string | null | 'unsupported' {
  const v = chartAttrExprKotlin(e, prop)
  if (v === undefined) return null
  if (v.kind !== 'arrow' || (v.stmts !== undefined && v.stmts.length > 0) || v.params.length > 2) {
    host.warn(`<${tag} ${prop}>: only a single-expression arrow \`(d, i) => …\` lowers on native; emitting an empty Box().`)
    return 'unsupported'
  }
  let body: ExprIR | null = v.body
  const names = ['pyreonD', 'pyreonI']
  for (let i = 0; i < v.params.length && body !== null; i++) {
    body = substituteIdentifier(body, v.params[i]!, { kind: 'identifier', name: names[i]! })
  }
  if (body === null) {
    host.warn(`<${tag} ${prop}>: the accessor shadows its own parameter; emitting an empty Box().`)
    return 'unsupported'
  }
  return host.expr(body, indent)
}

function emitKotlinAccessorHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const describe: string | undefined = undefined
  const tag = e.tag
  const spec = ACCESSOR_CHART_HOSTS[tag]!
  const dataV = chartAttrExprKotlin(e, spec.data)
  if (dataV === undefined) {
    host.warn(`<${tag}>: needs a \`${spec.data}\` attribute on native; emitting an empty Box().`)
    return 'Box {}'
  }
  const tf = kotlinChartThemeFields(e, tag)
  const themed = kotlinChartThemed(e)
  const fieldArgs: string[] = []
  for (const f of spec.fields) {
    const acc = kotlinChartAccessor(e, tag, f.prop, indent)
    if (acc === 'unsupported') return 'Box {}'
    let value: string
    if (acc === null) {
      if (f.fallback !== 'palette') {
        host.warn(`<${tag}>: needs a \`${f.prop}\` accessor on native; emitting an empty Box().`)
        return 'Box {}'
      }
      value = themed ? `${tf.palette}[pyreonI % ${tf.palette}.size]` : `listOf(${CHART_HOST_PALETTE.map((c) => kotlinStr(c)).join(', ')})[pyreonI % ${CHART_HOST_PALETTE.length}]`
    } else {
      value = f.double === true ? `(${acc}).toDouble()` : acc
    }
    fieldArgs.push(`${f.name} = ${value}`)
  }
  const mapped = `${host.expr(dataV, indent)}.mapIndexed { pyreonI, pyreonD -> ${spec.struct}(${fieldArgs.join(', ')}) }`
  const optV = spec.options === undefined ? undefined : chartAttrExprKotlin(e, spec.options)
  const options = optV === undefined ? 'null' : host.exprAs(chartStructRefKotlin(spec.optionsStruct), optV, indent)
  const H = kotlinChartDouble(e, 'height', spec.defaultHeight, indent)
  const hasWidth = chartAttrExprKotlin(e, 'width') !== undefined
  const W = hasWidth ? kotlinChartDouble(e, 'width', 300, indent) : 'pyreonW'
  // Mirror of the Swift accessor host: crossing legend entries + tooltip.
  const chrome = kotlinChartChrome(e, spec.legend('pyreonItems'), W, H, indent, true, tf)
  const tooltip = host.staticAttr(e, 'tooltip') === true
  const withChrome = chrome.top !== '0.0'
  const animating = kotlinChartAnimating(e, tag) && spec.optionsStruct !== undefined
  // A framed host names its frame in a `val`, so it takes the hoisted form.
  // A select handler hoists too: its hit test runs inside `pointerInput`, which
  // is not a composable scope, so the items (whose themed palette reads
  // `isSystemInDarkTheme()`) must be evaluated once, here, and captured.
  const selects = e.attrs.some((a) => a.kind === 'event' && (a.name === 'selectindex' || a.name === 'select'))
  const hoist = withChrome || tooltip || animating || selects
  const items = hoist ? 'pyreonItems' : mapped
  const lets = hoist ? [`val pyreonItems: List<${spec.struct}> = ${mapped}`, ...chrome.lets] : []
  if (animating) lets.push(`val pyreonOpts: ${spec.optionsStruct} = ${KOTLIN_CHART_TARGET.withProgress(options, spec.optionsStruct!, 'pyreonEntrance')}`)
  if (tooltip) {
    lets.push('var pyreonTip by remember { mutableStateOf(listOf<String>()) }')
    lets.push('var pyreonTipAt by remember { mutableStateOf(PyreonChartPt(0.0, 0.0)) }')
  }
  const args: ChartHostArgs = { data: [], options, W: chrome.width(W), H: chrome.height(H), gutter: '0.0', innerRatio: kotlinChartDouble(e, 'innerRadius', 0, indent), showLabels: host.staticAttr(e, 'showLabels') === false ? 'false' : 'true', fontSize: tf.fontSize }
  const tipCmds = tooltip
    ? ` + renderTooltip(pyreonTip, pyreonTipAt, ${KOTLIN_CHART_TARGET.rect('0.0', '0.0', W, H)}, ${KOTLIN_CHART_TARGET.struct('TooltipOptions', chartTooltipFields(tf))}, ::pyreonChartMeasure)`
    : ''
  const cmds = `${chrome.mirror(chrome.wrap(spec.render(items, animating ? { ...args, options: 'pyreonOpts' } : args, KOTLIN_CHART_TARGET)))}${tipCmds}`
  const rawTx = '(pyreonTap.x / pyreonDensity).toDouble()'
  const tx = chrome.plotX(rawTx)
  const tapY = withChrome ? '(pyreonTap.y / pyreonDensity).toDouble() - pyreonTop' : '(pyreonTap.y / pyreonDensity).toDouble()'
  const onSel = e.attrs.find((a) => a.kind === 'event' && (a.name === 'selectindex' || a.name === 'select'))
  const parts: string[] = []
  if (tooltip) parts.push(`pyreonTip = ${spec.tooltip(items, tx, tapY, args, KOTLIN_CHART_TARGET)}; pyreonTipAt = PyreonChartPt(${rawTx}, (pyreonTap.y / pyreonDensity).toDouble())`)
  if (onSel?.kind === 'event') parts.push(kotlinChartSelectBody(onSel.handler, spec.hit(items, tx, tapY, args, KOTLIN_CHART_TARGET), indent))
  // Hoisted items are a captured val — key the tap on them (see the generic host).
  const tap = parts.length === 0 ? '' : `.pointerInput(${hoist ? 'pyreonItems' : 'Unit'}) { detectTapGestures { pyreonTap -> ${parts.join('; ')} } }`
  if (hoist) return kotlinFrameHostWithTap(e, lets, cmds, tap, W, H, hasWidth, indent)
  const size = hasWidth ? `Modifier.width((${W}).dp).height((${H}).dp)` : `Modifier.fillMaxWidth().height((${H}).dp)`
  const generic = host.layoutModifiers(e)
  const titleMod = kotlinChartA11y(e, describe)
  const modifier = size + tap + titleMod + (generic === '' ? '' : generic.replace(/^Modifier/, ''))
  const canvas = kotlinChartCanvas(e, cmds, modifier, indent)
  if (hasWidth && tap === '') return canvas
  const pad = ' '.repeat(indent + 2)
  const widthLine = hasWidth ? '' : `${pad}val pyreonW = maxWidth.value.toDouble()\n`
  const densityLine = tap === '' ? '' : `${pad}val pyreonDensity = LocalDensity.current.density\n`
  return `BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {\n${widthLine}${densityLine}${pad}${canvas}\n${' '.repeat(indent)}}`
}

/** Mirror of the Swift gauge host: renderGauge over a double-height box + the value text. */
function emitKotlinGaugeHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const describe: string | undefined = undefined
  const valueV = chartAttrExprKotlin(e, 'value')
  if (valueV === undefined) {
    host.warn('<GaugeChart>: needs a `value` attribute on native; emitting an empty Box().')
    return 'Box {}'
  }
  const value = `(${host.expr(valueV, indent)}).toDouble()`
  const H = kotlinChartDouble(e, 'height', 140, indent)
  const hasWidth = chartAttrExprKotlin(e, 'width') !== undefined
  const W = hasWidth ? kotlinChartDouble(e, 'width', 240, indent) : 'pyreonW'
  const track = host.staticAttr(e, 'trackColor')
  const valueColor = host.staticAttr(e, 'valueColor')
  const opts = `GaugeOptions(min = ${kotlinChartDouble(e, 'min', 0, indent)}, max = ${kotlinChartDouble(e, 'max', 100, indent)}, sweep = Math.PI, thickness = ${kotlinChartDouble(e, 'thickness', 22, indent)}, trackColor = ${typeof track === 'string' ? kotlinStr(track) : '"rgba(132,150,165,0.22)"'}, valueColor = ${typeof valueColor === 'string' ? kotlinStr(valueColor) : '"#0f766e"'})`
  const showValue = host.staticAttr(e, 'showValue') !== false
  const text = showValue
    ? ` + listOf(PyreonDrawCmd(kind = "text", fill = "#10161d", text = plain(${value}), at = PyreonChartPt(${W} / 2.0, ${H} - 6.0), size = 20.0, align = "middle", baseline = "bottom"))`
    : ''
  // A full `dial` (built on the web by `gaugeDial()`) is a runtime value with no native form: named, and the half-circle track drawn.
  if (chartAttrExprKotlin(e, 'dial') !== undefined) host.warn('<GaugeChart dial>: the full dial is web-only; native draws the half-circle gauge track.')
  const cmds = `renderGauge(${value}, PyreonChartRect(0.0, 0.0, ${W}, ${H} * 2.0), ${opts})${text}`
  const size = hasWidth ? `Modifier.width((${W}).dp).height((${H}).dp)` : `Modifier.fillMaxWidth().height((${H}).dp)`
  const generic = host.layoutModifiers(e)
  const titleMod = kotlinChartA11y(e, describe)
  const canvas = kotlinChartCanvas(e, kotlinRtl(e, W).mirror(cmds), size + titleMod + (generic === '' ? '' : generic.replace(/^Modifier/, '')), indent)
  if (hasWidth) return canvas
  const pad = ' '.repeat(indent + 2)
  return `BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {\n${pad}val pyreonW = maxWidth.value.toDouble()\n${pad}${canvas}\n${' '.repeat(indent)}}`
}

// ---- cartesian-frame hosts (Candlestick / Heatmap) + Radar ----------------

function kotlinChartMap(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  tag: string,
  data: string,
  prop: string,
  wrap: (body: string) => string,
  indent: number,
): string | null | 'unsupported' {
  const acc = kotlinChartAccessor(e, tag, prop, indent)
  if (acc === null || acc === 'unsupported') return acc
  return `${data}.mapIndexed { pyreonI, pyreonD -> ${wrap(acc)} }`
}

function emitKotlinCandlestickHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = 'CandlestickChart'
  const dataV = chartAttrExprKotlin(e, 'data')
  if (dataV === undefined) {
    host.warn(`<${tag}>: needs a \`data\` attribute on native; emitting an empty Box().`)
    return 'Box {}'
  }
  const data = host.expr(dataV, indent)
  const fields: string[] = []
  for (const f of ['open', 'high', 'low', 'close']) {
    const acc = kotlinChartAccessor(e, tag, f, indent)
    if (acc === 'unsupported') return 'Box {}'
    if (acc === null) {
      host.warn(`<${tag}>: needs an \`${f}\` accessor on native; emitting an empty Box().`)
      return 'Box {}'
    }
    fields.push(`${f} = (${acc}).toDouble()`)
  }
  const lets = [`val pyreonCandles: List<Ohlc> = ${data}.mapIndexed { pyreonI, pyreonD -> Ohlc(${fields.join(', ')}) }`]
  const catsM = kotlinChartMap(e, tag, data, 'x', (b) => `pyreonChartString(${b})`, indent)
  if (catsM === 'unsupported') return 'Box {}'
  lets.push(`val pyreonCats: List<String> = ${catsM ?? 'listOf<String>()'}`)
  lets.push(`val pyreonTheme: ChartTheme = ${kotlinChartTheme(e, tag)}`)
  const optV = chartAttrExprKotlin(e, 'candle')
  const options = optV === undefined ? 'null' : host.expr(optV, indent)
  const H = kotlinChartDouble(e, 'height', 200, indent)
  const hasWidth = chartAttrExprKotlin(e, 'width') !== undefined
  const W = hasWidth ? kotlinChartDouble(e, 'width', 300, indent) : 'pyreonW'
  const cmds = `renderCandlestickChart(pyreonCandles, ${W}, ${H}, pyreonCats, pyreonTheme, ${options}, ::pyreonChartMeasure)`
  return kotlinFrameHostLets(e, lets, cmds, (x, y) => `hitCandlestickChart(pyreonCandles, ${W}, ${H}, pyreonCats, pyreonTheme.fontSize, ::pyreonChartMeasure, ${x}, ${y})`, W, H, hasWidth, indent)
}

/** `<BoxplotChart data values x? box? height width title onSelect? onSelectIndex?>` → five-number summaries per row + the shared frame (mirror of the Swift emitter). */
function emitKotlinBoxplotHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = 'BoxplotChart'
  const dataV = chartAttrExprKotlin(e, 'data')
  if (dataV === undefined) {
    host.warn(`<${tag}>: needs a \`data\` attribute on native; emitting an empty Box().`)
    return 'Box {}'
  }
  const data = host.expr(dataV, indent)
  const summaryV = chartAttrExprKotlin(e, 'summary')
  const rowsM = summaryV === undefined
    ? kotlinChartMap(e, tag, data, 'values', (b) => `fiveNumber((${b}).map { it.toDouble() })`, indent)
    : kotlinChartMap(e, tag, data, 'summary', (b) => `FiveNumber(min = (${b}).min.toDouble(), q1 = (${b}).q1.toDouble(), median = (${b}).median.toDouble(), q3 = (${b}).q3.toDouble(), max = (${b}).max.toDouble(), outliers = listOf())`, indent)
  if (rowsM === 'unsupported') return 'Box {}'
  if (rowsM === null) {
    host.warn(`<${tag}>: needs a \`values\` or \`summary\` accessor on native; emitting an empty Box().`)
    return 'Box {}'
  }
  const lets = [`val pyreonBoxes: List<FiveNumber> = ${rowsM}`]
  const catsM = kotlinChartMap(e, tag, data, 'x', (b) => `pyreonChartString(${b})`, indent)
  if (catsM === 'unsupported') return 'Box {}'
  lets.push(`val pyreonCats: List<String> = ${catsM ?? 'listOf<String>()'}`)
  lets.push(`val pyreonTheme: ChartTheme = ${kotlinChartTheme(e, tag)}`)
  if (chartAttrExprKotlin(e, 'format') !== undefined) host.warn(`<${tag} format>: a formatter is not lowered on native; the axis prints plain numbers.`)
  const optV = chartAttrExprKotlin(e, 'box')
  const options = optV === undefined ? 'BoxplotOptions()' : host.expr(optV, indent)
  const H = kotlinChartDouble(e, 'height', 240, indent)
  const hasWidth = chartAttrExprKotlin(e, 'width') !== undefined
  const W = hasWidth ? kotlinChartDouble(e, 'width', 300, indent) : 'pyreonW'
  const cmds = `renderBoxplotChart(pyreonBoxes, ${W}, ${H}, pyreonCats, pyreonTheme, ${options}, ::pyreonChartMeasure${kotlinChartAnimating(e, tag) ? ', null, pyreonEntrance' : ''})`
  return kotlinFrameHostLets(e, lets, cmds, (x, y) => `hitBoxplotChart(pyreonBoxes.size.toLong(), ${W}, ${H}, pyreonCats, pyreonTheme.fontSize, ::pyreonChartMeasure, ${x}, ${y}, pyreonBoxes)`, W, H, hasWidth, indent)
}

function emitKotlinHeatmapHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = 'HeatmapChart'
  const dataV = chartAttrExprKotlin(e, 'data')
  if (dataV === undefined) {
    host.warn(`<${tag}>: needs a \`data\` attribute on native; emitting an empty Box().`)
    return 'Box {}'
  }
  const data = host.expr(dataV, indent)
  const lets: string[] = []
  for (const [prop, name, type, wrap] of [
    ['x', 'pyreonXs', 'List<String>', (b: string) => b],
    ['y', 'pyreonYs', 'List<String>', (b: string) => b],
    ['value', 'pyreonVals', 'List<Double>', (b: string) => `(${b}).toDouble()`],
  ] as const) {
    const m = kotlinChartMap(e, tag, data, prop, wrap, indent)
    if (m === 'unsupported') return 'Box {}'
    if (m === null) {
      host.warn(`<${tag}>: needs a \`${prop}\` accessor on native; emitting an empty Box().`)
      return 'Box {}'
    }
    lets.push(`val ${name}: ${type} = ${m}`)
  }
  lets.push('val pyreonGrid: HeatGrid = heatGridFrom(pyreonXs, pyreonYs, pyreonVals)')
  lets.push(`val pyreonTheme: ChartTheme = ${kotlinChartTheme(e, tag)}`)
  if (e.attrs.some((a) => a.kind === 'event' && a.name === 'select')) {
    host.warn(`<${tag} onSelect>: the cell-shaped callback is not lowered on native; use \`onSelectIndex\` (the index into the grid's cells).`)
  }
  const colorsV = chartAttrExprKotlin(e, 'colors')
  // Mirror of the Swift emitter: the resolved theme, not a light-mode constant.
  const stops = colorsV === undefined ? 'pyreonTheme.ramp' : host.expr(colorsV, indent)
  const gap = kotlinChartDouble(e, 'gap', 1, indent)
  const H = kotlinChartDouble(e, 'height', 200, indent)
  const hasWidth = chartAttrExprKotlin(e, 'width') !== undefined
  const W = hasWidth ? kotlinChartDouble(e, 'width', 300, indent) : 'pyreonW'
  // `visualMap` (mirror of the Swift host).
  const vm = chartVisualMap(chartAttrExprKotlin(e, 'visualMap'), (n) => host.constExpr(n), KOTLIN_CHART_TARGET, (m) => host.warn(m), tag)
  let gW = W
  let gH = H
  let cellStops = stops
  let selection = ''
  let stripCmds = ''
  let extra = ''
  if (vm !== null) {
    lets.push(...kotlinVisualMapState(vm))
    lets.push(`val pyreonStrip: VisualStrip = ${vm.strip}`)
    lets.push(`val pyreonVmPlace = visualStripPlace(pyreonStrip, ${W}, ${H})`)
    gW = 'pyreonVmPlace.chartW'
    gH = 'pyreonVmPlace.chartH'
    if (colorsV === undefined) cellStops = 'pyreonStrip.stops'
    selection = ', HeatSelection(domain = pyreonStrip.domain, inRange = if (pyreonStrip.piecewise) null else pyreonVmRange, outBands = visualOutBands(pyreonStrip, pyreonVmSelected), outColor = pyreonStrip.outColor)'
    stripCmds = ' + renderVisualStrip(pyreonStrip, pyreonVmPlace.at, pyreonVmRange, pyreonVmSelected)'
    const { tapX } = kotlinRtl(e, W)
    extra = kotlinVisualMapGesture((o) => [tapX(`(${o}.x / pyreonDensity).toDouble()`), `(${o}.y / pyreonDensity).toDouble()`])
  }
  const progress = kotlinChartAnimating(e, tag) ? ', pyreonEntrance' : selection === '' ? '' : ', 1.0'
  const cmds = `renderHeatChart(pyreonGrid, ${gW}, ${gH}, pyreonTheme, ${cellStops}, ${gap}, ::pyreonChartMeasure${progress}${selection})${stripCmds}`
  return kotlinFrameHostLets(e, lets, cmds, (x, y) => `hitHeatChart(pyreonGrid, ${gW}, ${gH}, pyreonTheme.fontSize, ${gap}, ::pyreonChartMeasure, ${x}, ${y})`, W, H, hasWidth, indent, ['selectindex'], undefined, extra)
}

function emitKotlinRadarHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = 'RadarChart'
  const dataV = chartAttrExprKotlin(e, 'data')
  const axesV = chartAttrExprKotlin(e, 'axes')
  if (dataV === undefined || axesV === undefined) {
    host.warn(`<${tag}>: needs \`data\` and \`axes\` attributes on native; emitting an empty Box().`)
    return 'Box {}'
  }
  const data = host.expr(dataV, indent)
  const values = kotlinChartAccessor(e, tag, 'values', indent)
  if (values === 'unsupported') return 'Box {}'
  if (values === null) {
    host.warn(`<${tag}>: needs a \`values\` accessor on native; emitting an empty Box().`)
    return 'Box {}'
  }
  const colorAcc = kotlinChartAccessor(e, tag, 'color', indent)
  if (colorAcc === 'unsupported') return 'Box {}'
  const tf = kotlinChartThemeFields(e, tag)
  const color = colorAcc ?? (kotlinChartThemed(e) ? `${tf.palette}[pyreonI % ${tf.palette}.size]` : `listOf(${CHART_HOST_PALETTE.map((c) => kotlinStr(c)).join(', ')})[pyreonI % ${CHART_HOST_PALETTE.length}]`)
  const fillAlpha = kotlinChartDouble(e, 'fillAlpha', 0.25, indent)
  const lets = [`val pyreonSeries: List<RadarSeries> = ${data}.mapIndexed { pyreonI, pyreonD -> RadarSeries(values = (${values}).map { it.toDouble() }, color = ${color}, fillAlpha = ${fillAlpha}) }`]
  const H = kotlinChartDouble(e, 'height', 260, indent)
  const hasWidth = chartAttrExprKotlin(e, 'width') !== undefined
  const W = hasWidth ? kotlinChartDouble(e, 'width', 300, indent) : 'pyreonW'
  let entries = 'listOf<LegendEntry>()'
  if (host.staticAttr(e, 'showLegend') === true) {
    const label = kotlinChartAccessor(e, tag, 'label', indent)
    if (label === 'unsupported') return 'Box {}'
    if (label === null) {
      host.warn(`<${tag} showLegend>: needs a \`label\` accessor for the legend on native; emitting an empty Box().`)
      return 'Box {}'
    }
    entries = `${data}.mapIndexed { pyreonI, pyreonD -> LegendEntry(label = ${label}, color = ${color}) }`
  }
  const chrome = kotlinChartChrome(e, entries, W, H, indent, false, tf)
  lets.push(...chrome.lets)
  const ringsV = chartAttrExprKotlin(e, 'rings')
  const ringsRaw = host.staticAttr(e, 'rings')
  const rings = ringsV === undefined ? '4' : typeof ringsRaw === 'number' ? String(Math.trunc(ringsRaw)) : host.expr(ringsV, indent)
  const showRaw = host.staticAttr(e, 'showLabels')
  const showV = chartAttrExprKotlin(e, 'showLabels')
  const showLabels = showV === undefined ? 'true' : typeof showRaw === 'boolean' ? String(showRaw) : host.expr(showV, indent)
  const opts = `RadarOptions(rings = ${rings}, gridColor = "rgba(132,150,165,0.35)", labelColor = "#5a6b7a", fontSize = 11.0, showLabels = ${showLabels})`
  const box = `PyreonChartRect(0.0, 0.0, ${chrome.width(W)}, ${chrome.height(H)})`
  // NOT `chrome.mirror` here: `kotlinFrameHostLets` mirrors what it is
  // handed, so pre-mirroring would apply the mirror TWICE — and a mirror is
  // its own inverse, so the chart would silently render left-to-right under
  // `rtl`. The Swift twin DOES mirror here because `swiftFrameHost` takes an
  // already-built canvas and cannot.
  const cmds = chrome.wrap(`renderRadar(${host.expr(axesV, indent)}, pyreonSeries, ${box}, ${opts})`)
  // The tap: `hitRadarIndex` against the painted box, the chrome's height off the y (see the Swift twin).
  // `kotlinFrameHostLets` builds the tap from its OWN RTL unmirror, so the
  // chrome's offsets are taken off here: the y by the title + top legend, the
  // x by a left legend's column (the paint is shifted, the LAYOUT box is not).
  const hit = (x: string, y: string): string =>
    `hitRadarIndex(${host.expr(axesV, indent)}, pyreonSeries, ${box}, ${opts}, ${chrome.left === '0.0' ? x : `${x} - ${chrome.left}`}, ${chrome.top === '0.0' ? y : `${y} - ${chrome.top}`}, 8.0)`
  return kotlinFrameHostLets(e, lets, cmds, hit, W, H, hasWidth, indent)
}
