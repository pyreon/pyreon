import { plotMarkColorSlots, chartTooltipFields, chartThemePalette, PLOT_MARK_KINDS, PLOT_UNLOWERED_PROPS, plotUnloweredWarning, PLOT_SPEC_LITERAL_PROPS, chartSpecFieldIndex, PLOT_INDICATOR_MARKS, chartStaticFlag, chartZoomConfig, chartToolboxConfig, chartAreaBrushConfig } from '../../chart-hosts'
import { swiftIdent } from '../../identifier-safety'
import { swiftStr } from '../../string-literals'
import type { ExprIR } from '../../types'
import { CHART_HANDLE_TYPE, CHARTS_PLUGIN_NAME, chartHandleSeriesKey } from './names'
import { host } from './swift-facade'
import { SWIFT_CHART_TARGET, chartAttrExpr, chartEventHandler, swiftAccessorExpr, swiftBrushHandler, swiftBubbleRange, swiftChartAnimating, swiftChartCanvas, swiftChartChrome, swiftChartDouble, swiftChartFormatter, swiftChartSelectBody, swiftChartThemeFields, swiftChartThemeFrom, swiftFrameHost, swiftLegendInteraction, swiftMarkErrorArgs, swiftMarkOptionArgs, swiftPlotRowMap, swiftZoomPresets } from './swift-support'

/**
 * The `values` expression for a derived (indicator) mark: the mapped rows
 * handed to the crossing engine function, with its window when it takes one.
 *
 * The window must be a NUMERIC LITERAL — a runtime window would be an `Int`
 * expression the engine could take, but nothing in the emit tracks its type,
 * and silently lowering a wrong one is worse than naming the limit.
 */
function swiftIndicatorValues(
  ind: { readonly fn: string; readonly takesWindow: boolean },
  m: Extract<ExprIR, { kind: 'call' }>,
  rowMap: string,
  tag: string,
  k: number,
  _indent: number,
): string | 'unsupported' {
  if (!ind.takesWindow) return `${ind.fn}(${rowMap})`
  const w = m.args[1]
  if (w === undefined || w.kind !== 'literal' || typeof w.value !== 'number') {
    host.warn(
      `<${tag}> mark ${k + 1}: \`${ind.fn.replace('Values', '')}\` needs a NUMERIC LITERAL window on native (\`sma(y, 20)\`); emitting an EmptyView().`,
    )
    return 'unsupported'
  }
  return `${ind.fn}(${rowMap}, ${Math.trunc(w.value)})`
}

/**
 * The two Series a `...bollinger(y, window, k?)` spread expands to.
 *
 * The web form returns a filled `band` (upper in `values`, lower in
 * `values2`) plus the middle line, and this emits exactly that pair — the
 * arithmetic is the crossing `bollingerEdge` / `smaValues`, so the two cannot
 * drift.
 */
function swiftBollingerSpread(
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
    host.warn(`<${tag}> mark ${k + 1}: only \`...bollinger(y, window)\` is lowered as a spread; emitting an EmptyView().`)
    return 'unsupported'
  }
  const y = call.args[0]
  const w = call.args[1]
  if (y === undefined || w === undefined || w.kind !== 'literal' || typeof w.value !== 'number') {
    host.warn(`<${tag}> mark ${k + 1}: \`bollinger\` needs an accessor and a NUMERIC LITERAL window on native; emitting an EmptyView().`)
    return 'unsupported'
  }
  const kArg = call.args[2]
  // The web default is 2 standard deviations; a non-literal k is the same
  // limit as a non-literal window and is named the same way.
  let sd = '2.0'
  if (kArg !== undefined) {
    if (kArg.kind !== 'literal' || typeof kArg.value !== 'number') {
      host.warn(`<${tag}> mark ${k + 1}: \`bollinger\`'s width must be a numeric literal on native; emitting an EmptyView().`)
      return 'unsupported'
    }
    sd = kArg.value.toFixed(1).includes('.') ? String(kArg.value) : `${kArg.value}.0`
  }
  const body = swiftAccessorExpr(y, tag, `mark ${k + 1}`, indent)
  if (body === 'unsupported') return 'unsupported'
  const opts = swiftMarkOptionArgs(call.args[3], tag, k, palette)
  if (opts === 'unsupported') return 'unsupported'
  const win = Math.trunc(w.value)
  const rowMap = swiftPlotRowMap(rows, `pyreonChartDouble(${body})`, 'Double', windowed)
  lets.push(`let ${namePrefix}Raw${k}: [Double] = ${rowMap}`)
  lets.push(`let ${namePrefix}Upper${k}: [Double] = bollingerEdge(${namePrefix}Raw${k}, ${win}, ${sd}, 1.0)`)
  lets.push(`let ${namePrefix}Lower${k}: [Double] = bollingerEdge(${namePrefix}Raw${k}, ${win}, ${sd}, -1.0)`)
  lets.push(`let ${namePrefix}Mid${k}: [Double] = smaValues(${namePrefix}Raw${k}, ${win})`)
  return [
    `Series(kind: "band", values: ${namePrefix}Upper${k}, ${[...opts, `values2: ${namePrefix}Lower${k}`].join(', ')})`,
    `Series(kind: "line", values: ${namePrefix}Mid${k}, ${opts.join(', ')})`,
  ]
}

/** `<PlotChart data marks x? xValue? showXAxis? showYAxis? showGrid? horizontal? xTime? annotations? markers? y2Domain? onSelect? …>` */
/**
 * `handle={chart}` binds the host to a `createChartHandle()`: the window, the
 * pinned datums, the hidden series and the area brush become the handle's
 * fields (`chart.zoom`, `chart.selected`, …) instead of private `@State`, so a
 * dispatched action and a gesture move the same values. The core emits with
 * those features on; this wrapper drops their private declarations and points
 * the names at the handle.
 */
export function emitSwiftPlotHost(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const handleAttr = chartAttrExpr(e, 'handle')
  if (handleAttr === undefined) return emitSwiftPlotHostCore(e, indent, undefined)
  // The host asks the component's DECLARATIONS whether the name is a chart handle — never a plugin's state.
  const handleDecl = handleAttr.kind === 'identifier' ? host.decls(CHARTS_PLUGIN_NAME, CHART_HANDLE_TYPE).find((d) => d.name === handleAttr.name) : undefined
  if (handleAttr.kind !== 'identifier' || handleDecl === undefined) {
    host.warn('<PlotChart handle>: native needs a `const chart = createChartHandle()` declared in the same component; the chart renders without the handle.')
    return emitSwiftPlotHostCore(e, indent, undefined)
  }
  const h = swiftIdent(handleAttr.name)
  const before = host.hostState.lines().length
  const out = emitSwiftPlotHostCore(e, indent, h)
  const bound: Readonly<Record<string, string>> = { pyreonZoom: 'zoom', pyreonSelected: 'selected', pyreonHidden: 'hidden', pyreonAreaType: 'brushType', pyreonAreas: 'areas', pyreonHover: 'hover' }
  const kept = host.hostState.lines().slice(before).filter((d) => !Object.keys(bound).some((n) => new RegExp(`var ${n}:`).test(d)))
  host.hostState.replaceFrom(before, kept)
  return out.replace(/\bpyreon(Zoom|Selected|Hidden|AreaType|Areas|Hover)\b/g, (m) => `${h}.${bound[m]}`)
}

