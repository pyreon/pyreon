import { plotMarkColorSlots, chartTooltipFields, chartThemePalette, PLOT_MARK_KINDS, PLOT_UNLOWERED_PROPS, plotUnloweredWarning, PLOT_SPEC_LITERAL_PROPS, PLOT_INDICATOR_MARKS, chartStaticFlag, chartZoomConfig, chartToolboxConfig, chartAreaBrushConfig } from './hosts'
import { kotlinIdent, kotlinStr, type ExprIR } from '@pyreon/native-compiler/plugin-api'
import { CHART_HANDLE_TYPE, CHARTS_PLUGIN_NAME } from './names'
import { host } from './kotlin-facade'
import { KOTLIN_CHART_TARGET, kotlinChartAnimating, chartAttrExprKotlin, kotlinChartDouble, chartEventHandler, kotlinChartSelectBody, kotlinAccessorExpr, kotlinMarkOptionArgs, kotlinChartChrome, kotlinChartThemeFields, kotlinChartThemeFrom, kotlinMarkErrorArgs, kotlinChartFormatter, kotlinBubbleRange, kotlinPlotRowMap, kotlinFrameHostWithDensity, kotlinZoomPresets, kotlinLegendInteraction, kotlinBrushHandler } from './kotlin-support'

/** The `values` expression for a derived (indicator) mark — mirror of `swiftIndicatorValues`. */
function kotlinIndicatorValues(
  ind: { readonly fn: string; readonly takesWindow: boolean },
  m: Extract<ExprIR, { kind: 'call' }>,
  rowMap: string,
  tag: string,
  k: number,
): string | 'unsupported' {
  if (!ind.takesWindow) return `${ind.fn}(${rowMap})`
  const w = m.args[1]
  if (w === undefined || w.kind !== 'literal' || typeof w.value !== 'number') {
    host.warn(
      `<${tag}> mark ${k + 1}: \`${ind.fn.replace('Values', '')}\` needs a NUMERIC LITERAL window on native (\`sma(y, 20)\`); emitting an empty Box().`,
    )
    return 'unsupported'
  }
  return `${ind.fn}(${rowMap}, ${Math.trunc(w.value)})`
}

/** The two Series a `...bollinger(...)` spread expands to — mirror of `swiftBollingerSpread`. */
function kotlinBollingerSpread(
  arg: ExprIR,
  tag: string,
  k: number,
  rows: string,
  windowed: boolean,
  indent: number,
  lets: string[],
  palette: readonly string[],
  namePrefix = 'pyreon',
): string[] | 'unsupported' {
  const call = arg.kind === 'call' && arg.callee.kind === 'identifier' && arg.callee.name === 'bollinger' ? arg : undefined
  if (call === undefined) {
    host.warn(`<${tag}> mark ${k + 1}: only \`...bollinger(y, window)\` is lowered as a spread; emitting an empty Box().`)
    return 'unsupported'
  }
  const y = call.args[0]
  const w = call.args[1]
  if (y === undefined || w === undefined || w.kind !== 'literal' || typeof w.value !== 'number') {
    host.warn(`<${tag}> mark ${k + 1}: \`bollinger\` needs an accessor and a NUMERIC LITERAL window on native; emitting an empty Box().`)
    return 'unsupported'
  }
  const kArg = call.args[2]
  let sd = '2.0'
  if (kArg !== undefined) {
    if (kArg.kind !== 'literal' || typeof kArg.value !== 'number') {
      host.warn(`<${tag}> mark ${k + 1}: \`bollinger\`'s width must be a numeric literal on native; emitting an empty Box().`)
      return 'unsupported'
    }
    sd = String(kArg.value).includes('.') ? String(kArg.value) : `${kArg.value}.0`
  }
  const body = kotlinAccessorExpr(y, tag, `mark ${k + 1}`, indent)
  if (body === 'unsupported') return 'unsupported'
  const opts = kotlinMarkOptionArgs(call.args[3], tag, k, palette)
  if (opts === 'unsupported') return 'unsupported'
  const win = Math.trunc(w.value)
  const rowMap = kotlinPlotRowMap(rows, `(${body}).toDouble()`, windowed)
  lets.push(`val ${namePrefix}Raw${k}: List<Double> = ${rowMap}`)
  lets.push(`val ${namePrefix}Upper${k}: List<Double> = bollingerEdge(${namePrefix}Raw${k}, ${win}, ${sd}, 1.0)`)
  lets.push(`val ${namePrefix}Lower${k}: List<Double> = bollingerEdge(${namePrefix}Raw${k}, ${win}, ${sd}, -1.0)`)
  lets.push(`val ${namePrefix}Mid${k}: List<Double> = smaValues(${namePrefix}Raw${k}, ${win})`)
  return [
    `Series(kind = "band", values = ${namePrefix}Upper${k}, ${[...opts, `values2 = ${namePrefix}Lower${k}`].join(', ')})`,
    `Series(kind = "line", values = ${namePrefix}Mid${k}, ${opts.join(', ')})`,
  ]
}

// ---- `<PlotChart marks>` -----------------------------------------------------

/**
 * `handle={chart}` binds the host to a `createChartHandle()` — the Compose
 * twin of the Swift wrapper: the core emits with the window, pins, hidden
 * series and area brush on; this drops their `remember` state and points the
 * names at the handle's state fields.
 */
export function emitKotlinPlotHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const handleAttr = chartAttrExprKotlin(e, 'handle')
  if (handleAttr === undefined) return emitKotlinPlotHostCore(e, indent, undefined)
  // The host asks the component's DECLARATIONS whether the name is a chart handle — never a plugin's state.
  const handleDecl = handleAttr.kind === 'identifier' ? host.decls(CHARTS_PLUGIN_NAME, CHART_HANDLE_TYPE).find((d) => d.name === handleAttr.name) : undefined
  if (handleAttr.kind !== 'identifier' || handleDecl === undefined) {
    host.warn('<PlotChart handle>: native needs a `const chart = createChartHandle()` declared in the same component; the chart renders without the handle.')
    return emitKotlinPlotHostCore(e, indent, undefined)
  }
  const h = kotlinIdent(handleAttr.name)
  const bound: Readonly<Record<string, string>> = { pyreonZoom: 'zoom', pyreonSelected: 'selected', pyreonHidden: 'hidden', pyreonAreaType: 'brushType', pyreonAreas: 'areas', pyreonHover: 'hover' }
  return emitKotlinPlotHostCore(e, indent, h)
    .split('\n')
    .filter((l) => !/^\s*var pyreon(Zoom|Selected|Hidden|AreaType|Areas|Hover) by remember/.test(l))
    .join('\n')
    .replace(/\bpyreon(Zoom|Selected|Hidden|AreaType|Areas|Hover)\b/g, (m) => `${h}.${bound[m]}`)
}

function emitKotlinPlotHostCore(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number, handle: string | undefined): string {
  const tag = 'PlotChart'
  const dataV = chartAttrExprKotlin(e, 'data')
  const marksV = chartAttrExprKotlin(e, 'marks')
  if (dataV === undefined || marksV === undefined) {
    host.warn(`<${tag}>: needs \`data\` and \`marks\` attributes on native; emitting an empty Box().`)
    return 'Box {}'
  }
  if (marksV.kind !== 'array') {
    host.warn(`<${tag} marks>: must be an inline array of mark calls (\`[bars((d) => d.v), line((d) => d.avg)]\`) on native; emitting an empty Box().`)
    return 'Box {}'
  }
  const data = host.expr(dataV, indent)
  const flag = (prop: string): boolean => chartStaticFlag(e, tag, prop, (name) => host.staticAttr(e, name), (w) => host.warn(w))
  const zoomed = flag('dataZoom')
  const presetsRaw = kotlinZoomPresets(e, tag)
  const presets = presetsRaw === 'unsupported' ? undefined : presetsRaw
  let navigating = flag('navigator')
  if (navigating && marksV.elements.length === 0) {
    host.warn(`<${tag} navigator>: needs at least one mark (the strip shows the first one); the chart renders without the navigator.`)
    navigating = false
  }
  const horizontal = flag('horizontal')
  let brushing = flag('brush') && !horizontal
  if (brushing && zoomed) {
    host.warn(`<${tag} brush>: with \`dataZoom\` the web brushes on Shift+drag, which touch has not — on native the plain drag pans, so the brush stays web-only in that combination; the chart renders without it.`)
    brushing = false
  }
  const onBrush = brushing ? kotlinBrushHandler(e, tag) : undefined
  const zoomCfgK = chartZoomConfig((n) => chartAttrExprKotlin(e, n), (n) => host.constExpr(n), KOTLIN_CHART_TARGET, (m) => host.warn(m), tag)
  // An opening window slices the rows even with no gesture to move it.
  const toolbox = chartToolboxConfig(chartAttrExprKotlin(e, 'toolbox'), (n) => host.constExpr(n), (m) => host.warn(m), tag)
  // ECharts' area brush (rect / polygon / lineX / lineY), shared with the web through `brush-area`.
  const areaCfg = chartAreaBrushConfig((n) => host.staticAttr(e, n), (n) => chartAttrExprKotlin(e, n) !== undefined, toolbox?.brush ?? [], (m) => host.warn(m), tag, (n) => chartAttrExprKotlin(e, n), (n) => host.constExpr(n))
  const area = handle === undefined ? areaCfg : { ...areaCfg, on: true }
  const windowed = zoomed || presets !== undefined || navigating || zoomCfgK.initial !== null || toolbox?.dataZoom === true || handle !== undefined
  /** A gesture's window, held to `zoomLimits` when the chart has them. */
  const lim = (expr: string): string => (zoomCfgK.limits === null ? expr : `limitZoomWindow(${zoomCfgK.limits}, pyreonZoom, ${expr})`)
  const win = windowed ? 'pyreonZoom' : zoomCfgK.initial ?? 'ZoomWindow(start = 0.0, end = 1.0)'
  const legendBase = kotlinLegendInteraction(e)
  // A handle's legend actions hide series whether or not a legend is drawn to tap.
  const legend = { ...legendBase, hiding: legendBase.toggling || handle !== undefined }
  const lets: string[] = []
  if (windowed) {
    lets.push(`var pyreonZoom by remember { mutableStateOf(${zoomCfgK.initial ?? 'ZoomWindow(start = 0.0, end = 1.0)'}) }`)
    lets.push(`val pyreonRange: SliceRange = sliceRange(pyreonZoom, ${data}.size.toLong())`)
    lets.push(`val pyreonSourceRows = ${data}.subList(pyreonRange.from.toInt(), pyreonRange.to.toInt())`)
    // `onZoom` — one effect keyed on the window state covers pinch, pan, a
    // preset tap and the navigator alike, as the web's single observer does.
    const onZoom = e.attrs.find((a) => a.kind === 'event' && a.name === 'zoom')
    if (onZoom?.kind === 'event') lets.push(`LaunchedEffect(pyreonZoom) { ${kotlinChartSelectBody(onZoom.handler, 'pyreonZoom', indent)} }`)
  }
  if (navigating) {
    lets.push('var pyreonNavKind by remember { mutableStateOf(0L) }')
    lets.push('var pyreonNavAnchor by remember { mutableStateOf(ZoomWindow(start = 0.0, end = 1.0)) }')
    lets.push('var pyreonNavDx by remember { mutableStateOf(0.0) }')
  }
  if (brushing) {
    lets.push('var pyreonBrushStart by remember { mutableStateOf(-1L) }')
    lets.push('var pyreonBrushEnd by remember { mutableStateOf(-1L) }')
    lets.push('var pyreonBrushA by remember { mutableStateOf(-1.0) }')
    lets.push('var pyreonBrushB by remember { mutableStateOf(-1.0) }')
  }
  if (toolbox !== null) {
    if (toolbox.magic) {
      lets.push('var pyreonMagicKind by remember { mutableStateOf("") }')
      lets.push('var pyreonMagicStack by remember { mutableStateOf("") }')
    }
    if (toolbox.dataZoom) {
      lets.push('var pyreonZoomSelect by remember { mutableStateOf(false) }')
      lets.push('var pyreonZoomHistory by remember { mutableStateOf(listOf<ZoomWindow>()) }')
      lets.push('var pyreonSelA by remember { mutableStateOf(-1.0) }')
      lets.push('var pyreonSelB by remember { mutableStateOf(-1.0) }')
    }
    if (toolbox.dataView) lets.push('var pyreonDataView by remember { mutableStateOf(false) }')
    if (toolbox.save) lets.push('val pyreonContext = LocalContext.current')
  }
  if (area.on) {
    lets.push(`var pyreonAreaType by remember { mutableStateOf(${JSON.stringify(area.initial)}) }`)
    lets.push(`var pyreonAreaKeep by remember { mutableStateOf(${area.keep}) }`)
    lets.push('var pyreonAreas by remember { mutableStateOf(listOf<BrushArea>()) }')
    lets.push('var pyreonAreaLive by remember { mutableStateOf<BrushArea?>(null) }')
  }
  if (legend.hiding) lets.push('var pyreonHidden by remember { mutableStateOf(listOf<Long>()) }')
  // The handle's `legendInverseSelect` flips over the series this chart draws.
  if (handle !== undefined) lets.push(`LaunchedEffect(Unit) { ${handle}.seriesCount = ${marksV.elements.length} }`)
  // `selectedMode` — the Swift half's twin. A TAP pins a datum, which is the
  // half of the events model a touch target actually has; `emphasis`'s hover
  // band and `onHighlight` are mouseover-driven and stay declined. The engine
  // draws a pinned datum from `ChartSpec.emphasis`; this is the state saying
  // which. Declared HERE rather than beside the spec arg because Compose reads
  // the state from `lets`, which is emitted before the spec is built.
  const pinMode = host.staticAttr(e, 'selectedMode')
  const pinning = pinMode === 'single' || pinMode === 'multiple'
  // `selectedMode: 'series'` pins the WHOLE series a tap lands on — its own host-local state (no handle vocabulary yet).
  const seriesPinning = pinMode === 'series'
  if (seriesPinning) lets.push('var pyreonSelectedSeries by remember { mutableStateOf(listOf<Long>()) }')
  if (pinning || handle !== undefined) lets.push('var pyreonSelected by remember { mutableStateOf(listOf<Long>()) }')
  if (legend.paging) lets.push('var pyreonLegendPage by remember { mutableStateOf(0.0) }')
  const maxPoints = chartAttrExprKotlin(e, 'maxPoints')
  const fullA11y = windowed || maxPoints !== undefined
  let decimated = false
  let rows = windowed ? 'pyreonSourceRows' : data
  // The theme's palette colours marks with no `color` (the theme builder already warned about a bad literal, so this parse stays silent).
  const pyreonPalette = chartThemePalette(chartAttrExprKotlin(e, 'theme'), tag, () => {}, host.colorScope()?.palette as readonly string[] | undefined)
  const series: string[] = []
  const fullA11ySeries: string[] = []
  let navValues = ''
  // Colour follows the mark's LABEL, as the web's `resolveMarks` does.
  const colorSlots = plotMarkColorSlots(marksV.elements)
  for (let k = 0; k < marksV.elements.length; k++) {
    const m = marksV.elements[k]!
    // `...bollinger(...)` — mirror of the Swift emitter.
    if (m.kind === 'spread') {
      if (k === 0 && maxPoints !== undefined) {
        host.warn(`<${tag} maxPoints>: the first mark is a spread indicator, whose derived values are not available until after mark expansion on native; row thinning is skipped.`)
      }
      const expanded = kotlinBollingerSpread(m.argument, tag, k, rows, windowed, indent, lets, pyreonPalette)
      if (expanded === 'unsupported') return 'Box {}'
      for (const line of expanded) series.push(line)
      if (fullA11y) {
        const full = kotlinBollingerSpread(m.argument, tag, k, data, false, indent, lets, pyreonPalette, 'pyreonA11y')
        if (full === 'unsupported') return 'Box {}'
        for (const line of full) fullA11ySeries.push(line)
      }
      continue
    }
    const callee = m.kind === 'call' && m.callee.kind === 'identifier' ? m.callee.name : undefined
    const bubble = callee === 'bubble'
    // `band(low, high, options)` reads its channels in the opposite order to
    // every other mark (see the Swift twin).
    const isBand = callee === 'band'
    // A DERIVED mark — mirror of the Swift emitter.
    const indicator = callee === undefined ? undefined : PLOT_INDICATOR_MARKS[callee]
    const kind = callee === undefined ? undefined : bubble ? 'points' : (indicator?.kind ?? PLOT_MARK_KINDS[callee])
    if (m.kind !== 'call' || kind === undefined) {
      host.warn(`<${tag}> mark ${k + 1}: this mark is not lowered on native; emitting an empty Box().`)
      return 'Box {}'
    }
    const y = isBand ? m.args[1] : m.args[0]
    if (y === undefined) {
      // Named per mark: `band` takes TWO accessors, so "needs an accessor"
      // on its own leaves the reader guessing which one is missing.
      host.warn(
        isBand
          ? `<${tag}> mark ${k + 1}: \`band\` needs both an upper and a lower accessor — \`band(low, high)\`; emitting an empty Box().`
          : `<${tag}> mark ${k + 1}: needs an accessor; emitting an empty Box().`,
      )
      return 'Box {}'
    }
    const body = kotlinAccessorExpr(y, tag, `mark ${k + 1}`, indent)
    if (body === 'unsupported') return 'Box {}'
    if (k === 0 && maxPoints !== undefined) {
      const max = `(${host.expr(maxPoints, indent)}).toLong()`
      lets.push(`val pyreonMaxPoints: Long = ${max}`)
      lets.push(`val pyreonDecimateValues: List<Double> = ${kotlinPlotRowMap(rows, `(${body}).toDouble()`, windowed)}`)
      lets.push(`val pyreonKeep: List<Long> = if (pyreonMaxPoints >= 3 && ${rows}.size > pyreonMaxPoints) lttbIndices(listOf(), pyreonDecimateValues, pyreonMaxPoints) else ${rows}.indices.map { it.toLong() }`)
      lets.push(`val pyreonRows = pyreonKeep.map { ${rows}[it.toInt()] }`)
      rows = 'pyreonRows'
      decimated = true
    }
    const optsArg = bubble || isBand || indicator?.takesWindow === true ? m.args[2] : m.args[1]
    const opts = kotlinMarkOptionArgs(optsArg, tag, k, pyreonPalette, colorSlots[k] ?? k)
    if (opts === 'unsupported') return 'Box {}'
    const rowMap = kotlinPlotRowMap(rows, `(${body}).toDouble()`, windowed, decimated)
    const derivedValues = indicator === undefined ? undefined : kotlinIndicatorValues(indicator, m, rowMap, tag, k)
    if (derivedValues === 'unsupported') return 'Box {}'
    lets.push(`val pyreonValues${k}: List<Double> = ${derivedValues ?? rowMap}`)
    // The bounds ride the same row map the values do (mirror of the Swift emitter).
    const errArgs = kotlinMarkErrorArgs(optsArg, tag, k, rows, windowed, indent, lets, decimated)
    if (errArgs === 'unsupported') return 'Box {}'
    let a11yErrArgs: string[] = []
    if (fullA11y && errArgs.length > 0) {
      const fullErr = kotlinMarkErrorArgs(optsArg, tag, k, data, false, indent, lets, false, 'pyreonA11y')
      if (fullErr === 'unsupported') return 'Box {}'
      a11yErrArgs = fullErr
    }
    if (fullA11y) {
      const fullRows = kotlinPlotRowMap(data, `(${body}).toDouble()`, false)
      const fullValues = indicator === undefined ? fullRows : kotlinIndicatorValues(indicator, m, fullRows, tag, k)
      if (fullValues === 'unsupported') return 'Box {}'
      lets.push(`val pyreonA11yValues${k}: List<Double> = ${fullValues}`)
    }
    if (k === 0 && navigating) navValues = kotlinPlotRowMap(data, `(${body}).toDouble()`, false)
    if (bubble) {
      const r = m.args[1]
      if (r === undefined) {
        host.warn(`<${tag}> mark ${k + 1}: \`bubble\` needs a radius accessor; emitting an empty Box().`)
        return 'Box {}'
      }
      const rBody = kotlinAccessorExpr(r, tag, `mark ${k + 1} radius`, indent)
      if (rBody === 'unsupported') return 'Box {}'
      const range = kotlinBubbleRange(optsArg)
      // The RAW r values beside the pixel radii — the mirror of the Swift
      // emitter; the table and tooltip report the datum, not the radius.
      lets.push(`val pyreonRRaw${k}: List<Double> = ${kotlinPlotRowMap(rows, `(${rBody}).toDouble()`, windowed, decimated)}`)
      lets.push(`val pyreonRadii${k}: List<Double> = bubbleRadii(pyreonRRaw${k}, ${range[0]}, ${range[1]})`)
      const at = opts.findIndex((o) => o.startsWith('showValues =')) + 1
      const withRadii = [...opts.slice(0, at), `rValues = pyreonRRaw${k}`, `radii = pyreonRadii${k}`, ...opts.slice(at)]
      series.push(`Series(kind = "points", values = pyreonValues${k}, ${[...withRadii, ...errArgs].join(', ')})`)
      if (fullA11y) {
        lets.push(`val pyreonA11yRRaw${k}: List<Double> = ${kotlinPlotRowMap(data, `(${rBody}).toDouble()`, false)}`)
        const a11yAt = opts.findIndex((o) => o.startsWith('showValues =')) + 1
        const a11yOpts = [...opts.slice(0, a11yAt), `rValues = pyreonA11yRRaw${k}`, ...opts.slice(a11yAt)]
        fullA11ySeries.push(`Series(kind = "points", values = pyreonA11yValues${k}, ${[...a11yOpts, ...a11yErrArgs].join(', ')})`)
      }
    } else if (isBand) {
      const lo = m.args[0]
      if (lo === undefined) {
        host.warn(`<${tag}> mark ${k + 1}: \`band\` needs a lower-bound accessor; emitting an empty Box().`)
        return 'Box {}'
      }
      const loBody = kotlinAccessorExpr(lo, tag, `mark ${k + 1} lower bound`, indent)
      if (loBody === 'unsupported') return 'Box {}'
      lets.push(`val pyreonLow${k}: List<Double> = ${kotlinPlotRowMap(rows, `(${loBody}).toDouble()`, windowed, decimated)}`)
      series.push(`Series(kind = "band", values = pyreonValues${k}, ${[...opts, ...errArgs, `values2 = pyreonLow${k}`].join(', ')})`)
      if (fullA11y) {
        lets.push(`val pyreonA11yLow${k}: List<Double> = ${kotlinPlotRowMap(data, `(${loBody}).toDouble()`, false)}`)
        fullA11ySeries.push(`Series(kind = "band", values = pyreonA11yValues${k}, ${[...opts, ...a11yErrArgs, `values2 = pyreonA11yLow${k}`].join(', ')})`)
      }
    } else {
      series.push(`Series(kind = ${kotlinStr(kind)}, values = pyreonValues${k}, ${[...opts, ...errArgs].join(', ')})`)
      if (fullA11y) fullA11ySeries.push(`Series(kind = ${kotlinStr(kind)}, values = pyreonA11yValues${k}, ${[...opts, ...a11yErrArgs].join(', ')})`)
    }
  }
  if (legend.hiding) {
    lets.push(`val pyreonSeriesAll: List<Series> = listOf(${series.join(', ')})`)
    lets.push('val pyreonSeries: List<Series> = hideHiddenSeries(pyreonSeriesAll, pyreonHidden)')
  } else {
    lets.push(`val pyreonSeries: List<Series> = listOf(${series.join(', ')})`)
  }
  if (fullA11y) lets.push(`val pyreonA11ySeriesSource: List<Series> = listOf(${fullA11ySeries.join(', ')})`)
  const xAcc = chartAttrExprKotlin(e, 'x')
  if (xAcc !== undefined) {
    const body = kotlinAccessorExpr(xAcc, tag, 'x', indent)
    if (body === 'unsupported') return 'Box {}'
    const cat = `pyreonChartString(${body})`
    lets.push(`val pyreonCats: List<String> = ${kotlinPlotRowMap(rows, cat, windowed, decimated)}`)
    if (fullA11y) lets.push(`val pyreonA11yCats: List<String> = ${kotlinPlotRowMap(data, cat, false)}`)
  } else {
    lets.push('val pyreonCats: List<String> = listOf<String>()')
    if (fullA11y) lets.push('val pyreonA11yCats: List<String> = listOf<String>()')
  }
  // Mirror of the Swift emitter: `by` keys each drawn row, over the same rows as the values.
  const byAcc = chartAttrExprKotlin(e, 'by')
  let keyed = false
  if (byAcc !== undefined) {
    const body = kotlinAccessorExpr(byAcc, tag, 'by', indent)
    if (body === 'unsupported') return 'Box {}'
    lets.push(`val pyreonRowKeys: List<String> = ${kotlinPlotRowMap(rows, `pyreonChartString(${body})`, windowed, decimated)}`)
    keyed = true
  }
  const xValueAcc = chartAttrExprKotlin(e, 'xValue')
  if (xValueAcc !== undefined) {
    const body = kotlinAccessorExpr(xValueAcc, tag, 'xValue', indent)
    if (body === 'unsupported') return 'Box {}'
    lets.push(`val pyreonXValues: List<Double> = ${kotlinPlotRowMap(rows, `(${body}).toDouble()`, windowed, decimated)}`)
  }
  const present = PLOT_UNLOWERED_PROPS.filter((p) => chartAttrExprKotlin(e, p) !== undefined || e.attrs.some((a) => a.kind === 'event' && 'on' + a.name === p.toLowerCase()))
  if (!windowed && e.attrs.some((a) => a.kind === 'event' && a.name === 'zoom')) host.warn('<PlotChart onZoom>: needs `dataZoom`, `zoomPresets` or `navigator` — without a window there is nothing to report.')
  if (present.length > 0) host.warn(plotUnloweredWarning(tag, present))
  const H = kotlinChartDouble(e, 'height', 200, indent)
  const hasWidth = chartAttrExprKotlin(e, 'width') !== undefined
  const W = hasWidth ? kotlinChartDouble(e, 'width', 300, indent) : 'pyreonW'
  const entries = legend.toggling
    ? // One entry per label, as the web draws it (the engine's `legendEntriesGrouped`).
      'legendEntriesGrouped(pyreonSeriesAll.map { it.label }, pyreonSeriesAll.map { it.color }, pyreonHidden)'
    : 'legendEntriesGrouped(pyreonSeries.map { it.label }, pyreonSeries.map { it.color }, listOf())'
  const tf = kotlinChartThemeFields(e, tag)
  const chrome = kotlinChartChrome(e, entries, W, H, indent, true, tf, legend.paging ? 'pyreonLegendPage' : undefined)
  lets.push(...chrome.lets)
  const theme = kotlinChartThemeFrom(tf)
  const themed = presets !== undefined || navigating
  if (themed) lets.push(`val pyreonTheme: ChartTheme = ${theme}`)
  if (presets !== undefined) {
    lets.push(`val pyreonPresets: List<ZoomPreset> = listOf(${presets.join(', ')})`)
    lets.push(`val pyreonPresetStrip: PresetLayout = renderPresets(pyreonPresets, ${data}.size.toLong(), pyreonZoom, PyreonChartRect(0.0, 0.0, ${W}, ${H}), PresetOptions(fontSize = 11.0, padX = 8.0, padY = 3.0, gap = 6.0, inset = 8.0, activeFill = pyreonTheme.axis, idleFill = pyreonTheme.grid, activeText = "#ffffff", idleText = pyreonTheme.label), ::pyreonChartMeasure)`)
  }
  const belowNav = presets === undefined ? '' : ' - pyreonPresetStrip.height'
  if (navigating) {
    // Thinned to the strip's width, exactly as the web host does: a 36px-tall
    // overview needs the min/max envelope per pixel column, not 100k points.
    // Without this the native navigator resolved and drew EVERY row on every
    // frame — the same defect the web host had before `minMaxBuckets` was
    // wired there, and worse here because the target has less headroom.
    lets.push(`val pyreonNavValues: List<Double> = minMaxBuckets(${navValues}, maxOf(1L, (${W} / 2.0).toLong()))`)
    lets.push(`val pyreonNavigator: NavigatorLayout = renderNavigator(pyreonNavValues, pyreonSeries[0].color, pyreonZoom, PyreonChartRect(0.0, 0.0, ${W}, ${H}${belowNav}), pyreonTheme.grid)`)
  }
  const bool = (name: string, fallback: boolean): string => {
    const raw = host.staticAttr(e, name)
    const v = chartAttrExprKotlin(e, name)
    return v === undefined ? String(fallback) : typeof raw === 'boolean' ? String(raw) : host.expr(v, indent)
  }
  const below = `${belowNav}${navigating ? ' - pyreonNavigator.height' : ''}`
  const locale = chartAttrExprKotlin(e, 'locale')
  if (locale !== undefined) lets.push(`val pyreonLocale: String = ${host.expr(locale, indent)}`)
  const specArgs = [
    `width = ${chrome.width(W)}`,
    `height = ${chrome.height(H)}${below}`,
    'series = pyreonSeries',
    'categories = pyreonCats',
    `theme = ${themed ? 'pyreonTheme' : theme}`,
    `showXAxis = ${bool('showXAxis', true)}`,
    `showYAxis = ${bool('showYAxis', true)}`,
    `showGrid = ${bool('showGrid', true)}`,
    ...(host.staticAttr(e, 'endLabels') === true ? ['endLabels = true'] : []),
    ...(['xTicks', 'yTicks'] as const).flatMap((k) => {
      const v = host.staticAttr(e, k)
      return typeof v === 'number' ? [`${k} = ${Number.isInteger(v) ? `${v}.0` : v}`] : []
    }),
  ]
  // Mirror of the Swift emitter — ChartSpec field 10, before `yFormat`.
  const yDom = chartAttrExprKotlin(e, 'yDomain')
  if (yDom !== undefined) specArgs.push(`yDomain = ${host.expr(yDom, indent)}`)
  const yFormat = kotlinChartFormatter(e, 'format', indent) ?? (locale === undefined ? undefined : 'pyreonLocaleNumberFormatter(pyreonLocale)')
  if (yFormat !== undefined) specArgs.push(`yFormat = ${yFormat}`)
  const xFormat = kotlinChartFormatter(e, 'xFormat', indent) ?? (locale !== undefined && host.staticAttr(e, 'xTime') === true ? 'pyreonLocaleDateFormatter(pyreonLocale)' : undefined)
  if (xFormat !== undefined) specArgs.push(`xFormat = ${xFormat}`)
  const y2 = chartAttrExprKotlin(e, 'y2Domain')
  if (y2 !== undefined) specArgs.push(`y2Domain = ${host.expr(y2, indent)}`)
  const y2Format = kotlinChartFormatter(e, 'y2Format', indent)
  if (y2Format !== undefined) specArgs.push(`y2Format = ${y2Format}`)
  if (xValueAcc !== undefined) specArgs.push('xValues = pyreonXValues')
  if (host.staticAttr(e, 'xTime') === true) specArgs.push('xTime = true')
  if (host.staticAttr(e, 'horizontal') === true) specArgs.push('horizontal = true')
  const ann = chartAttrExprKotlin(e, 'annotations')
  // Steered to the engine structs: `{ x, label }` also matches `RiverTick` by field set, and an unsteered literal resolved to it.
  if (ann !== undefined) specArgs.push(`annotations = ${host.exprAs({ kind: 'array', element: { kind: 'typeRef', name: 'Annotation', args: [] } }, ann, indent)}`)
  const mk = chartAttrExprKotlin(e, 'markers')
  if (mk !== undefined) specArgs.push(`markers = ${host.exprAs({ kind: 'array', element: { kind: 'typeRef', name: 'PointMarker', args: [] } }, mk, indent)}`)
  if (kotlinChartAnimating(e, 'PlotChart')) specArgs.push('progress = pyreonEntrance')
  if (pinning || handle !== undefined) {
    const selected = decimated
      ? `pyreonSelected.mapNotNull { pyreonGlobal -> pyreonKeep.indexOf(pyreonGlobal${windowed ? ' - pyreonRange.from' : ''}).takeIf { it >= 0 }?.toLong() }`
      : windowed
        ? `pyreonSelected.map { it - pyreonRange.from }.filter { it >= 0 && it < ${rows}.size }`
        : 'pyreonSelected'
    specArgs.push(`emphasis = Emphasis(highlight = ${handle === undefined ? '-1L' : 'pyreonHover'}, selected = ${selected})`)
  }
  // The batch-2 spec switches: a literal each, straight onto the spec.
  for (const p of PLOT_SPEC_LITERAL_PROPS) {
    const raw = host.staticAttr(e, p.name)
    const v = chartAttrExprKotlin(e, p.name)
    if (v === undefined) continue
    if (typeof raw !== p.kind) {
      host.warn(`<${tag}>: \`${p.name}\` must be a ${p.kind} literal on native; the prop is ignored.`)
      continue
    }
    specArgs.push(`${p.name} = ${p.kind === 'string' ? kotlinStr(raw) : p.kind === 'number' ? (Number.isInteger(raw) ? `${String(raw)}.0` : String(raw)) : String(raw)}`)
  }
  if (keyed) specArgs.push('rowKeys = pyreonRowKeys')
  const magicBuilt = toolbox?.magic === true ? `applyMagicType(ChartSpec(${specArgs.join(', ')}), pyreonMagicKind, pyreonMagicStack)` : `ChartSpec(${specArgs.join(', ')})`
  // Applied before the brush, which only re-colours out-of-brush datums and must see the series pins already in the fills it starts from.
  const specBuilt = seriesPinning ? `applySeriesSelection(${magicBuilt}, pyreonSelectedSeries)` : magicBuilt
  if (area.on) {
    // The brush only re-colours datums: the base spec's layout is the brushed spec's layout.
    lets.push(`val pyreonSpecBase: ChartSpec = ${specBuilt}`)
    lets.push('val pyreonAreasNow: List<BrushArea> = pyreonAreaLive?.let { pyreonAreas + it } ?: pyreonAreas')
    lets.push('val pyreonAreaPlot: PyreonChartRect = layoutChart(pyreonSpecBase, ::pyreonChartMeasure).plot')
    lets.push(`val pyreonSpec: ChartSpec = applyBrushSelection(pyreonSpecBase, ${area.only.length === 0 ? '' : 'brushOnlySeries('}brushSelection(pyreonSpecBase, layoutChart(pyreonSpecBase, ::pyreonChartMeasure), pyreonAreasNow)${area.only.length === 0 ? '' : `, listOf(${area.only.map((x) => `${x}.0`).join(', ')}))`}, pyreonAreasNow.isNotEmpty(), ${Number.isInteger(area.opacity) ? `${area.opacity}.0` : String(area.opacity)})`)
  } else {
    lets.push(`val pyreonSpec: ChartSpec = ${specBuilt}`)
  }
  if (toolbox !== null) {
    const actives = [
      toolbox.magic ? 'if (pyreonMagicKind == "bar") "magicBar" else if (pyreonMagicKind == "line") "magicLine" else ""' : '""',
      toolbox.magic ? 'if (pyreonMagicStack == "stack") "magicStack" else if (pyreonMagicStack == "tiled") "magicTiled" else ""' : '""',
      toolbox.dataZoom ? 'if (pyreonZoomSelect) "dataZoom" else ""' : '""',
      toolbox.dataView ? 'if (pyreonDataView) "dataView" else ""' : '""',
      ...(area.on ? ['if (pyreonAreaType == "rect") "brushRect" else if (pyreonAreaType == "polygon") "brushPolygon" else if (pyreonAreaType == "lineX") "brushLineX" else if (pyreonAreaType == "lineY") "brushLineY" else ""', 'if (pyreonAreaKeep) "brushKeep" else ""'] : []),
    ]
    lets.push(`val pyreonTools: List<String> = listOf(${toolbox.tools.map((t) => JSON.stringify(t)).join(', ')})`)
    lets.push(`val pyreonToolbox: ToolboxLayout = renderToolbox(pyreonTools, PyreonChartRect(0.0, 0.0, ${W}, ${H}), ToolboxOptions(fontSize = 11.0, color = pyreonSpec.theme.label, actives = listOf(${actives.join(', ')})))`)
    if (toolbox.dataZoom && !brushing) lets.push('val pyreonPlot: PyreonChartRect = layoutChart(pyreonSpec, ::pyreonChartMeasure).plot')
  }
  if (brushing) {
    lets.push('val pyreonPlot: PyreonChartRect = layoutChart(pyreonSpec, ::pyreonChartMeasure).plot')
    lets.push(
      `val pyreonBrushCmds: List<PyreonDrawCmd> = if (pyreonBrushA >= 0.0) renderBrushBand(pyreonPlot, minOf(pyreonBrushA, pyreonBrushB), maxOf(pyreonBrushA, pyreonBrushB), pyreonSpec.theme.axis) else if (pyreonBrushStart >= 0) run { val pyreonBand = brushBand(pyreonPlot, BrushRange(start = pyreonBrushStart, end = pyreonBrushEnd), ${win}, ${data}.size.toLong()); if (pyreonBand.visible) renderBrushBand(pyreonPlot, pyreonBand.lo, pyreonBand.hi, pyreonSpec.theme.axis) else listOf() } else listOf()`,
    )
  }
  const extraCmds = `${navigating ? ' + pyreonNavigator.cmds' : ''}${presets === undefined ? '' : ' + pyreonPresetStrip.cmds'}${toolbox === null ? '' : ' + pyreonToolbox.cmds'}`
  // `tooltip` as a tap — mirror of the Swift emitter (a named `tooltipFormatter` lowers; an inline one is reported).
  const tooltip = host.staticAttr(e, 'tooltip') === true
  const tipFormatter = chartAttrExprKotlin(e, 'tooltipFormatter')
  let tipLines = `tooltipLines(tooltipAt(pyreonLocal, pyreonCats, pyreonSeries.map { TooltipSeries(label = it.label, values = it.values, color = it.color, values2 = it.values2, rValues = it.rValues) })${yFormat === undefined ? '' : `, ${yFormat}`})`
  if (tooltip && tipFormatter !== undefined) {
    if (tipFormatter.kind === 'identifier') tipLines = `${kotlinIdent(tipFormatter.name)}(tooltipAt(pyreonLocal, pyreonCats, pyreonSeries.map { TooltipSeries(label = it.label, values = it.values, color = it.color, values2 = it.values2, rValues = it.rValues) })).split("\\n")`
    else host.warn('<PlotChart tooltipFormatter>: must be a NAMED function on native — an inline arrow is not lowered; the default lines apply.')
  }
  if (tooltip) {
    lets.push('var pyreonTip by remember { mutableStateOf(listOf<String>()) }')
    lets.push('var pyreonTipAt by remember { mutableStateOf(PyreonChartPt(0.0, 0.0)) }')
  }
  const tipCmds = tooltip
    ? ` + renderTooltip(pyreonTip, pyreonTipAt, ${KOTLIN_CHART_TARGET.rect('0.0', '0.0', W, H)}, ${KOTLIN_CHART_TARGET.struct('TooltipOptions', chartTooltipFields(tf))}, ::pyreonChartMeasure)`
    : ''
  // `rtl` — the same seam the web host uses (`present` in canvas-host.tsx):
  // the FINISHED list is mirrored about the canvas centreline, so chrome,
  // plot and extras mirror together and no layout code changes. The tooltip
  // is deliberately NOT mirrored — it is drawn at the raw tap point, which is
  // already a visual coordinate.
  const selectBand = toolbox?.dataZoom === true ? ' + (if (pyreonSelA >= 0.0) renderBrushBand(pyreonPlot, minOf(pyreonSelA, pyreonSelB), maxOf(pyreonSelA, pyreonSelB), "#6366f1") else listOf())' : ''
  const areaCovers = area.on ? ' + renderBrushAreas(pyreonAreasNow, "rgba(120,120,140,0.18)", pyreonSpec.theme.axis)' : ''
  const painted = `${chrome.wrap(`renderChart(pyreonSpec, ::pyreonChartMeasure)${brushing ? ' + pyreonBrushCmds' : ''}${selectBand}${areaCovers}`)}${extraCmds}`
  const cmds = `${chrome.mirror(painted)}${tipCmds}`
  // saveAsImage reads the chart as drawn, bound once in composition (the tap lambda cannot call the composables it may contain).
  if (toolbox?.save === true) lets.push(`val pyreonPaintedNow: List<PyreonDrawCmd> = ${chrome.mirror(painted)}`)
  const localHit = (x: string, y: string): string => `plotHitBars(pyreonSpec, ::pyreonChartMeasure, ${x}, ${chrome.top === '0.0' ? y : `${y} - pyreonTop`})`
  const hit = (x: string, y: string): string => {
    const local = tooltip ? 'pyreonLocal' : 'pyreonHit'
    const mapped = decimated ? `pyreonKeep[${local}.toInt()]` : local
    const global = windowed ? `${mapped} + pyreonRange.from` : mapped
    if (tooltip) return `(if (${local} < 0) -1L else ${global})`
    if (!windowed && !decimated) return localHit(x, y)
    return `run { val pyreonHit = ${localHit(x, y)}; if (pyreonHit < 0) -1L else ${global} }`
  }
  // `onBrushSelected`: the areas' datums per series, each index GLOBAL (the window's and decimation's mapping, as a tap's).
  const onAreaSel = chartEventHandler(e, 'brushselected')
  const areaReport = (areasExpr: string): string => {
    if (onAreaSel === undefined) return ''
    const mapped = decimated ? 'pyreonKeep[pyreonV]' : 'pyreonV'
    const global = windowed ? `${mapped} + pyreonRange.from` : mapped
    return `; ${kotlinChartSelectBody(onAreaSel, `${area.only.length === 0 ? '' : 'brushOnlySeries('}brushSelection(pyreonSpec, layoutChart(pyreonSpec, ::pyreonChartMeasure), ${areasExpr})${area.only.length === 0 ? '' : `, listOf(${area.only.map((x) => `${x}.0`).join(', ')}))`}.map { pyreonS -> BrushSeriesSelection(seriesIndex = pyreonS.seriesIndex, dataIndex = pyreonS.dataIndex.map { pyreonV -> ${global} }) }`, indent)}`
  }
  const onSel = e.attrs.find((a) => a.kind === 'event' && (a.name === 'selectindex' || a.name === 'select'))
  // Two x's, because the chrome and the plot are laid out in different
  // spaces: `tapX` is CANVAS (RTL-unmirrored — an RTL tap is mirrored back
  // before anything is asked about it) and is what the legend's entries, its
  // pager and the preset strip are drawn in; `plotX` takes a left legend's
  // indent off as well, and is what the plot's own hit test reads.
  const rawTapX = '(pyreonTap.x / pyreonDensity).toDouble()'
  const tapX = chrome.tapX(rawTapX)
  const plotX = chrome.plotX(rawTapX)
  const tapYExpr = '(pyreonTap.y / pyreonDensity).toDouble()'
  let tap = ''
  // `pinning` joins the gate: a chart with ONLY `selectedMode` has no other
  // reason to install a tap, and without it the pin never runs.
  if (onSel?.kind === 'event' || presets !== undefined || legend.toggling || legend.paging || brushing || tooltip || pinning || seriesPinning || toolbox !== null || area.on) {
    // With pinning on, the hit is computed ONCE into a local: the pin, the
    // change callback and `onSelect` all name the same pick.
    const pick = pinning ? 'pyreonPick' : hit(plotX, tapYExpr)
    const selectOnly = onSel?.kind === 'event' ? kotlinChartSelectBody(onSel.handler, pick, indent) : ''
    const onSelChange = chartEventHandler(e, 'selectchange')
    const pinBody = pinning
      ? `val pyreonPick = ${hit(plotX, tapYExpr)}; val pyreonNextSel = pinSelection(pyreonSelected, pyreonPick, ${pinMode === 'multiple'}); pyreonSelected = pyreonNextSel` +
        (onSelChange === undefined ? '' : `; ${kotlinChartSelectBody(onSelChange, 'pyreonNextSel', indent)}`)
      : ''
    // A series pin ADDS to whatever onSelect/pinning does with the datum hit — ECharts' `selectedMode:
    // 'series'` pins the whole series while a click still reports the datum under it.
    const seriesPinBody = seriesPinning
      ? `val pyreonHitSeries = plotHitSeriesIn(pyreonSpec, layoutChart(pyreonSpec, ::pyreonChartMeasure), ${plotX}, ${tapYExpr}, 14.0); if (pyreonHitSeries >= 0) { pyreonSelectedSeries = pinSelection(pyreonSelectedSeries, pyreonHitSeries, true) }`
      : ''
    const pinBodyFull = [pinBody, seriesPinBody].filter((x) => x !== '').join('; ')
    const selectBase = tooltip
      ? `val pyreonLocal = ${localHit(plotX, tapYExpr)}; pyreonTip = if (pyreonLocal < 0) listOf() else ${tipLines}; pyreonTipAt = PyreonChartPt(${rawTapX}, ${tapYExpr})${selectOnly === '' ? '' : `; ${selectOnly}`}`
      : selectOnly
    const select = pinBodyFull === '' ? selectBase : selectBase === '' ? pinBodyFull : `${pinBodyFull}; ${selectBase}`
    const decls: string[] = []
    const branches: string[] = []
    if (toolbox !== null) {
      // The toolbox sits over the top-right corner and takes a tap before anything under it.
      const acts: string[] = []
      const reset = [
        windowed ? `pyreonZoom = ${zoomCfgK.initial ?? 'ZoomWindow(start = 0.0, end = 1.0)'}` : '',
        toolbox.magic ? 'pyreonMagicKind = ""; pyreonMagicStack = ""' : '',
        toolbox.dataZoom ? 'pyreonZoomSelect = false; pyreonZoomHistory = listOf()' : '',
        toolbox.dataView ? 'pyreonDataView = false' : '',
        legend.toggling ? 'pyreonHidden = listOf()' : '',
        brushing ? 'pyreonBrushStart = -1L; pyreonBrushEnd = -1L' : '',
        area.on ? `pyreonAreaType = ${JSON.stringify(area.initial)}; pyreonAreaKeep = ${area.keep}; pyreonAreas = listOf()${areaReport('listOf()')}` : '',
      ].filter((x) => x !== '')
      acts.push(`"restore" -> { ${reset.join('; ')} }`)
      if (toolbox.magic) {
        acts.push('"magicLine" -> { pyreonMagicKind = if (pyreonMagicKind == "line") "" else "line" }')
        acts.push('"magicBar" -> { pyreonMagicKind = if (pyreonMagicKind == "bar") "" else "bar" }')
        acts.push('"magicStack" -> { pyreonMagicStack = if (pyreonMagicStack == "stack") "" else "stack" }')
        acts.push('"magicTiled" -> { pyreonMagicStack = if (pyreonMagicStack == "tiled") "" else "tiled" }')
      }
      if (toolbox.dataZoom) {
        acts.push(`"dataZoom" -> { pyreonZoomSelect = !pyreonZoomSelect${area.on ? '; pyreonAreaType = ""' : ''} }`)
        acts.push('"dataZoomBack" -> { pyreonZoom = pyreonZoomHistory.lastOrNull() ?: ZoomWindow(start = 0.0, end = 1.0); pyreonZoomHistory = pyreonZoomHistory.dropLast(1) }')
      }
      if (toolbox.dataView) acts.push('"dataView" -> { pyreonDataView = !pyreonDataView }')
      if (area.on) {
        for (const [tool, type] of [['brushRect', 'rect'], ['brushPolygon', 'polygon'], ['brushLineX', 'lineX'], ['brushLineY', 'lineY']] as const) {
          if (toolbox.brush.includes(tool)) acts.push(`"${tool}" -> { pyreonAreaType = if (pyreonAreaType == "${type}") "" else "${type}"${toolbox.dataZoom ? '; pyreonZoomSelect = false' : ''} }`)
        }
        if (toolbox.brush.includes('brushKeep')) acts.push('"brushKeep" -> { pyreonAreaKeep = !pyreonAreaKeep }')
        if (toolbox.brush.includes('brushClear')) acts.push(`"brushClear" -> { pyreonAreas = listOf()${areaReport('listOf()')} }`)
      }
      if (toolbox.save) {
        const onSave = e.attrs.find((a) => a.kind === 'event' && a.name === 'saveimage')
        const cmdsNow = 'pyreonPaintedNow'
        acts.push(onSave?.kind === 'event'
          ? `"saveAsImage" -> { ${kotlinChartSelectBody(onSave.handler, `pyreonChartDataUrl(${cmdsNow}, ${W}, ${H}, pyreonDensity)`, indent)} }`
          : `"saveAsImage" -> { pyreonShareChartImage(pyreonContext, ${cmdsNow}, ${W}, ${H}, pyreonDensity, ${JSON.stringify(String(host.staticAttr(e, 'title') ?? 'chart'))}) }`)
      }
      decls.push(`val pyreonTool: String = hitToolbox(pyreonTools, pyreonToolbox.boxes, ${tapX}, ${tapYExpr}) ?: ""`)
      branches.push(`if (pyreonTool != "") { when (pyreonTool) { ${acts.join('; ')}; else -> {} } }`)
    }
    if (legend.paging) {
      decls.push(`val pyreonPageDelta = pyreonLegend.pager?.let { pagerHit(it, ${tapX}, ${tapYExpr}) } ?: 0.0`)
      branches.push('if (pyreonPageDelta != 0.0) { pyreonLegendPage = (pyreonLegend.pager?.page ?: 0.0) + pyreonPageDelta }')
    }
    if (legend.toggling) {
      decls.push(`val pyreonLegendHit = legendHitIndex(pyreonLegend.boxes, ${tapX}, ${tapYExpr})`)
      // Same shape as the Swift half: the toggled set goes through a LOCAL so
      // the handler receives the value the state settles on.
      const onLegend = chartEventHandler(e, 'legendChange')
      const fire = onLegend === undefined ? '' : `; ${kotlinChartSelectBody(onLegend, 'pyreonNextHidden', indent)}`
      branches.push(
        `if (pyreonLegendHit >= 0) { val pyreonNextHidden = legendToggleGroup(pyreonHidden, pyreonSeriesAll.map { it.label }, pyreonLegendHit); pyreonHidden = pyreonNextHidden${fire} }`,
      )
    }
    if (presets !== undefined) {
      decls.push(`val pyreonPreset = presetHit(pyreonPresetStrip.boxes, ${tapX}, ${tapYExpr}).toInt()`)
      branches.push(`if (pyreonPreset >= 0) { pyreonZoom = ${lim(`presetWindow(pyreonPresets[pyreonPreset].count, ${data}.size.toLong())`)} }`)
    }
    if (area.on) {
      // A tap over the plot clears a single-mode brush, as a click does on the web.
      branches.push(`if (pyreonAreaType != "" && !pyreonAreaKeep && pyreonAreas.isNotEmpty()) { pyreonAreas = listOf()${areaReport('listOf()')} }`)
    }
    if (brushing) {
      branches.push(`if (pyreonBrushStart >= 0) { pyreonBrushStart = -1L; pyreonBrushEnd = -1L${onBrush === undefined ? '' : `; ${onBrush}(null)`} }`)
    }
    const body = branches.length === 0 ? select : `${decls.length === 0 ? '' : `${decls.join('; ')}; `}${branches.join(' else ')}${select === '' ? '' : ` else { ${select} }`}`
    // The tap lambda closes over composition-scoped VALS (the spec, the slice
    // range, the legend and preset layouts). A `pointerInput(Unit)` starts its
    // coroutine ONCE and keeps the first composition's captures, so after a
    // zoom / legend toggle the tap resolved against the ORIGINAL spec — the
    // eighth device round proved it: the navigator drag moved the window (the
    // onZoom text read '55-100') and the tap still reported the un-zoomed
    // index. Keying on every state the body reads restarts the coroutine with
    // fresh captures — the Compose idiom (`pointerInput(key)`); SwiftUI needs
    // nothing, its `let`s are re-bound on every body evaluation.
    const tapKeys = ['pyreonSpec', ...(windowed ? ['pyreonZoom'] : []), ...(legend.toggling ? ['pyreonHidden'] : []), ...(legend.paging ? ['pyreonLegendPage'] : []), ...(toolbox === null ? [] : ['pyreonToolbox'])]
    tap = `.pointerInput(${tapKeys.join(', ')}) { detectTapGestures { pyreonTap -> ${body} } }`
  }
  if (area.on) {
    // The area brush: a drag while a type is on builds the area in PLOT space from the DOWN point; its end commits (or keeps) it.
    const px = (raw: string): string => chrome.plotX(`(${raw}.x / pyreonDensity).toDouble()`)
    const py = (raw: string): string => (chrome.top === '0.0' ? `(${raw}.y / pyreonDensity).toDouble()` : `(${raw}.y / pyreonDensity).toDouble() - pyreonTop`)
    tap += `.pointerInput(pyreonAreaPlot, pyreonSpec) { awaitEachGesture { val pyreonDown = awaitFirstDown(requireUnconsumed = false); if (pyreonAreaType != "") { val pyreonSx = ${px('pyreonDown.position')}; val pyreonSy = ${py('pyreonDown.position')}; drag(pyreonDown.id) { pyreonChange -> val pyreonPx = ${px('pyreonChange.position')}; val pyreonPy = ${py('pyreonChange.position')}; pyreonChange.consume(); pyreonAreaLive = if (pyreonAreaType == "polygon") brushPolygonAdd(pyreonAreaLive ?: brushAreaFromDrag("polygon", pyreonAreaPlot, pyreonSx, pyreonSy, pyreonSx, pyreonSy), pyreonAreaPlot, pyreonPx, pyreonPy) else brushAreaFromDrag(pyreonAreaType, pyreonAreaPlot, pyreonSx, pyreonSy, pyreonPx, pyreonPy) }; val pyreonA = pyreonAreaLive; if (pyreonA != null && brushAreaUsable(pyreonA)) { val pyreonNextAreas: List<BrushArea> = if (pyreonAreaKeep) pyreonAreas + pyreonA else listOf(pyreonA); pyreonAreas = pyreonNextAreas${areaReport('pyreonNextAreas')} }; pyreonAreaLive = null } } }`
  }
  if (zoomed) {
    const guard = [toolbox?.dataZoom === true ? 'if (!pyreonZoomSelect) ' : '', area.on ? 'if (pyreonAreaType == "") ' : ''].join('')
    tap += `.pointerInput(Unit) { detectTransformGestures { _, pyreonPan, pyreonZoomBy, _ -> ${guard}pyreonZoom = ${lim(`panWindow(zoomWindow(pyreonZoom, 1.0 / pyreonZoomBy.toDouble(), 0.5), -(pyreonPan.x / pyreonDensity).toDouble() / ${W})`)} } }`
  }
  if (toolbox?.dataZoom === true) {
    // The box zoom: while the tool is on, a drag over the plot selects the rows to zoom to (keyed so the lambda sees the current window and plot).
    tap += `.pointerInput(pyreonZoomSelect, pyreonZoom, pyreonPlot) { awaitEachGesture { val pyreonDown = awaitFirstDown(requireUnconsumed = false); if (pyreonZoomSelect) { pyreonSelA = (pyreonDown.position.x / pyreonDensity).toDouble(); pyreonSelB = pyreonSelA; drag(pyreonDown.id) { pyreonChange -> val pyreonStep = pyreonChange.positionChange(); pyreonChange.consume(); pyreonSelB = pyreonSelB + (pyreonStep.x / pyreonDensity).toDouble() }; if (kotlin.math.abs(pyreonSelB - pyreonSelA) >= 3.0) { val pyreonRows: BrushRange = brushRange(pyreonPlot.x, pyreonPlot.w, pyreonSelA, pyreonSelB, pyreonZoom, ${data}.size.toLong()); pyreonZoomHistory = pyreonZoomHistory + pyreonZoom; pyreonZoom = ${lim(`windowOfRows(pyreonRows.start, pyreonRows.end, ${data}.size.toLong())`)} }; pyreonSelA = -1.0; pyreonSelB = -1.0 } } }`
  }
  if (brushing) {
    tap += `.pointerInput(Unit) { awaitEachGesture { val pyreonDown = awaitFirstDown(requireUnconsumed = false); pyreonBrushA = (pyreonDown.position.x / pyreonDensity).toDouble(); pyreonBrushB = pyreonBrushA; drag(pyreonDown.id) { pyreonChange -> val pyreonStep = pyreonChange.positionChange(); pyreonChange.consume(); pyreonBrushB = pyreonBrushB + (pyreonStep.x / pyreonDensity).toDouble() }; val pyreonSel: BrushRange = brushRange(pyreonPlot.x, pyreonPlot.w, pyreonBrushA, pyreonBrushB, ${win}, ${data}.size.toLong()); pyreonBrushStart = pyreonSel.start; pyreonBrushEnd = pyreonSel.end; pyreonBrushA = -1.0; pyreonBrushB = -1.0${onBrush === undefined ? '' : `; ${onBrush}(pyreonSel)`} } }`
  }
  // Both drag surfaces classify the gesture from the DOWN point, so they are
  // written as `awaitEachGesture { awaitFirstDown(); drag(id) { … } }` rather
  // than `detectDragGestures`. That detector hands `onDragStart` the position
  // at which touch slop was CROSSED, not the touch-down — and on Android slop
  // (8dp) is wider than the navigator's handle grab (6dp), so a finger dragging
  // the left handle rightward was classified as a band drag (which cannot pan a
  // full window) and the brush's anchor sat one slop past where the user
  // pressed. SwiftUI's DragGesture exposes `startLocation`, so iOS never had
  // the bug; the Android device gate is what found it (#3294).
  // `requireUnconsumed = false` is load-bearing too: the canvas beside the
  // navigator overlay (and the same node, for the brush) runs
  // `detectTapGestures`, which CONSUMES the down at once — the default
  // `awaitFirstDown()` then never fires and the drag is dead. The second
  // Android run proved that: the same assertion failed with the classification
  // fixed. A tap and a drag must both see the down; only the drag consumes the
  // moves.
  //
  // Inside the drag, `positionChange()` is read BEFORE `consume()`: Compose
  // reports the UNCONSUMED movement, so consuming first reads `Offset.Zero`
  // on every step — the window then never moves, and the fifth device run
  // showed exactly that (a post-drag tap still reported the un-zoomed index).
  const overlay = navigating
    ? `Box(modifier = Modifier.fillMaxWidth().offset(y = ((${H})${below}).dp).height((pyreonNavigator.height).dp).pointerInput(Unit) { awaitEachGesture { val pyreonDown = awaitFirstDown(requireUnconsumed = false); pyreonNavAnchor = pyreonZoom; pyreonNavDx = 0.0; pyreonNavKind = navigatorHit(pyreonNavigator.strip, pyreonZoom, (pyreonDown.position.x / pyreonDensity).toDouble()); drag(pyreonDown.id) { pyreonChange -> val pyreonStep = pyreonChange.positionChange(); pyreonChange.consume(); pyreonNavDx = pyreonNavDx + (pyreonStep.x / pyreonDensity).toDouble(); pyreonZoom = ${lim('navigatorDrag(pyreonNavKind, pyreonNavAnchor, pyreonNavDx / pyreonNavigator.strip.w)')} }; pyreonNavKind = 0L } })`
    : undefined
  // The data description always uses every source row and mark, independent
  // of paint-only zoom, thinning and legend visibility (mirror of Swift/web).
  const plotTitleRaw = host.staticAttr(e, 'title')
  const labels = chartAttrExprKotlin(e, 'seriesLabels')
  if (labels !== undefined) lets.push(`val pyreonSeriesLabels: List<String> = ${host.expr(labels, indent)}`)
  const a11ySource = fullA11y ? 'pyreonA11ySeriesSource' : legend.hiding ? 'pyreonSeriesAll' : 'pyreonSeries'
  const a11ySeries = labels === undefined
    ? `${a11ySource}.map { A11ySeries(label = it.label, values = it.values, kind = it.kind, values2 = it.values2, errLow = it.errLow, errHigh = it.errHigh, rValues = it.rValues) }`
    : `${a11ySource}.mapIndexed { pyreonI, pyreonS -> A11ySeries(label = pyreonSeriesLabels.getOrElse(pyreonI) { pyreonS.label }, values = pyreonS.values, kind = pyreonS.kind, values2 = pyreonS.values2, errLow = pyreonS.errLow, errHigh = pyreonS.errHigh, rValues = pyreonS.rValues) }`
  const describe = `describeChart(A11yInput(title = ${typeof plotTitleRaw === 'string' ? kotlinStr(plotTitleRaw) : 'null'}, categories = ${fullA11y ? 'pyreonA11yCats' : 'pyreonCats'}, series = ${a11ySeries}, format = ${yFormat ?? 'null'}))`
  let dataViewOverlay: string | undefined
  if (toolbox?.dataView === true) {
    const input = describe.slice('describeChart('.length, -1)
    dataViewOverlay =
      `if (pyreonDataView) { Box(modifier = Modifier.fillMaxSize().background(Color(0xFFFFFFFF)).testTag("pyreon-dataview")) { Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(8.dp)) { val pyreonTable = chartTable(${input}); Text(pyreonTable.headers.joinToString("  "), fontSize = 12.sp); for (pyreonRow in pyreonTable.rows) Text(pyreonRow.joinToString("  "), fontSize = 12.sp) }; ` +
      `Text("Close", modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).testTag("pyreon-dataview-close").clickable { pyreonDataView = false }) } }`
  }
  // TalkBack's per-datum nodes: one per visible category over the plot, the
  // native twin of the web host's hidden table. Evenly spaced columns only —
  // a decimated or continuous-x chart keeps the description alone.
  const pointsOverlay = decimated || xValueAcc !== undefined
    ? undefined
    : `PyreonChartPoints(${describe.slice('describeChart('.length, -1)}, layoutChart(pyreonSpec, ::pyreonChartMeasure).plot, pyreonCats.size.toLong(), ${windowed ? 'pyreonRange.from' : '0L'}, ${horizontal}, ${chrome.left}, ${chrome.top}, ${host.staticAttr(e, 'rtl') === true ? W : '-1.0'})`
  const overlays = [pointsOverlay, overlay, dataViewOverlay].filter((o): o is string => o !== undefined)
  return kotlinFrameHostWithDensity(e, lets, cmds, tap, W, H, hasWidth, indent, windowed || tap !== '' || toolbox !== null, overlays.length === 0 ? undefined : overlays.join('\n'), describe)
}