function emitSwiftPlotHostCore(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number, handle: string | undefined): string {
  const tag = 'PlotChart'
  const dataV = chartAttrExpr(e, 'data')
  const marksV = chartAttrExpr(e, 'marks')
  if (dataV === undefined || marksV === undefined) {
    host.warn(`<${tag}>: needs \`data\` and \`marks\` attributes on native; emitting an EmptyView().`)
    return 'EmptyView()'
  }
  if (marksV.kind !== 'array') {
    host.warn(`<${tag} marks>: must be an inline array of mark calls (\`[bars((d) => d.v), line((d) => d.avg)]\`) on native; emitting an EmptyView().`)
    return 'EmptyView()'
  }
  const data = host.expr(dataV, indent)
  const flag = (prop: string): boolean => chartStaticFlag(e, tag, prop, (name) => host.staticAttr(e, name), (w) => host.warn(w))
  const zoomed = flag('dataZoom')
  const presetsRaw = swiftZoomPresets(e, tag)
  const presets = presetsRaw === 'unsupported' ? undefined : presetsRaw
  let navigating = flag('navigator')
  if (navigating && marksV.elements.length === 0) {
    host.warn(`<${tag} navigator>: needs at least one mark (the strip shows the first one); the chart renders without the navigator.`)
    navigating = false
  }
  // The brush: a plain drag selects — only where the web's plain drag does too.
  const horizontal = flag('horizontal')
  let brushing = flag('brush') && !horizontal
  if (brushing && zoomed) {
    host.warn(`<${tag} brush>: with \`dataZoom\` the web brushes on Shift+drag, which touch has not — on native the plain drag pans, so the brush stays web-only in that combination; the chart renders without it.`)
    brushing = false
  }
  const onBrush = brushing ? swiftBrushHandler(e, tag) : undefined
  // The window state exists whenever something writes it: a gesture, a preset, the navigator.
  const zoomCfg = chartZoomConfig((n) => chartAttrExpr(e, n), (n) => host.constExpr(n), SWIFT_CHART_TARGET, (m) => host.warn(m), tag)
  // An opening window slices the rows even with no gesture to move it.
  const toolbox = chartToolboxConfig(chartAttrExpr(e, 'toolbox'), (n) => host.constExpr(n), (m) => host.warn(m), tag)
  // ECharts' area brush (rect / polygon / lineX / lineY), shared with the web through `brush-area`. A handle arms it (takeGlobalCursor).
  const areaCfg = chartAreaBrushConfig((n) => host.staticAttr(e, n), (n) => chartAttrExpr(e, n) !== undefined, toolbox?.brush ?? [], (m) => host.warn(m), tag, (n) => chartAttrExpr(e, n), (n) => host.constExpr(n))
  const area = handle === undefined ? areaCfg : { ...areaCfg, on: true }
  const windowed = zoomed || presets !== undefined || navigating || zoomCfg.initial !== null || toolbox?.dataZoom === true || handle !== undefined
  const initialWin = zoomCfg.initial ?? 'ZoomWindow(start: 0.0, end: 1.0)'
  /** A gesture's window, held to `zoomLimits` when the chart has them. */
  const lim = (expr: string): string => (zoomCfg.limits === null ? expr : `limitZoomWindow(${zoomCfg.limits}, pyreonZoom, ${expr})`)
  const win = windowed ? 'pyreonZoom' : initialWin
  const legendBase = swiftLegendInteraction(e)
  // A handle's legend actions hide series whether or not a legend is drawn to tap.
  const legend = { ...legendBase, hiding: legendBase.toggling || handle !== undefined }
  const lets: string[] = []
  if (windowed) {
    host.hostState.declare(`@State private var pyreonZoom: ZoomWindow = ${initialWin}`)
    if (zoomed) host.hostState.declare(`@State private var pyreonZoomAnchor: ZoomWindow = ${initialWin}`)
    lets.push(`let pyreonRange: SliceRange = sliceRange(pyreonZoom, ${data}.count)`)
    lets.push(`let pyreonSourceRows = Array(${data}[pyreonRange.from..<pyreonRange.to])`)
  }
  if (navigating) {
    host.hostState.declare('@State private var pyreonNavKind: Int = 0')
    host.hostState.declare('@State private var pyreonNavAnchor: ZoomWindow = ZoomWindow(start: 0.0, end: 1.0)')
  }
  if (brushing) {
    host.hostState.declare('@State private var pyreonBrushStart: Int = -1')
    host.hostState.declare('@State private var pyreonBrushEnd: Int = -1')
    host.hostState.declare('@State private var pyreonBrushA: Double = -1.0')
    host.hostState.declare('@State private var pyreonBrushB: Double = -1.0')
  }
  if (toolbox !== null) {
    if (toolbox.magic) {
      host.hostState.declare('@State private var pyreonMagicKind: String = ""')
      host.hostState.declare('@State private var pyreonMagicStack: String = ""')
    }
    if (toolbox.dataZoom) {
      host.hostState.declare('@State private var pyreonZoomSelect: Bool = false')
      host.hostState.declare('@State private var pyreonZoomHistory: [ZoomWindow] = []')
      host.hostState.declare('@State private var pyreonSelA: Double = -1.0')
      host.hostState.declare('@State private var pyreonSelB: Double = -1.0')
    }
    if (toolbox.dataView) host.hostState.declare('@State private var pyreonDataView: Bool = false')
  }
  if (area.on) {
    host.hostState.declare(`@State private var pyreonAreaType: String = ${JSON.stringify(area.initial)}`)
    host.hostState.declare(`@State private var pyreonAreaKeep: Bool = ${area.keep}`)
    host.hostState.declare('@State private var pyreonAreas: [BrushArea] = []')
    host.hostState.declare('@State private var pyreonAreaLive: BrushArea? = nil')
  }
  if (legend.hiding) host.hostState.declare('@State private var pyreonHidden: [Int] = []')
  if (legend.paging) host.hostState.declare('@State private var pyreonLegendPage: Double = 0.0')
  const maxPoints = chartAttrExpr(e, 'maxPoints')
  const fullA11y = windowed || maxPoints !== undefined
  let decimated = false
  let rows = windowed ? 'pyreonSourceRows' : data
  // The theme's palette colours marks with no `color` (the theme builder already warned about a bad literal, so this parse stays silent).
  const pyreonPalette = chartThemePalette(chartAttrExpr(e, 'theme'), tag, () => {}, host.colorScope()?.palette as readonly string[] | undefined)
  const series: string[] = []
  const fullA11ySeries: string[] = []
  let navValues = ''
  // Colour follows the mark's LABEL, as the web's `resolveMarks` does.
  const colorSlots = plotMarkColorSlots(marksV.elements)
  for (let k = 0; k < marksV.elements.length; k++) {
    const m = marksV.elements[k]!
    // `...bollinger(y, window, k)` — the one mark constructor that returns an
    // ARRAY, so it arrives as a spread element rather than a call. It expands
    // to the two Series it names: the envelope as a band, and its middle.
    if (m.kind === 'spread') {
      if (k === 0 && maxPoints !== undefined) {
        host.warn(`<${tag} maxPoints>: the first mark is a spread indicator, whose derived values are not available until after mark expansion on native; row thinning is skipped.`)
      }
      const expanded = swiftBollingerSpread(m.argument, tag, k, rows, windowed, indent, lets, pyreonPalette)
      if (expanded === 'unsupported') return 'EmptyView()'
      for (const line of expanded) series.push(line)
      if (fullA11y) {
        const full = swiftBollingerSpread(m.argument, tag, k, data, false, indent, lets, pyreonPalette, 'pyreonA11y')
        if (full === 'unsupported') return 'EmptyView()'
        for (const line of full) fullA11ySeries.push(line)
      }
      continue
    }
    const callee = m.kind === 'call' && m.callee.kind === 'identifier' ? m.callee.name : undefined
    const bubble = callee === 'bubble'
    // `band(low, high, options)` reads its channels in the opposite order to
    // every other mark: the SERIES value is the upper bound and the second
    // channel is the lower one, so the accessor picked below is args[1].
    const isBand = callee === 'band'
    // A DERIVED mark: the accessor gives the raw series and a crossing engine
    // function turns it into the drawn one (`sma` → `smaValues`), the same
    // shape as `bubble` → `bubbleRadii`.
    const indicator = callee === undefined ? undefined : PLOT_INDICATOR_MARKS[callee]
    const kind = callee === undefined ? undefined : bubble ? 'points' : (indicator?.kind ?? PLOT_MARK_KINDS[callee])
    if (m.kind !== 'call' || kind === undefined) {
      host.warn(`<${tag}> mark ${k + 1}: this mark is not lowered on native; emitting an EmptyView().`)
      return 'EmptyView()'
    }
    const y = isBand ? m.args[1] : m.args[0]
    if (y === undefined) {
      // Named per mark: `band` takes TWO accessors, so "needs an accessor" on
      // its own leaves the reader guessing which one is missing.
      host.warn(
        isBand
          ? `<${tag}> mark ${k + 1}: \`band\` needs both an upper and a lower accessor — \`band(low, high)\`; emitting an EmptyView().`
          : `<${tag}> mark ${k + 1}: needs an accessor; emitting an EmptyView().`,
      )
      return 'EmptyView()'
    }
    const body = swiftAccessorExpr(y, tag, `mark ${k + 1}`, indent)
    if (body === 'unsupported') return 'EmptyView()'
    if (k === 0 && maxPoints !== undefined) {
      const max = `Int(${host.expr(maxPoints, indent)})`
      lets.push(`let pyreonMaxPoints: Int = ${max}`)
      lets.push(`let pyreonDecimateValues: [Double] = ${swiftPlotRowMap(rows, `pyreonChartDouble(${body})`, 'Double', windowed)}`)
      lets.push(`let pyreonKeep: [Int] = pyreonMaxPoints >= 3 && ${rows}.count > pyreonMaxPoints ? lttbIndices([], pyreonDecimateValues, pyreonMaxPoints) : Array(${rows}.indices)`)
      lets.push(`let pyreonRows = pyreonKeep.map { ${rows}[$0] }`)
      rows = 'pyreonRows'
      decimated = true
    }
    const optsArg = bubble || isBand || indicator?.takesWindow === true ? m.args[2] : m.args[1]
    const opts = swiftMarkOptionArgs(optsArg, tag, k, pyreonPalette, colorSlots[k] ?? k)
    if (opts === 'unsupported') return 'EmptyView()'
    const rowMap = swiftPlotRowMap(rows, `pyreonChartDouble(${body})`, 'Double', windowed, decimated)
    const derivedValues = indicator === undefined ? undefined : swiftIndicatorValues(indicator, m, rowMap, tag, k, indent)
    if (derivedValues === 'unsupported') return 'EmptyView()'
    lets.push(`let pyreonValues${k}: [Double] = ${derivedValues ?? rowMap}`)
    // The bounds ride the same row map the values do — `errLow`/`errHigh` are
    // the LAST Series fields on both targets, so they append.
    const errArgs = swiftMarkErrorArgs(optsArg, tag, k, rows, windowed, indent, lets, decimated)
    if (errArgs === 'unsupported') return 'EmptyView()'
    let a11yErrArgs: string[] = []
    if (fullA11y && errArgs.length > 0) {
      const fullErr = swiftMarkErrorArgs(optsArg, tag, k, data, false, indent, lets, false, 'pyreonA11y')
      if (fullErr === 'unsupported') return 'EmptyView()'
      a11yErrArgs = fullErr
    }
    if (fullA11y) {
      const fullRows = swiftPlotRowMap(data, `pyreonChartDouble(${body})`, 'Double', false)
      const fullValues = indicator === undefined ? fullRows : swiftIndicatorValues(indicator, m, fullRows, tag, k, indent)
      if (fullValues === 'unsupported') return 'EmptyView()'
      lets.push(`let pyreonA11yValues${k}: [Double] = ${fullValues}`)
    }
    // The navigator shows the first mark over EVERY row, whatever the window.
    if (k === 0 && navigating) navValues = swiftPlotRowMap(data, `pyreonChartDouble(${body})`, 'Double', false)
    if (bubble) {
      const r = m.args[1]
      if (r === undefined) {
        host.warn(`<${tag}> mark ${k + 1}: \`bubble\` needs a radius accessor; emitting an EmptyView().`)
        return 'EmptyView()'
      }
      const rBody = swiftAccessorExpr(r, tag, `mark ${k + 1} radius`, indent)
      if (rBody === 'unsupported') return 'EmptyView()'
      const range = swiftBubbleRange(optsArg)
      // The RAW r values are bound too, not just their pixel mapping: the
      // tooltip and the accessible table report the datum, not the radius.
      // `rValues` precedes `radii` in the generated struct, and Swift's
      // memberwise init takes its arguments in declaration order.
      lets.push(`let pyreonRRaw${k}: [Double] = ${swiftPlotRowMap(rows, `pyreonChartDouble(${rBody})`, 'Double', windowed, decimated)}`)
      lets.push(`let pyreonRadii${k}: [Double] = bubbleRadii(pyreonRRaw${k}, ${range[0]}, ${range[1]})`)
      const at = opts.findIndex((o) => o.startsWith('showValues:')) + 1
      const withRadii = [...opts.slice(0, at), `rValues: pyreonRRaw${k}`, `radii: pyreonRadii${k}`, ...opts.slice(at)]
      series.push(`Series(kind: "points", values: pyreonValues${k}, ${[...withRadii, ...errArgs].join(', ')})`)
      if (fullA11y) {
        lets.push(`let pyreonA11yRRaw${k}: [Double] = ${swiftPlotRowMap(data, `pyreonChartDouble(${rBody})`, 'Double', false)}`)
        const a11yAt = opts.findIndex((o) => o.startsWith('showValues:')) + 1
        const a11yOpts = [...opts.slice(0, a11yAt), `rValues: pyreonA11yRRaw${k}`, ...opts.slice(a11yAt)]
        fullA11ySeries.push(`Series(kind: "points", values: pyreonA11yValues${k}, ${[...a11yOpts, ...a11yErrArgs].join(', ')})`)
      }
    } else if (isBand) {
      const lo = m.args[0]
      if (lo === undefined) {
        host.warn(`<${tag}> mark ${k + 1}: \`band\` needs a lower-bound accessor; emitting an EmptyView().`)
        return 'EmptyView()'
      }
      const loBody = swiftAccessorExpr(lo, tag, `mark ${k + 1} lower bound`, indent)
      if (loBody === 'unsupported') return 'EmptyView()'
      lets.push(`let pyreonLow${k}: [Double] = ${swiftPlotRowMap(rows, `pyreonChartDouble(${loBody})`, 'Double', windowed, decimated)}`)
      // `values2` is the LAST Series field on both targets, so it appends
      // after the error bounds — Swift's init is positional even when
      // labelled.
      series.push(`Series(kind: "band", values: pyreonValues${k}, ${[...opts, ...errArgs, `values2: pyreonLow${k}`].join(', ')})`)
      if (fullA11y) {
        lets.push(`let pyreonA11yLow${k}: [Double] = ${swiftPlotRowMap(data, `pyreonChartDouble(${loBody})`, 'Double', false)}`)
        fullA11ySeries.push(`Series(kind: "band", values: pyreonA11yValues${k}, ${[...opts, ...a11yErrArgs, `values2: pyreonA11yLow${k}`].join(', ')})`)
      }
    } else {
      series.push(`Series(kind: ${swiftStr(kind)}, values: pyreonValues${k}, ${[...opts, ...errArgs].join(', ')})`)
      if (fullA11y) fullA11ySeries.push(`Series(kind: ${swiftStr(kind)}, values: pyreonA11yValues${k}, ${[...opts, ...a11yErrArgs].join(', ')})`)
    }
  }
  if (legend.hiding) {
    // The legend lists every series; the plot draws what the hidden set leaves.
    lets.push(`let pyreonSeriesAll: [Series] = [${series.join(', ')}]`)
    lets.push('let pyreonSeries: [Series] = hideHiddenSeries(pyreonSeriesAll, pyreonHidden)')
  } else {
    lets.push(`let pyreonSeries: [Series] = [${series.join(', ')}]`)
  }
  if (fullA11y) lets.push(`let pyreonA11ySeriesSource: [Series] = [${fullA11ySeries.join(', ')}]`)
  const xAcc = chartAttrExpr(e, 'x')
  if (xAcc !== undefined) {
    const body = swiftAccessorExpr(xAcc, tag, 'x', indent)
    if (body === 'unsupported') return 'EmptyView()'
    const cat = `pyreonChartString(${body})`
    lets.push(`let pyreonCats: [String] = ${swiftPlotRowMap(rows, cat, 'String', windowed, decimated)}`)
    if (fullA11y) lets.push(`let pyreonA11yCats: [String] = ${swiftPlotRowMap(data, cat, 'String', false)}`)
  } else {
    lets.push('let pyreonCats: [String] = []')
    if (fullA11y) lets.push('let pyreonA11yCats: [String] = []')
  }
  // `by`: one key per drawn row, mapped over the SAME rows (window and
  // decimation included) as the values, so key i names value i.
  const byAcc = chartAttrExpr(e, 'by')
  let keyed = false
  if (byAcc !== undefined) {
    const body = swiftAccessorExpr(byAcc, tag, 'by', indent)
    if (body === 'unsupported') return 'EmptyView()'
    lets.push(`let pyreonRowKeys: [String] = ${swiftPlotRowMap(rows, `pyreonChartString(${body})`, 'String', windowed, decimated)}`)
    keyed = true
  }
  const xValueAcc = chartAttrExpr(e, 'xValue')
  if (xValueAcc !== undefined) {
    const body = swiftAccessorExpr(xValueAcc, tag, 'xValue', indent)
    if (body === 'unsupported') return 'EmptyView()'
    lets.push(`let pyreonXValues: [Double] = ${swiftPlotRowMap(rows, `pyreonChartDouble(${body})`, 'Double', windowed, decimated)}`)
  }
  const present = PLOT_UNLOWERED_PROPS.filter((p) => chartAttrExpr(e, p) !== undefined || e.attrs.some((a) => a.kind === 'event' && 'on' + a.name === p.toLowerCase()))
  if (present.length > 0) host.warn(plotUnloweredWarning(tag, present))
  const H = swiftChartDouble(e, 'height', 200, indent)
  const hasWidth = chartAttrExpr(e, 'width') !== undefined
  const W = hasWidth ? swiftChartDouble(e, 'width', 300, indent) : 'Double(pyreonGeo.size.width)'
  const entries = legend.toggling
    ? // One entry per label, as the web draws it (the engine's `legendEntriesGrouped`).
      'legendEntriesGrouped(pyreonSeriesAll.map { $0.label }, pyreonSeriesAll.map { $0.color }, pyreonHidden)'
    : 'legendEntriesGrouped(pyreonSeries.map { $0.label }, pyreonSeries.map { $0.color }, [])'
  const tf = swiftChartThemeFields(e, tag)
  const chrome = swiftChartChrome(e, entries, W, H, indent, true, tf, legend.paging ? 'pyreonLegendPage' : undefined)
  lets.push(...chrome.lets)
  const theme = swiftChartThemeFrom(tf)
  const themed = presets !== undefined || navigating
  if (themed) lets.push(`let pyreonTheme: ChartTheme = ${theme}`)
  if (presets !== undefined) {
    // The strip sits at the canvas bottom in canvas coordinates (never shifted
    // by the title/legend), exactly where the web paints it.
    lets.push(`let pyreonPresets: [ZoomPreset] = [${presets.join(', ')}]`)
    lets.push(`let pyreonPresetStrip: PresetLayout = renderPresets(pyreonPresets, ${data}.count, pyreonZoom, PyreonChartRect(x: 0.0, y: 0.0, w: ${W}, h: ${H}), PresetOptions(fontSize: 11.0, padX: 8.0, padY: 3.0, gap: 6.0, inset: 8.0, activeFill: pyreonTheme.axis, idleFill: pyreonTheme.grid, activeText: "#ffffff", idleText: pyreonTheme.label), pyreonChartMeasure)`)
  }
  // Below the plot, from the bottom up: the preset strip, then the navigator.
  const belowNav = presets === undefined ? '' : ' - pyreonPresetStrip.height'
  if (navigating) {
    // Thinned to the strip's width, exactly as the web host does: a 36px-tall
    // overview needs the min/max envelope per pixel column, not 100k points.
    // Without this the native navigator resolved and drew EVERY row on every
    // frame — the same defect the web host had before `minMaxBuckets` was
    // wired there, and worse here because the target has less headroom.
    lets.push(`let pyreonNavValues: [Double] = minMaxBuckets(${navValues}, max(1, Int(${W} / 2.0)))`)
    lets.push(`let pyreonNavigator: NavigatorLayout = renderNavigator(pyreonNavValues, pyreonSeries[0].color, pyreonZoom, PyreonChartRect(x: 0.0, y: 0.0, w: ${W}, h: ${H}${belowNav}), pyreonTheme.grid)`)
  }
  const bool = (name: string, fallback: boolean): string => {
    const raw = host.staticAttr(e, name)
    const v = chartAttrExpr(e, name)
    return v === undefined ? String(fallback) : typeof raw === 'boolean' ? String(raw) : host.expr(v, indent)
  }
  const below = `${belowNav}${navigating ? ' - pyreonNavigator.height' : ''}`
  const locale = chartAttrExpr(e, 'locale')
  if (locale !== undefined) lets.push(`let pyreonLocale: String = ${host.expr(locale, indent)}`)
  const specArgs = [
    `width: ${chrome.width(W)}`,
    `height: ${chrome.height(H)}${below}`,
    'series: pyreonSeries',
    'categories: pyreonCats',
    `theme: ${themed ? 'pyreonTheme' : theme}`,
    `showXAxis: ${bool('showXAxis', true)}`,
    `showYAxis: ${bool('showYAxis', true)}`,
    `showGrid: ${bool('showGrid', true)}`,
  ]
  // Direct labels (`<Legend direct />`) — ChartSpec field 8, right after showGrid.
  if (host.staticAttr(e, 'endLabels') === true) specArgs.push('endLabels: true')
  // Tick targets: static numbers only (the count is layout, decided before a frame).
  for (const k of ['xTicks', 'yTicks'] as const) {
    const v = host.staticAttr(e, k)
    if (typeof v === 'number') specArgs.push(`${k}: ${Number.isInteger(v) ? `${v}.0` : v}`)
  }
  // `yDomain` is ChartSpec field 10, so it goes here — BEFORE `yFormat` — and
  // the position is read off the generated struct rather than restated, since
  // Swift's memberwise init takes its arguments in declaration order. Its
  // sibling `y2Domain` has lowered as a one-liner all along; this one was in
  // PLOT_UNLOWERED_PROPS, so a native chart could not pin its y range and said
  // so in a warning.
  const yDom = chartAttrExpr(e, 'yDomain')
  if (yDom !== undefined) specArgs.push(`yDomain: ${host.expr(yDom, indent)}`)
  const yFormat = swiftChartFormatter(e, 'format', indent) ?? (locale === undefined ? undefined : 'pyreonLocaleNumberFormatter(pyreonLocale)')
  if (yFormat !== undefined) specArgs.push(`yFormat: ${yFormat}`)
  const xFormat = swiftChartFormatter(e, 'xFormat', indent) ?? (locale !== undefined && host.staticAttr(e, 'xTime') === true ? 'pyreonLocaleDateFormatter(pyreonLocale)' : undefined)
  if (xFormat !== undefined) specArgs.push(`xFormat: ${xFormat}`)
  const y2 = chartAttrExpr(e, 'y2Domain')
  if (y2 !== undefined) specArgs.push(`y2Domain: ${host.expr(y2, indent)}`)
  const y2Format = swiftChartFormatter(e, 'y2Format', indent)
  if (y2Format !== undefined) specArgs.push(`y2Format: ${y2Format}`)
  if (xValueAcc !== undefined) specArgs.push('xValues: pyreonXValues')
  if (host.staticAttr(e, 'xTime') === true) specArgs.push('xTime: true')
  if (host.staticAttr(e, 'horizontal') === true) specArgs.push('horizontal: true')
  const ann = chartAttrExpr(e, 'annotations')
  // Steered to the engine structs: `{ x, label }` also matches `RiverTick` by field set, and an unsteered literal resolved to it.
  if (ann !== undefined) specArgs.push(`annotations: ${host.exprAs({ kind: 'array', element: { kind: 'typeRef', name: 'Annotation', args: [] } }, ann, indent)}`)
  const mk = chartAttrExpr(e, 'markers')
  if (mk !== undefined) specArgs.push(`markers: ${host.exprAs({ kind: 'array', element: { kind: 'typeRef', name: 'PointMarker', args: [] } }, mk, indent)}`)
  if (swiftChartAnimating(e, 'PlotChart')) specArgs.push('progress: pyreonEntrance')
  // `selectedMode` — a TAP pins a datum, which is the half of the events model
  // a touch target actually has. (`emphasis`'s hover band and `onHighlight`
  // are mouseover-driven and stay declined, for the same reason `crosshair`
  // does.) The engine already draws a pinned datum from `ChartSpec.emphasis`;
  // this is the host state that says which. It goes here because Swift's init
  // is positional and `emphasis` follows `progress` in the struct.
  const pinMode = host.staticAttr(e, 'selectedMode')
  const pinning = pinMode === 'single' || pinMode === 'multiple'
  // `selectedMode: 'series'` pins the WHOLE series a tap lands on, not a datum — its own state, host-local
  // (a handle's `.selected` stays datum indices; series pins have no handle vocabulary yet).
  const seriesPinning = pinMode === 'series'
  if (seriesPinning) host.hostState.declare('@State private var pyreonSelectedSeries: [Int] = []')
  // A handle's pins and highlight draw whether or not a tap pins (`select` / `highlight` actions).
  if (pinning || handle !== undefined) {
    host.hostState.declare('@State private var pyreonSelected: [Int] = []')
    if (handle !== undefined) host.hostState.declare('@State private var pyreonHover: Int = -1')
    const selected = decimated
      ? `pyreonSelected.compactMap { pyreonGlobal in pyreonKeep.firstIndex(of: pyreonGlobal${windowed ? ' - pyreonRange.from' : ''}) }`
      : windowed
        ? `pyreonSelected.map { $0 - pyreonRange.from }.filter { $0 >= 0 && $0 < ${rows}.count }`
        : 'pyreonSelected'
    specArgs.push(`emphasis: Emphasis(highlight: ${handle === undefined ? '-1' : 'pyreonHover'}, selected: ${selected})`)
  }
  // The batch-2 spec switches: a literal each, AFTER `progress` (Swift's init order is the struct's field order).
  const late: { at: number; arg: string; name: string }[] = []
  for (const p of PLOT_SPEC_LITERAL_PROPS) {
    const raw = host.staticAttr(e, p.name)
    const v = chartAttrExpr(e, p.name)
    if (v === undefined) continue
    if (typeof raw !== p.kind) {
      host.warn(`<${tag}>: \`${p.name}\` must be a ${p.kind} literal on native; the prop is ignored.`)
      continue
    }
    late.push({ at: chartSpecFieldIndex(p.name), name: p.name, arg: `${p.name}: ${p.kind === 'string' ? swiftStr(raw) : p.kind === 'number' ? (Number.isInteger(raw) ? `${String(raw)}.0` : String(raw)) : String(raw)}` })
  }
  late.sort((a, b) => a.at - b.at)
  for (const l of late) specArgs.push(l.arg)
  // The struct's LAST field, so it goes last.
  if (keyed) specArgs.push('rowKeys: pyreonRowKeys')
  // magicType rewrites the series kinds on every render, as the web host does.
  const magicBuilt = toolbox?.magic === true ? `applyMagicType(ChartSpec(${specArgs.join(', ')}), pyreonMagicKind, pyreonMagicStack)` : `ChartSpec(${specArgs.join(', ')})`
  // `selectedMode: 'series'` tints every datum of the series a tap pins — applied before the brush, which
  // only re-colours OUT-of-brush datums and must see the series pins already in the fills it starts from.
  const specBuilt = seriesPinning ? `applySeriesSelection(${magicBuilt}, pyreonSelectedSeries)` : magicBuilt
  if (area.on) {
    // The brush only re-colours datums: the base spec's layout is the brushed spec's layout.
    lets.push(`let pyreonSpecBase: ChartSpec = ${specBuilt}`)
    lets.push('let pyreonAreasNow: [BrushArea] = pyreonAreaLive.map { pyreonAreas + [$0] } ?? pyreonAreas')
    lets.push('let pyreonAreaPlot: PyreonChartRect = layoutChart(pyreonSpecBase, pyreonChartMeasure).plot')
    lets.push(`let pyreonSpec: ChartSpec = applyBrushSelection(pyreonSpecBase, ${area.only.length === 0 ? '' : 'brushOnlySeries('}brushSelection(pyreonSpecBase, layoutChart(pyreonSpecBase, pyreonChartMeasure), pyreonAreasNow)${area.only.length === 0 ? '' : `, [${area.only.map((x) => `${x}.0`).join(', ')}])`}, !pyreonAreasNow.isEmpty, ${Number.isInteger(area.opacity) ? `${area.opacity}.0` : String(area.opacity)})`)
  } else {
    lets.push(`let pyreonSpec: ChartSpec = ${specBuilt}`)
  }
  if (toolbox !== null) {
    const actives = [
      toolbox.magic ? 'pyreonMagicKind == "bar" ? "magicBar" : pyreonMagicKind == "line" ? "magicLine" : ""' : '""',
      toolbox.magic ? 'pyreonMagicStack == "stack" ? "magicStack" : pyreonMagicStack == "tiled" ? "magicTiled" : ""' : '""',
      toolbox.dataZoom ? 'pyreonZoomSelect ? "dataZoom" : ""' : '""',
      toolbox.dataView ? 'pyreonDataView ? "dataView" : ""' : '""',
      ...(area.on ? ['pyreonAreaType == "rect" ? "brushRect" : pyreonAreaType == "polygon" ? "brushPolygon" : pyreonAreaType == "lineX" ? "brushLineX" : pyreonAreaType == "lineY" ? "brushLineY" : ""', 'pyreonAreaKeep ? "brushKeep" : ""'] : []),
    ]
    lets.push(`let pyreonTools: [String] = [${toolbox.tools.map((t) => JSON.stringify(t)).join(', ')}]`)
    lets.push(`let pyreonToolbox: ToolboxLayout = renderToolbox(pyreonTools, PyreonChartRect(x: 0.0, y: 0.0, w: ${W}, h: ${H}), ToolboxOptions(fontSize: 11.0, color: ${themed ? 'pyreonTheme.label' : `${theme}.label`}, actives: [${actives.join(', ')}]))`)
    if (toolbox.dataZoom && !brushing) lets.push('let pyreonPlot: PyreonChartRect = layoutChart(pyreonSpec, pyreonChartMeasure).plot')
  }
  if (brushing) {
    // The band lives in PLOT space: the live span while dragging, else the
    // committed range projected through the window — and it rides inside the
    // chrome wrap so the title/legend shift moves it with the plot.
    lets.push('let pyreonPlot: PyreonChartRect = layoutChart(pyreonSpec, pyreonChartMeasure).plot')
    lets.push(
      `let pyreonBrushCmds: [PyreonDrawCmd] = pyreonBrushA >= 0.0 ? renderBrushBand(pyreonPlot, min(pyreonBrushA, pyreonBrushB), max(pyreonBrushA, pyreonBrushB), pyreonSpec.theme.axis) : pyreonBrushStart >= 0 ? { () -> [PyreonDrawCmd] in let pyreonBand = brushBand(pyreonPlot, BrushRange(start: pyreonBrushStart, end: pyreonBrushEnd), ${win}, ${data}.count); return pyreonBand.visible ? renderBrushBand(pyreonPlot, pyreonBand.lo, pyreonBand.hi, pyreonSpec.theme.axis) : [] }() : []`,
    )
  }
  const extraCmds = `${navigating ? ' + pyreonNavigator.cmds' : ''}${presets === undefined ? '' : ' + pyreonPresetStrip.cmds'}${toolbox === null ? '' : ' + pyreonToolbox.cmds'}`
  // `tooltip` — the web's pointer tooltip is a TAP here (the family hosts'
  // shape): the same tap that selects reads the crossing `tooltipAt` /
  // `tooltipLines` over the sliced series and categories with the LOCAL hit,
  // and a tap on nothing clears the box. A named `tooltipFormatter` lowers
  // (its lines are the string it returns, split on newlines); an inline one
  // cannot be a function reference and is reported.
  const tooltip = host.staticAttr(e, 'tooltip') === true
  const tipFormatter = chartAttrExpr(e, 'tooltipFormatter')
  let tipLines = `tooltipLines(tooltipAt(pyreonLocal, pyreonCats, pyreonSeries.map { TooltipSeries(label: $0.label, values: $0.values, color: $0.color, values2: $0.values2, rValues: $0.rValues) })${yFormat === undefined ? '' : `, ${yFormat}`})`
  if (tooltip && tipFormatter !== undefined) {
    if (tipFormatter.kind === 'identifier') tipLines = `${swiftIdent(tipFormatter.name)}(tooltipAt(pyreonLocal, pyreonCats, pyreonSeries.map { TooltipSeries(label: $0.label, values: $0.values, color: $0.color, values2: $0.values2, rValues: $0.rValues) })).components(separatedBy: "\\n")`
    else host.warn('<PlotChart tooltipFormatter>: must be a NAMED function on native — an inline arrow is not lowered; the default lines apply.')
  }
  if (tooltip) {
    host.hostState.declare('@State private var pyreonTip: [String] = []')
    host.hostState.declare('@State private var pyreonTipAt: PyreonChartPt = PyreonChartPt(x: 0.0, y: 0.0)')
  }
  const tipCmds = tooltip
    ? ` + renderTooltip(pyreonTip, pyreonTipAt, ${SWIFT_CHART_TARGET.rect('0.0', '0.0', W, H)}, ${SWIFT_CHART_TARGET.struct('TooltipOptions', chartTooltipFields(tf))}, pyreonChartMeasure)`
    : ''
  // `rtl` — the same seam the web host uses (`present` in canvas-host.tsx):
  // the FINISHED list is mirrored about the canvas centreline, so the chrome,
  // the plot and the extras mirror together and no layout code changes. The
  // tooltip is deliberately NOT mirrored: it is drawn at the raw tap point,
  // which is already a visual coordinate.
  const selectBand = toolbox?.dataZoom === true ? ' + (pyreonSelA >= 0.0 ? renderBrushBand(pyreonPlot, min(pyreonSelA, pyreonSelB), max(pyreonSelA, pyreonSelB), "#6366f1") : [])' : ''
  const areaCovers = area.on ? ' + renderBrushAreas(pyreonAreasNow, "rgba(120,120,140,0.18)", pyreonSpec.theme.axis)' : ''
  const painted = `${chrome.wrap(`renderChart(pyreonSpec, pyreonChartMeasure)${brushing ? ' + pyreonBrushCmds' : ''}${selectBand}${areaCovers}`)}${extraCmds}`
  const canvas = swiftChartCanvas(e, `${chrome.mirror(painted)}${tipCmds}`, indent)
  const tapY = chrome.top === '0.0' ? 'Double(pyreonTap.location.y)' : 'Double(pyreonTap.location.y) - pyreonTop'
  // The hit test speaks the UNMIRRORED geometry the engine laid out, so an
  // RTL tap is mirrored back before it is asked about. Painting mirrored and
  // hit-testing unmirrored would report the bar at the opposite end.
  const tapX = chrome.tapX('Double(pyreonTap.location.x)')
  const plotX = chrome.plotX('Double(pyreonTap.location.x)')
  const localHit = `plotHitBars(pyreonSpec, pyreonChartMeasure, ${plotX}, ${tapY})`
  // Under a window the hit is LOCAL to the slice; the callback speaks GLOBAL indices, as on the web.
  // With a tooltip the local hit is bound once (`pyreonLocal`) and both read it; without one the emit is as before.
  const globalHit = (local: string): string => {
    const mapped = decimated ? `pyreonKeep[${local}]` : local
    const global = windowed ? `${mapped} + pyreonRange.from` : mapped
    return `${local} < 0 ? -1 : ${global}`
  }
  // `onBrushSelected`: the areas' datums per series, each index GLOBAL (the window's and decimation's mapping, as a tap's).
  const onAreaSel = chartEventHandler(e, 'brushselected')
  const areaReport = (areasExpr: string): string => {
    if (onAreaSel === undefined) return ''
    const mapped = decimated ? 'pyreonKeep[$0]' : '$0'
    const global = windowed ? `${mapped} + pyreonRange.from` : mapped
    return `; ${swiftChartSelectBody(onAreaSel, `${area.only.length === 0 ? '' : 'brushOnlySeries('}brushSelection(pyreonSpec, layoutChart(pyreonSpec, pyreonChartMeasure), ${areasExpr})${area.only.length === 0 ? '' : `, [${area.only.map((x) => `${x}.0`).join(', ')}])`}.map { BrushSeriesSelection(seriesIndex: $0.seriesIndex, dataIndex: $0.dataIndex.map { ${global} }) }`, indent)}`
  }
  const hit = tooltip
    ? `(${globalHit('pyreonLocal')})`
    : windowed || decimated
      ? `{ () -> Int in let pyreonHit = ${localHit}; return ${globalHit('pyreonHit')} }()`
      : localHit
  const onSel = e.attrs.find((a) => a.kind === 'event' && (a.name === 'selectindex' || a.name === 'select'))
  let gesture = ''
  // `pinning` joins the gate: a chart with ONLY `selectedMode` has no other
  // reason to install a tap, and without it the pin never runs.
  if (onSel?.kind === 'event' || presets !== undefined || legend.toggling || legend.paging || brushing || tooltip || pinning || seriesPinning || toolbox !== null || area.on) {
    // With pinning on, the hit is computed ONCE into a local: the pin, the
    // change callback and `onSelect` all name the same pick.
    const pick = pinning ? 'pyreonPick' : hit
    const selectOnly = onSel?.kind === 'event' ? swiftChartSelectBody(onSel.handler, pick, indent) : ''
    const onSelChange = chartEventHandler(e, 'selectchange')
    const pinBody = pinning
      ? `let pyreonPick = ${hit}; let pyreonNextSel = pinSelection(pyreonSelected, pyreonPick, ${pinMode === 'multiple'}); pyreonSelected = pyreonNextSel` +
        (onSelChange === undefined ? '' : `; ${swiftChartSelectBody(onSelChange, 'pyreonNextSel', indent)}`)
      : ''
    // A series pin ADDS to whatever `onSelect`/pinning does with the datum hit — it does not replace it, as ECharts'
    // `selectedMode: 'series'` pins the whole series while a click still reports the datum under it.
    const seriesPinBody = seriesPinning
      ? `let pyreonHitSeries = plotHitSeriesIn(pyreonSpec, layoutChart(pyreonSpec, pyreonChartMeasure), ${plotX}, ${tapY}, 14.0); if pyreonHitSeries >= 0 { pyreonSelectedSeries = pinSelection(pyreonSelectedSeries, pyreonHitSeries, true) }`
      : ''
    const pinBodyFull = [pinBody, seriesPinBody].filter((x) => x !== '').join('; ')
    const selectBase = tooltip
      ? `let pyreonLocal = ${localHit}; pyreonTip = pyreonLocal < 0 ? [] : ${tipLines}; pyreonTipAt = PyreonChartPt(x: Double(pyreonTap.location.x), y: Double(pyreonTap.location.y))${selectOnly === '' ? '' : `; ${selectOnly}`}`
      : selectOnly
    const select = pinBodyFull === '' ? selectBase : selectBase === '' ? pinBodyFull : `${pinBodyFull}; ${selectBase}`
    // One tap, several surfaces, in canvas coordinates: the legend pager, a
    // legend entry, a preset button, a committed brush (a plain tap clears it),
    // then the plot. First hit wins — the web's order.
    // Every chrome hit — the legend pager, a legend entry, a preset button —
    // reads the same mirrored x as the plot's own hit test. They are all
    // painted through the one mirror, so they must all be asked in the one
    // coordinate space; leaving these raw is how a chart paints RTL and then
    // toggles the wrong series.
    const cx = tapX
    const cy = 'Double(pyreonTap.location.y)'
    const decls: string[] = []
    const branches: string[] = []
    if (toolbox !== null) {
      // The toolbox sits over the top-right corner and takes a tap before anything under it.
      const acts: string[] = []
      acts.push('if pyreonTool == "restore" { ' + [
        windowed ? `pyreonZoom = ${initialWin}` : '',
        toolbox.magic ? 'pyreonMagicKind = ""; pyreonMagicStack = ""' : '',
        toolbox.dataZoom ? 'pyreonZoomSelect = false; pyreonZoomHistory = []' : '',
        toolbox.dataView ? 'pyreonDataView = false' : '',
        legend.toggling ? 'pyreonHidden = []' : '',
        brushing ? 'pyreonBrushStart = -1; pyreonBrushEnd = -1' : '',
        area.on ? `pyreonAreaType = ${JSON.stringify(area.initial)}; pyreonAreaKeep = ${area.keep}; pyreonAreas = []${areaReport('[]')}` : '',
      ].filter((x) => x !== '').join('; ') + ' }')
      if (toolbox.magic) {
        acts.push('if pyreonTool == "magicLine" { pyreonMagicKind = pyreonMagicKind == "line" ? "" : "line" }')
        acts.push('if pyreonTool == "magicBar" { pyreonMagicKind = pyreonMagicKind == "bar" ? "" : "bar" }')
        acts.push('if pyreonTool == "magicStack" { pyreonMagicStack = pyreonMagicStack == "stack" ? "" : "stack" }')
        acts.push('if pyreonTool == "magicTiled" { pyreonMagicStack = pyreonMagicStack == "tiled" ? "" : "tiled" }')
      }
      if (toolbox.dataZoom) {
        acts.push('if pyreonTool == "dataZoom" { pyreonZoomSelect.toggle() }')
        acts.push(`if pyreonTool == "dataZoomBack" { pyreonZoom = pyreonZoomHistory.last ?? ZoomWindow(start: 0.0, end: 1.0); if !pyreonZoomHistory.isEmpty { pyreonZoomHistory.removeLast() }${zoomed ? '; pyreonZoomAnchor = pyreonZoom' : ''} }`)
      }
      if (toolbox.dataView) acts.push('if pyreonTool == "dataView" { pyreonDataView.toggle() }')
      if (area.on) {
        for (const [tool, type] of [['brushRect', 'rect'], ['brushPolygon', 'polygon'], ['brushLineX', 'lineX'], ['brushLineY', 'lineY']] as const) {
          if (toolbox.brush.includes(tool)) acts.push(`if pyreonTool == "${tool}" { pyreonAreaType = pyreonAreaType == "${type}" ? "" : "${type}"${toolbox.dataZoom ? '; pyreonZoomSelect = false' : ''} }`)
        }
        if (toolbox.brush.includes('brushKeep')) acts.push('if pyreonTool == "brushKeep" { pyreonAreaKeep.toggle() }')
        if (toolbox.brush.includes('brushClear')) acts.push(`if pyreonTool == "brushClear" { pyreonAreas = []${areaReport('[]')} }`)
        if (toolbox.dataZoom) acts.push('if pyreonTool == "dataZoom" { pyreonAreaType = "" }')
      }
      if (toolbox.save) {
        const onSave = e.attrs.find((a) => a.kind === 'event' && a.name === 'saveimage')
        const cmdsNow = `${chrome.mirror(painted)}`
        acts.push(onSave?.kind === 'event'
          ? `if pyreonTool == "saveAsImage" { ${swiftChartSelectBody(onSave.handler, `pyreonChartDataUrl(${cmdsNow}, ${W}, ${H})`, indent)} }`
          : `if pyreonTool == "saveAsImage" { pyreonShareChartImage(${cmdsNow}, ${W}, ${H}, ${JSON.stringify(host.staticAttr(e, 'title') ?? 'chart')}) }`)
      }
      decls.push(`let pyreonTool: String = hitToolbox(pyreonTools, pyreonToolbox.boxes, ${cx}, ${cy}) ?? ""`)
      branches.push(`if pyreonTool != "" { ${acts.join('; ')} }`)
    }
    if (legend.paging) {
      decls.push(`let pyreonPageDelta: Double = pyreonLegend.pager.map { pagerHit($0, ${cx}, ${cy}) } ?? 0.0`)
      branches.push(`if pyreonPageDelta != 0.0 { pyreonLegendPage = (pyreonLegend.pager?.page ?? 0.0) + pyreonPageDelta }`)
    }
    if (legend.toggling) {
      decls.push(`let pyreonLegendHit = legendHitIndex(pyreonLegend.boxes, ${cx}, ${cy})`)
      // The toggled set goes through a LOCAL before the state write, so the
      // handler is handed the value it will settle on rather than re-reading
      // `@State` inside the closure that just wrote it.
      const onLegend = chartEventHandler(e, 'legendChange')
      const fire = onLegend === undefined ? '' : `; ${swiftChartSelectBody(onLegend, 'pyreonNextHidden', indent)}`
      branches.push(
        `if pyreonLegendHit >= 0 { let pyreonNextHidden = legendToggleGroup(pyreonHidden, pyreonSeriesAll.map { $0.label }, pyreonLegendHit); pyreonHidden = pyreonNextHidden${fire} }`,
      )
    }
    if (presets !== undefined) {
      decls.push(`let pyreonPreset = presetHit(pyreonPresetStrip.boxes, ${cx}, ${cy})`)
      branches.push(`if pyreonPreset >= 0 { pyreonZoom = ${lim(`presetWindow(pyreonPresets[pyreonPreset].count, ${data}.count)`)}${zoomed ? '; pyreonZoomAnchor = pyreonZoom' : ''} }`)
    }
    if (area.on) {
      // A tap over the plot clears a single-mode brush, as a click does on the web.
      branches.push(`if pyreonAreaType != "" && !pyreonAreaKeep && !pyreonAreas.isEmpty { pyreonAreas = []${areaReport('[]')} }`)
    }
    if (brushing) {
      branches.push(`if pyreonBrushStart >= 0 { pyreonBrushStart = -1; pyreonBrushEnd = -1${onBrush === undefined ? '' : `; ${onBrush}(nil)`} }`)
    }
    let body: string
    if (branches.length === 0) {
      body = select
    } else {
      body = `${decls.length === 0 ? '' : `${decls.join('; ')}; `}${branches.join(' else ')}${select === '' ? '' : ` else { ${select} }`}`
    }
    // A SPATIAL TAP, not a zero-distance DragGesture: a `.gesture(DragGesture(minimumDistance: 0))` claims the touch
    // the moment a finger lands, so a swipe that STARTS over a chart never scrolled the page it sits in (a device run
    // could not scroll the gallery past a chart). A tap gesture yields the drag and still carries `location`, and it
    // never fires mid-drag — which is what the old translation guard was for.
    gesture = `.contentShape(Rectangle()).simultaneousGesture(SpatialTapGesture().onEnded { pyreonTap in ${body} })`
  }
  // Every plot drag — the box zoom, the area brush, the pan, the range brush — shares ONE DragGesture. SwiftUI
  // runs only one of several `.simultaneousGesture(DragGesture)` modifiers chained on a view: a device run showed
  // the box zoom never firing once the handle added the area brush's drag beside it.
  const dragChanged: string[] = []
  const dragEnded: string[] = []
  if (toolbox?.dataZoom === true) {
    // The box zoom: while the tool is on, a drag over the plot selects the rows to zoom to; back undoes it.
    dragChanged.push('if pyreonZoomSelect { pyreonSelA = Double(pyreonDragG.startLocation.x); pyreonSelB = Double(pyreonDragG.location.x) }')
    dragEnded.push(`if pyreonZoomSelect && pyreonSelA >= 0.0 { let pyreonRows: BrushRange = brushRange(pyreonPlot.x, pyreonPlot.w, Double(pyreonDragG.startLocation.x), Double(pyreonDragG.location.x), pyreonZoom, ${data}.count); pyreonZoomHistory.append(pyreonZoom); pyreonZoom = ${lim(`windowOfRows(pyreonRows.start, pyreonRows.end, ${data}.count)`)}${zoomed ? '; pyreonZoomAnchor = pyreonZoom' : ''} }; pyreonSelA = -1.0; pyreonSelB = -1.0`)
  }
  if (area.on) {
    // Simultaneous, not high priority: a `brushType` chart is always armed, and a high-priority drag would take every
    // scroll that starts over it (a device run could not scroll the gallery past one).
    // The end rebuilds a rect / line area from the gesture's own points, so the committed area never depends on the
    // last onChanged having landed in state first; only a polygon (which accumulates vertices) reads the live area.
    // The area brush: a drag while a type is on builds the area in PLOT space; its end commits (or keeps) it.
    const dx = (v: string): string => chrome.plotX(`Double(pyreonDragG.${v}.x)`)
    const dy = (v: string): string => (chrome.top === '0.0' ? `Double(pyreonDragG.${v}.y)` : `Double(pyreonDragG.${v}.y) - pyreonTop`)
    dragChanged.push(`if pyreonAreaType != "" { pyreonAreaLive = pyreonAreaType == "polygon" ? brushPolygonAdd(pyreonAreaLive ?? brushAreaFromDrag("polygon", pyreonAreaPlot, ${dx('startLocation')}, ${dy('startLocation')}, ${dx('startLocation')}, ${dy('startLocation')}), pyreonAreaPlot, ${dx('location')}, ${dy('location')}) : brushAreaFromDrag(pyreonAreaType, pyreonAreaPlot, ${dx('startLocation')}, ${dy('startLocation')}, ${dx('location')}, ${dy('location')}) }`)
    dragEnded.push(`if pyreonAreaType != "" { let pyreonEnded: BrushArea? = pyreonAreaType == "polygon" ? pyreonAreaLive : brushAreaFromDrag(pyreonAreaType, pyreonAreaPlot, ${dx('startLocation')}, ${dy('startLocation')}, ${dx('location')}, ${dy('location')}); if let pyreonA = pyreonEnded, brushAreaUsable(pyreonA) { let pyreonNextAreas: [BrushArea] = pyreonAreaKeep ? pyreonAreas + [pyreonA] : [pyreonA]; pyreonAreas = pyreonNextAreas${areaReport('pyreonNextAreas')} } }; pyreonAreaLive = nil`)
  }
  if (zoomed) {
    gesture += `.simultaneousGesture(MagnificationGesture().onChanged { pyreonScale in pyreonZoom = ${lim('zoomWindow(pyreonZoomAnchor, 1.0 / Double(pyreonScale), 0.5)')} }.onEnded { _ in pyreonZoomAnchor = pyreonZoom })`
    const panGuard = [toolbox?.dataZoom === true ? '!pyreonZoomSelect' : '', area.on ? 'pyreonAreaType == ""' : ''].filter((x) => x !== '').join(' && ')
    const pan = `pyreonZoom = ${lim(`panWindow(pyreonZoomAnchor, -Double(pyreonDragG.translation.width) / ${W})`)}`
    dragChanged.push(panGuard === '' ? pan : `if ${panGuard} { ${pan} }`)
    dragEnded.push('pyreonZoomAnchor = pyreonZoom')
  }
  if (brushing) {
    dragChanged.push('pyreonBrushA = Double(pyreonDragG.startLocation.x); pyreonBrushB = Double(pyreonDragG.location.x)')
    dragEnded.push(`let pyreonSel: BrushRange = brushRange(pyreonPlot.x, pyreonPlot.w, Double(pyreonDragG.startLocation.x), Double(pyreonDragG.location.x), ${win}, ${data}.count); pyreonBrushStart = pyreonSel.start; pyreonBrushEnd = pyreonSel.end; pyreonBrushA = -1.0; pyreonBrushB = -1.0${onBrush === undefined ? '' : `; ${onBrush}(pyreonSel)`}`)
  }
  if (dragChanged.length > 0) {
    gesture += `.simultaneousGesture(DragGesture(minimumDistance: 8).onChanged { pyreonDragG in ${dragChanged.join('; ')} }.onEnded { pyreonDragG in ${dragEnded.join('; ')} })`
  }
  // `onZoom` — the web fires it whenever the window changes, whatever moved
  // it (pinch, pan, a preset, the navigator). One observer over the window
  // state covers every source here too. The array form keeps the observed
  // value Equatable without conforming the engine's struct.
  // The handle's `legendInverseSelect` flips over the series this chart draws. The count is baked into the handle's
  // declaration at compile time rather than written from the chart: a device run showed that writing the @Observable
  // handle from the host's `.onAppear` stopped the host's drag gestures from ever firing.
  if (handle !== undefined) host.resolveDeferred(chartHandleSeriesKey(handle), String(marksV.elements.length))
  const onZoom = e.attrs.find((a) => a.kind === 'event' && a.name === 'zoom')
  if (onZoom?.kind === 'event') {
    if (windowed) gesture += `.onChange(of: [pyreonZoom.start, pyreonZoom.end]) { ${swiftChartSelectBody(onZoom.handler, 'pyreonZoom', indent)} }`
    else host.warn('<PlotChart onZoom>: needs `dataZoom`, `zoomPresets` or `navigator` — without a window there is nothing to report.')
  }
  // The web description resolves every mark over every source row. Zoom,
  // decimation and legend visibility affect paint only; they must not erase
  // data from the single VoiceOver summary.
  const plotTitle = host.stringAttr(e, 'title', indent)
  const labels = chartAttrExpr(e, 'seriesLabels')
  if (labels !== undefined) lets.push(`let pyreonSeriesLabels: [String] = ${host.expr(labels, indent)}`)
  const a11ySource = fullA11y ? 'pyreonA11ySeriesSource' : legend.hiding ? 'pyreonSeriesAll' : 'pyreonSeries'
  const a11ySeries = labels === undefined
    ? `${a11ySource}.map { A11ySeries(label: $0.label, values: $0.values, kind: $0.kind, values2: $0.values2, errLow: $0.errLow, errHigh: $0.errHigh, rValues: $0.rValues) }`
    : `${a11ySource}.enumerated().map { (pyreonI, pyreonS) in A11ySeries(label: pyreonI < pyreonSeriesLabels.count ? pyreonSeriesLabels[pyreonI] : pyreonS.label, values: pyreonS.values, kind: pyreonS.kind, values2: pyreonS.values2, errLow: pyreonS.errLow, errHigh: pyreonS.errHigh, rValues: pyreonS.rValues) }`
  const describe = `describeChart(A11yInput(title: ${plotTitle ?? 'nil'}, categories: ${fullA11y ? 'pyreonA11yCats' : 'pyreonCats'}, series: ${a11ySeries}, format: ${yFormat ?? 'nil'}))`
  let dataViewOverlay = ''
  if (toolbox?.dataView === true) {
    // The data view: the accessible table's rows, visible, over the chart, with a close button.
    const input = describe.slice('describeChart('.length, -1)
    // After the chart's accessibility label, not before it: a label applied
    // over the overlay merges the table and its close button into the chart's
    // one element, where VoiceOver and XCUITest cannot reach them.
    dataViewOverlay =
      `.overlay(alignment: .topLeading) { if pyreonDataView { ZStack(alignment: .topTrailing) { ScrollView { VStack(alignment: .leading, spacing: 2) { let pyreonTable = chartTable(${input}); Text(pyreonTable.headers.joined(separator: "  ")).font(.caption); ForEach(Array(pyreonTable.rows.enumerated()), id: \\.offset) { pyreonRow in Text(pyreonRow.element.joined(separator: "  ")).font(.caption) } }.padding(8).frame(maxWidth: .infinity, alignment: .leading) }.background(Color.white).accessibilityIdentifier("pyreon-dataview"); Button("Close") { pyreonDataView = false }.padding(4).accessibilityIdentifier("pyreon-dataview-close") } } }`
  }
  if (!navigating) return swiftFrameHost(e, lets, canvas, gesture, W, H, hasWidth, indent, describe, dataViewOverlay)
  // The navigator's drag lives on a clear overlay over the strip (above the
  // preset strip), a sibling of the canvas: a touch that starts there is the
  // navigator's alone, so the plot's gestures never see it. The grab (band or
  // handle) is decided once, from the start location; the drag is absolute
  // from the window it started on — the web's model.
  const overlay =
    `Color.clear.contentShape(Rectangle()).frame(height: pyreonNavigator.height)${presets === undefined ? '' : '.padding(.bottom, pyreonPresetStrip.height)'}` +
    `.gesture(DragGesture(minimumDistance: 0).onChanged { pyreonNav in if pyreonNavKind == 0 { pyreonNavAnchor = pyreonZoom; pyreonNavKind = navigatorHit(pyreonNavigator.strip, pyreonZoom, Double(pyreonNav.startLocation.x)) }; pyreonZoom = ${lim('navigatorDrag(pyreonNavKind, pyreonNavAnchor, Double(pyreonNav.translation.width) / pyreonNavigator.strip.w)')} }` +
    `.onEnded { _ in pyreonNavKind = 0${zoomed ? '; pyreonZoomAnchor = pyreonZoom' : ''} })`
  return swiftFrameHost(e, lets, `ZStack(alignment: .bottom) { ${canvas}${gesture}; ${overlay} }`, '', W, H, hasWidth, indent, describe, dataViewOverlay)
}
