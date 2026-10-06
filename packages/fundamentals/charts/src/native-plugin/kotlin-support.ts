import { CHART_HOST_PALETTE, CHART_THEME_DEFAULT, CHART_THEME_FIELDS, chartDefaultLabel, chartEnterMs, chartHostAnimates, chartThemeFields, PLOT_MARK_OPTION_FIELDS, chartDouble, chartStaticFlag } from './hosts'
import type { ChartHostTarget, ChartThemeText } from './hosts'
import { kotlinIdent, kotlinStr, substituteIdentifier, type ExprIR, type TypeIR } from '@pyreon/native-compiler/plugin-api'
import { host } from './kotlin-facade'

// ---------------------------------------------------------------------------
// `@pyreon/charts` family hosts → PyreonChartCanvas (the Compose Canvas
// that walks the generated engine's draw list). Mirror of the Swift emitter
// (`swift-support.ts`); see hosts.ts for the per-host table.
// ---------------------------------------------------------------------------

export const KOTLIN_CHART_TARGET: ChartHostTarget = {
  rect: (x, y, w, h) => `PyreonChartRect(${x}, ${y}, ${w}, ${h})`,
  pt: (x, y) => `PyreonChartPt(${x}, ${y})`,
  max0: (e) => `maxOf(0.0, ${e})`,
  min: (a, b) => `minOf(${a}, ${b})`,
  nil: 'null',
  nan: 'Double.NaN',
  list: (items) => `listOf(${items.join(', ')})`,
  struct: (name, fields) => `${name}(${fields.map(([k, v]) => `${k} = ${v}`).join(', ')})`,
  coalesce: (a, b) => `(${a} ?: ${b})`,
  withProgress: (options, struct, progress) => (options === 'null' ? `${struct}(progress = ${progress})` : `(${options}).copy(progress = ${progress})`),
  withThemeDefaults: (options, struct, fields) =>
    options === 'null'
      ? `${struct}(${fields.map(([f, v]) => `${f} = ${v}`).join(', ')})`
      : `(${options}).let { it.copy(${fields.map(([f, v]) => `${f} = it.${f} ?: ${v}`).join(', ')}) }`,
  pieOptions: (a) => `PieOptions(innerRadius = ${a.innerRatio}, showLabels = ${a.showLabels ?? 'true'}, labelColor = "#ffffff", fontSize = ${a.fontSize ?? '11.0'})`,
  theme: () => `ChartTheme(axis = ${kotlinStr(CHART_THEME_DEFAULT.axis)}, grid = ${kotlinStr(CHART_THEME_DEFAULT.grid)}, label = ${kotlinStr(CHART_THEME_DEFAULT.label)}, fontSize = ${CHART_THEME_DEFAULT.fontSize})`,
}

/** `{ kind: 'typeRef' }` for an engine struct — steers an inline options literal to the named data class (mirror of the Swift emitter). */
export function chartStructRefKotlin(name: string | undefined): TypeIR | undefined {
  return name === undefined ? undefined : { kind: 'typeRef', name, args: [] }
}

/** Whether `<tag>` plays its entrance here — see the Swift emitter. */
export function kotlinChartAnimating(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string): boolean {
  return chartHostAnimates(tag) && host.staticAttr(e, 'animate') !== false
}

/** The host composable inside `PyreonChartEntrance`, which hands the tween's progress down as `pyreonEntrance` (mirror of the Swift emitter). */
export function kotlinChartEntrance(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string, indent: number, inner: (indent: number) => string): string {
  if (!kotlinChartAnimating(e, tag)) return inner(indent)
  const ms = chartEnterMs(chartAttrExprKotlin(e, 'theme'), tag, KOTLIN_CHART_TARGET.list, host.colorScope())
  const pad = ' '.repeat(indent + 2)
  return `PyreonChartEntrance(${ms}) { pyreonEntrance ->\n${pad}${inner(indent + 2)}\n${' '.repeat(indent)}}`
}

/** A JSX attr's value expression, unwrapping a zero-arg accessor arrow. */
export function chartAttrExprKotlin(e: Extract<ExprIR, { kind: 'jsx-element' }>, name: string): ExprIR | undefined {
  for (const a of e.attrs) {
    if (a.kind === 'attr' && a.name === name) {
      const v = a.value
      if (v.kind === 'arrow' && v.params.length === 0) return v.body
      return v
    }
  }
  return undefined
}

/** A numeric host prop as a Double expression: static → literal, dynamic → `(expr).toDouble()`, absent → the default. */
export function kotlinChartDouble(e: Extract<ExprIR, { kind: 'jsx-element' }>, name: string, fallback: number, indent: number): string {
  const stat = host.staticAttr(e, name)
  if (typeof stat === 'number') return chartDouble(stat)
  const dyn = chartAttrExprKotlin(e, name)
  if (dyn !== undefined) return `(${host.expr(dyn, indent)}).toDouble()`
  return chartDouble(fallback)
}

/** Select the stateful draw-list host unless update animation is explicitly disabled. */
export function kotlinChartCanvas(e: Extract<ExprIR, { kind: 'jsx-element' }>, cmds: string, modifier: string, indent: number): string {
  const args = [`cmds = ${cmds}`, `modifier = ${modifier}`]
  if (chartAttrExprKotlin(e, 'updateDuration') !== undefined) args.push(`durationMs = ${kotlinChartDouble(e, 'updateDuration', 350, indent)}`)
  const flag = (prop: string): boolean => chartStaticFlag(e, e.tag, prop, (name) => host.staticAttr(e, name), (w) => host.warn(w))
  if (flag('universalTransition')) args.push('universal = true')
  if (host.staticAttr(e, 'updateAnimation') === false) args.push('animated = false')
  else flag('updateAnimation')
  // A family host's `toolbox={{ saveAsImage: true }}`: mirror of the Swift save button.
  if (e.tag === 'PlotChart' || !kotlinToolboxSaves(e)) return `PyreonChartCanvas(${args.join(', ')})`
  const inner = [`cmds = ${cmds}`, 'modifier = Modifier.fillMaxSize()', ...args.slice(2)]
  const onSave = e.attrs.find((a) => a.kind === 'event' && a.name === 'saveimage')
  const size = 'maxWidth.value.toDouble(), maxHeight.value.toDouble()'
  const action = onSave?.kind === 'event'
    ? kotlinChartSelectBody(onSave.handler, `pyreonChartDataUrl(${cmds}, ${size}, pyreonSaveDensity)`, indent)
    : `pyreonShareChartImage(pyreonSaveContext, ${cmds}, ${size}, pyreonSaveDensity, ${JSON.stringify(String(host.staticAttr(e, 'title') ?? 'chart'))})`
  // The draw list is read ONCE in composition: it can call composables (the theme's dark check), which the click lambda cannot.
  return `BoxWithConstraints(modifier = ${modifier}) { val pyreonSaveContext = LocalContext.current; val pyreonSaveDensity = LocalDensity.current.density; val pyreonSaveCmds = ${cmds}; PyreonChartCanvas(${inner.join(', ').replace(`cmds = ${cmds}`, 'cmds = pyreonSaveCmds')}); Text("⤓", modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).testTag("pyreon-save-image").clickable { ${action.split(cmds).join('pyreonSaveCmds')} }) }`
}

/** Whether a host's `toolbox` literal asks for `saveAsImage`. */
export function kotlinToolboxSaves(e: Extract<ExprIR, { kind: 'jsx-element' }>): boolean {
  const tb = chartAttrExprKotlin(e, 'toolbox')
  if (tb === undefined) return false
  const saves = tb.kind === 'object' && tb.fields.some((f) => f.name === 'saveAsImage' && f.value.kind === 'literal' && f.value.value === true)
  if (!saves) host.warn(`<${e.tag} toolbox>: a family chart's toolbox offers \`saveAsImage: true\` (a literal) on native; nothing else is drawn.`)
  return saves
}

/**
 * A JSX event attr's handler expression, or undefined.
 *
 * Compared case-INSENSITIVELY because the parser lowercases event names:
 * `onLegendChange` arrives as `legendchange`. Every event matched here before
 * was a single word (`brush`, `select`), so the casing never showed — and an
 * exact match silently returns undefined, which emits a chart that toggles
 * its legend and never calls the handler.
 */
export function chartEventHandler(e: Extract<ExprIR, { kind: 'jsx-element' }>, name: string): ExprIR | undefined {
  const want = name.toLowerCase()
  const a = e.attrs.find((x) => x.kind === 'event' && x.name.toLowerCase() === want)
  return a?.kind === 'event' ? a.handler : undefined
}

/**
 * The body of the tap lambda for `onSelectIndex`: bind the handler's param to
 * the engine's index hit, then run the handler's own body as a zero-arg lambda
 * (which captures the binding — a one-param lambda literal cannot be invoked
 * without a declared param type). A bare function reference is called with
 * the hit directly.
 */
export function kotlinChartSelectBody(handler: ExprIR, hitExpr: string, indent: number): string {
  if (handler.kind === 'arrow') {
    const p = handler.params[0]
    const zeroArg: ExprIR = { ...handler, params: [] }
    const lambda = host.action(zeroArg, indent)
    return p === undefined ? `(${lambda})()` : `val ${kotlinIdent(p)} = ${hitExpr}; (${lambda})()`
  }
  if (handler.kind === 'identifier') return `${kotlinIdent(handler.name)}(${hitExpr})`
  return `(${host.expr(handler, indent)})(${hitExpr})`
}

/** The table-driven hosts (`CHART_HOSTS`) — mirror of the Swift generic host. */
/** Mirror of the Swift emitter's `swiftChartA11y`: explicit `accessibilityLabel` › the data description › `title` › the family word. */
export function kotlinChartA11y(e: Extract<ExprIR, { kind: 'jsx-element' }>, describe: string | undefined): string {
  const explicit = host.stringAttr(e, 'accessibilityLabel', 0)
  const titleRaw = host.staticAttr(e, 'title')
  const label = explicit ?? describe ?? (typeof titleRaw === 'string' ? kotlinStr(titleRaw) : kotlinStr(chartDefaultLabel(e.tag)))
  return `.semantics { contentDescription = ${label} }`
}

export function kotlinAccessorExpr(v: ExprIR, tag: string, what: string, indent: number): string | 'unsupported' {
  if (v.kind !== 'arrow' || (v.stmts !== undefined && v.stmts.length > 0) || v.params.length > 2) {
    host.warn(`<${tag}> ${what}: only a single-expression arrow \`(d, i) => …\` lowers on native; emitting an empty Box().`)
    return 'unsupported'
  }
  let body: ExprIR | null = v.body
  const names = ['pyreonD', 'pyreonI']
  for (let i = 0; i < v.params.length && body !== null; i++) {
    body = substituteIdentifier(body, v.params[i]!, { kind: 'identifier', name: names[i]! })
  }
  if (body === null) {
    host.warn(`<${tag}> ${what}: the accessor shadows its own parameter; emitting an empty Box().`)
    return 'unsupported'
  }
  return host.expr(body, indent)
}

export function kotlinMarkOptionArgs(opts: ExprIR | undefined, tag: string, seriesIndex: number, palette: readonly string[] = CHART_HOST_PALETTE, colorSlot: number = seriesIndex): string[] | 'unsupported' {
  const fields = new Map<string, ExprIR>()
  if (opts !== undefined) {
    if (opts.kind !== 'object' || (opts.spreads !== undefined && opts.spreads.length > 0)) {
      host.warn(`<${tag}> mark ${seriesIndex + 1}: options must be an object literal on native; emitting an empty Box().`)
      return 'unsupported'
    }
    for (const f of opts.fields) fields.set(f.name, f.value)
  }
  if (fields.has('curve')) host.warn(`<${tag}> mark ${seriesIndex + 1}: a \`curve\` callback is not lowered on native; the series draws straight.`)
  const args: string[] = []
  const pattern = fields.get('pattern')
  const pushPattern = (): boolean => {
    if (pattern === undefined) return true
    if (pattern.kind !== 'object' || (pattern.spreads !== undefined && pattern.spreads.length > 0)) return false
    const values = new Map(pattern.fields.map((field) => [field.name, field.value]))
    const kind = values.get('kind')
    const color = values.get('color')
    const spacing = values.get('spacing')
    const width = values.get('width')
    if (kind?.kind !== 'literal' || typeof kind.value !== 'string' || color?.kind !== 'literal' || typeof color.value !== 'string' || spacing?.kind !== 'literal' || typeof spacing.value !== 'number' || width?.kind !== 'literal' || typeof width.value !== 'number') return false
    args.push(`pattern = PyreonChartPattern(kind = ${JSON.stringify(kind.value)}, color = ${JSON.stringify(color.value)}, spacing = ${chartDouble(spacing.value)}, width = ${chartDouble(width.value)}${patternExtras(values, ' = ')})`)
    return true
  }
  // `gradient` sits right before `pattern` in Series field order: literal
  // stops (offset + colour) and an optional direction, the same shape the
  // web grammar and the option facade produce.
  const gradient = fields.get('gradient')
  const pushGradient = (): boolean => {
    if (gradient === undefined) return true
    if (gradient.kind !== 'object' || (gradient.spreads !== undefined && gradient.spreads.length > 0)) return false
    const values = new Map(gradient.fields.map((field) => [field.name, field.value]))
    const stops = values.get('stops')
    const direction = values.get('direction')
    const shape = values.get('shape')
    if (stops?.kind !== 'array') return false
    const stopArgs: string[] = []
    for (const st of stops.elements) {
      if (st.kind !== 'object') return false
      const sv = new Map(st.fields.map((field) => [field.name, field.value]))
      const offset = sv.get('offset')
      const color = sv.get('color')
      if (offset?.kind !== 'literal' || typeof offset.value !== 'number' || color?.kind !== 'literal' || typeof color.value !== 'string') return false
      stopArgs.push(`PyreonChartGradientStop(offset = ${chartDouble(offset.value)}, color = ${JSON.stringify(color.value)})`)
    }
    if (direction !== undefined && (direction.kind !== 'literal' || typeof direction.value !== 'string')) return false
    if (shape !== undefined && (shape.kind !== 'literal' || typeof shape.value !== 'string')) return false
    args.push(`gradient = SeriesGradient(stops = listOf(${stopArgs.join(', ')})${direction === undefined ? '' : `, direction = ${JSON.stringify(direction.value)}`}${shape === undefined ? '' : `, shape = ${JSON.stringify(shape.value)}`})`)
    return true
  }
  let patternPushed = false
  for (const spec of PLOT_MARK_OPTION_FIELDS) {
    if (spec.name === 'negativeColor' && !patternPushed) {
      if (!pushGradient()) {
        host.warn(`<${tag}> mark ${seriesIndex + 1}: \`gradient\` needs literal stops (offset + color) and an optional direction on native; emitting an empty Box().`)
        return 'unsupported'
      }
      if (!pushPattern()) {
        host.warn(`<${tag}> mark ${seriesIndex + 1}: \`pattern\` needs literal kind/color/spacing/width fields on native; emitting an empty Box().`)
        return 'unsupported'
      }
      patternPushed = true
    }
    const v = fields.get(spec.name)
    if (v !== undefined) {
      if (v.kind !== 'literal' || typeof v.value !== spec.kind) {
        host.warn(`<${tag}> mark ${seriesIndex + 1}: \`${spec.name}\` must be a ${spec.kind} literal on native; emitting an empty Box().`)
        return 'unsupported'
      }
      const lit = spec.kind === 'number' ? chartDouble(v.value as number) : kotlinStr(v.value)
      args.push(`${spec.name} = ${lit}`)
      continue
    }
    if (spec.name === 'color') args.push(`color = ${kotlinStr(palette[colorSlot % palette.length])}`)
    else if (spec.name === 'label') args.push(`label = ${kotlinStr(`Series ${seriesIndex + 1}`)}`)
    else if (spec.default !== undefined) args.push(`${spec.name} = ${spec.kind === 'number' ? chartDouble(spec.default as number) : String(spec.default)}`)
  }
  if (!patternPushed && !pushGradient()) {
    host.warn(`<${tag}> mark ${seriesIndex + 1}: \`gradient\` needs literal stops (offset + color) and an optional direction on native; emitting an empty Box().`)
    return 'unsupported'
  }
  if (!patternPushed && !pushPattern()) {
    host.warn(`<${tag}> mark ${seriesIndex + 1}: \`pattern\` needs literal kind/color/spacing/width fields on native; emitting an empty Box().`)
    return 'unsupported'
  }
  return args
}

/** `kotlinFrameHost` with hoisted `val`s in the BoxWithConstraints scope (always emitted, so the vals have a scope). */
/**
 * RTL for a chart host: the mirror for its draw list and the tap-x
 * translation that must accompany it. Handed out as a PAIR — see the Swift
 * twin; a host that takes one without the other reports the wrong item for
 * right-to-left users only.
 */
export function kotlinRtl(e: Extract<ExprIR, { kind: 'jsx-element' }>, W: string): { mirror: (cmds: string) => string; tapX: (raw: string) => string } {
  const rtl = host.staticAttr(e, 'rtl') === true
  return {
    mirror: (cmds) => (rtl ? `pyreonMirrorCmds(${cmds}, ${W})` : cmds),
    tapX: (raw) => (rtl ? `(${W} - ${raw})` : raw),
  }
}

/** The visualMap drag + piece tap as Compose pointer inputs; `at` maps an offset to plot space. */
export function kotlinVisualMapGesture(at: (o: string) => [string, string]): string {
  const [sx, sy] = at('pyreonO')
  const [mx, my] = at('pyreonC.position')
  const [tx, ty] = at('pyreonT')
  return `.pointerInput(pyreonVmPlace) { detectDragGestures(onDragStart = { pyreonO -> pyreonVmHandle = visualStripHandleAt(pyreonStrip, pyreonVmPlace.at, pyreonVmRange, ${sx}, ${sy}) }, onDragEnd = { pyreonVmHandle = -2.0 }, onDragCancel = { pyreonVmHandle = -2.0 }) { pyreonC, _ -> if (pyreonVmHandle >= 0.0) pyreonVmRange = visualStripDrag(pyreonStrip, pyreonVmRange, pyreonVmHandle, visualStripValueAt(pyreonStrip, pyreonVmPlace.at, ${mx}, ${my})) } }` +
    `.pointerInput(pyreonVmPlace) { detectTapGestures { pyreonT -> val pyreonP = visualStripPieceAt(pyreonStrip, pyreonVmPlace.at, ${tx}, ${ty}); if (pyreonP >= 0.0) pyreonVmSelected = visualStripToggle(pyreonStrip, pyreonVmSelected, pyreonP) } }`
}

/** The visualMap's remembered state (Compose). */
export function kotlinVisualMapState(vm: { lo: string; hi: string; selected: string }): string[] {
  return [
    `var pyreonVmRange by remember { mutableStateOf(Domain(${vm.lo}, ${vm.hi})) }`,
    `var pyreonVmSelected by remember { mutableStateOf<List<Boolean>>(${vm.selected}) }`,
    'var pyreonVmHandle by remember { mutableStateOf(-2.0) }',
  ]
}

export function kotlinFrameHostLets(e: Extract<ExprIR, { kind: 'jsx-element' }>, lets: readonly string[], cmds: string, hit: ((x: string, y: string) => string) | null, W: string, H: string, hasWidth: boolean, indent: number, names: readonly string[] = ['selectindex', 'select'], describe?: string, extraModifier = ''): string {
  const { mirror, tapX } = kotlinRtl(e, W)
  const onSel = hit === null ? undefined : e.attrs.find((a) => a.kind === 'event' && names.includes(a.name))
  // Keyed on every hoisted `val` (the grid, the candles, the series, the
  // theme): a `pointerInput(Unit)` keeps the FIRST composition's captures, so a
  // tap after a data change resolved against the old geometry — the plot
  // host's #3294 lesson, which this shared frame host had not learned.
  const keys = lets.map((l) => /^val (\w+)/.exec(l)?.[1]).filter((k): k is string => k !== undefined)
  const tap =
    (onSel?.kind === 'event' && hit !== null
      ? `.pointerInput(${keys.length === 0 ? 'Unit' : keys.join(', ')}) { detectTapGestures { pyreonTap -> ${kotlinChartSelectBody(onSel.handler, hit(tapX('(pyreonTap.x / pyreonDensity).toDouble()'), '(pyreonTap.y / pyreonDensity).toDouble()'), indent)} } }`
      : '') + extraModifier
  const size = hasWidth ? `Modifier.width((${W}).dp).height((${H}).dp)` : `Modifier.fillMaxWidth().height((${H}).dp)`
  const generic = host.layoutModifiers(e)
  const titleMod = kotlinChartA11y(e, describe)
  const canvas = kotlinChartCanvas(e, mirror(cmds), size + tap + titleMod + (generic === '' ? '' : generic.replace(/^Modifier/, '')), indent)
  const pad = ' '.repeat(indent + 2)
  const widthLine = hasWidth ? '' : `${pad}val pyreonW = maxWidth.value.toDouble()\n`
  const densityLine = tap === '' ? '' : `${pad}val pyreonDensity = LocalDensity.current.density\n`
  const body = lets.map((l) => `${pad}${l}\n`).join('')
  return `BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {\n${widthLine}${densityLine}${body}${pad}${canvas}\n${' '.repeat(indent)}}`
}


// ---- legend + title chrome (Plot / Pie / Radar) ------------------------------

export interface KotlinChartChrome {
  lets: string[]
  top: string
  /** `'0.0'` unless the legend sits on the LEFT, which indents the plot. */
  left: string
  wrap: (plot: string) => string
  height: (H: string) => string
  /** The plot's width once a side legend is subtracted. */
  width: (W: string) => string
  /**
   * RTL: mirror a finished draw list about the canvas centreline, or hand it
   * back untouched. Paired with `tapX` on purpose — a host that mirrors its
   * paint and not its taps reports the wrong item, silently, in one locale.
   */
  mirror: (cmds: string) => string
  /** A tap's x in CANVAS space: RTL-unmirrored, but NOT plot-offset — what the chrome hits (legend entries, pager, presets) are laid out in. */
  tapX: (raw: string) => string
  /** A tap's x in PLOT space: `tapX` minus a left legend's column. The plot's own hit test and its tooltip read this. */
  plotX: (raw: string) => string
}

export function kotlinChartChrome(e: Extract<ExprIR, { kind: 'jsx-element' }>, entries: string, W: string, H: string, indent: number, withTitle: boolean, t: ChartThemeText, page?: string): KotlinChartChrome {
  const titleRaw = host.staticAttr(e, 'title')
  const showTitle = withTitle && host.staticAttr(e, 'showTitle') === true && typeof titleRaw === 'string'
  const showLegend = host.staticAttr(e, 'showLegend') === true
  const { mirror, tapX } = kotlinRtl(e, W)
  if (!showTitle && !showLegend) return { lets: [], top: '0.0', left: '0.0', wrap: (p) => p, height: (h) => h, width: (w) => w, mirror, tapX, plotX: tapX }
  const lets: string[] = []
  if (showTitle) {
    const subRaw = host.staticAttr(e, 'subtitle')
    const subtitle = typeof subRaw === 'string' ? kotlinStr(subRaw) : 'null'
    lets.push(`val pyreonTitle: TitleLayout = renderTitle(${kotlinStr(titleRaw)}, ${subtitle}, PyreonChartRect(0.0, 0.0, ${W}, ${H}), TitleOptions(fontSize = ${t.titleSize}, color = ${t.text}, align = "start"))`)
  } else {
    lets.push('val pyreonTitle: TitleLayout = TitleLayout(cmds = listOf(), height = 0.0)')
  }
  if (showLegend) {
    const maxRowsRaw = host.staticAttr(e, 'legendMaxRows')
    const maxRows = typeof maxRowsRaw === 'number' ? `, maxRows = ${chartDouble(maxRowsRaw)}` : ''
    const pageArg = page === undefined ? '' : `, page = ${page}`
    // PLACEMENT is the engine's (`placeLegend`), the same call the web host
    // makes — not four branches re-derived here. The emit used to draw the
    // legend at x = 0 with the full width while the web host inset it by 8 on
    // each side, so a legend sat 8px further left on a phone than in a
    // browser and the plot 8px higher; that divergence goes with the split.
    lets.push(
      `val pyreonLegend: LegendPlacement = placeLegend(${entries}, PyreonChartRect(0.0, pyreonTitle.height, ${W}, ${H} - pyreonTitle.height), ${kotlinLegendPosition(e)}, `
        + `LegendOptions(fontSize = ${t.fontSize}, labelColor = ${t.label}, swatch = 10.0, gap = 12.0, orientation = "horizontal"${maxRows}${pageArg}), ::pyreonChartMeasure)`,
    )
  } else {
    lets.push('val pyreonLegend: LegendPlacement = LegendPlacement(cmds = listOf(), top = 0.0, bottom = 0.0, left = 0.0, right = 0.0, boxes = listOf())')
  }
  lets.push('val pyreonTop: Double = pyreonTitle.height + pyreonLegend.top')
  // Only the insets a legend at THIS position can actually take are emitted,
  // so a top legend (the default, and every chart before this) keeps the exact
  // shift and height it had.
  const pos = kotlinLegendPosition(e)
  const side = showLegend && (pos === 'LegendPosition.left' || pos === 'LegendPosition.right')
  const below = showLegend && pos === 'LegendPosition.bottom'
  return {
    lets,
    top: 'pyreonTop',
    left: side ? 'pyreonLegend.left' : '0.0',
    wrap: (p) =>
      side
        ? `pyreonTitle.cmds + pyreonLegend.cmds + pyreonShiftCmdsXY(${p}, pyreonLegend.left, pyreonTop)`
        : `pyreonTitle.cmds + pyreonLegend.cmds + pyreonShiftCmds(${p}, pyreonTop)`,
    height: (h) => (below ? `${h} - pyreonTop - pyreonLegend.bottom` : `${h} - pyreonTop`),
    width: (w) => (side ? `${w} - pyreonLegend.left - pyreonLegend.right` : w),
    mirror,
    // `tapX` is CANVAS space (RTL-unmirrored) and `plotX` is PLOT space. The
    // two used to be one function, because nothing had ever moved the plot
    // HORIZONTALLY — a title and a top legend push it down, and `tapY` was
    // where the offset lived. A left legend indents it, and folding that into
    // `tapX` silently broke the CHROME hits, which are laid out in canvas
    // coordinates: the legend's own entry boxes, its pager and the preset
    // strip would have been asked about a point 8+col pixels to their left.
    // Splitting them mirrors what `tapY` already does — chrome reads raw, the
    // plot reads offset.
    tapX,
    plotX: side ? (raw) => `${tapX(raw)} - pyreonLegend.left` : tapX,
  }
}

/** `legendPosition` as the engine's enum case; the default (and any non-literal) is `top`, as on the web. */
export function kotlinLegendPosition(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const raw = host.staticAttr(e, 'legendPosition')
  return typeof raw === 'string' && (raw === 'bottom' || raw === 'left' || raw === 'right') ? `LegendPosition.${raw}` : 'LegendPosition.top'
}

/** A frame host whose tap modifier is already built (the pie's hit needs the chrome offset, which `kotlinFrameHostLets` cannot express). */
export function kotlinFrameHostWithTap(e: Extract<ExprIR, { kind: 'jsx-element' }>, lets: readonly string[], cmds: string, tap: string, W: string, H: string, hasWidth: boolean, indent: number, describe?: string): string {
  const size = hasWidth ? `Modifier.width((${W}).dp).height((${H}).dp)` : `Modifier.fillMaxWidth().height((${H}).dp)`
  const generic = host.layoutModifiers(e)
  const titleMod = kotlinChartA11y(e, describe)
  const canvas = kotlinChartCanvas(e, cmds, size + tap + titleMod + (generic === '' ? '' : generic.replace(/^Modifier/, '')), indent)
  const pad = ' '.repeat(indent + 2)
  const widthLine = hasWidth ? '' : `${pad}val pyreonW = maxWidth.value.toDouble()\n`
  const densityLine = tap === '' ? '' : `${pad}val pyreonDensity = LocalDensity.current.density\n`
  const body = lets.map((l) => `${pad}${l}\n`).join('')
  return `BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {\n${widthLine}${densityLine}${body}${pad}${canvas}\n${' '.repeat(indent)}}`
}


// ---- theme overrides, formatters and bubble marks -----------------------------

export function kotlinChartTheme(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string): string {
  return kotlinChartThemeFrom(kotlinChartThemeFields(e, tag))
}

/** Mirror of the Swift emitter: the theme per field as emitted text, read once per host. */
export function kotlinChartThemeFields(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string): ChartThemeText {
  return chartThemeFields(chartAttrExprKotlin(e, 'theme'), tag, (w) => host.warn(w), (items) => `listOf(${items.join(', ')})`, host.colorScope(), kotlinChartScheme)
}

/** The runtime colour-scheme switch: Compose's `isSystemInDarkTheme()` (a composable read; every host's theme literal sits in composable scope). */
export function kotlinChartScheme(light: string, dark: string): string {
  return `(if (isSystemInDarkTheme()) ${dark} else ${light})`
}

export function kotlinChartThemed(e: Extract<ExprIR, { kind: 'jsx-element' }>): boolean {
  // Always: with neither a theme nor a provider the host still follows the runtime colour scheme (mirror of the Swift emitter).
  void e
  return true
}

export function kotlinChartThemeFrom(f: ChartThemeText): string {
  return `ChartTheme(${CHART_THEME_FIELDS.map((x) => `${x.name} = ${f[x.name]}`).join(', ')})`
}

/** Mirror of the Swift emitter's `swiftMarkErrorArgs`: the error-bar bounds as `errLow =` / `errHigh =` Series args over the same rows. */
export function kotlinMarkErrorArgs(
  opts: ExprIR | undefined,
  tag: string,
  seriesIndex: number,
  rows: string,
  windowed: boolean,
  indent: number,
  lets: string[],
  decimated = false,
  namePrefix = 'pyreon',
): string[] | 'unsupported' {
  if (opts === undefined || opts.kind !== 'object') return []
  const low = opts.fields.find((f) => f.name === 'errorLow')?.value
  const high = opts.fields.find((f) => f.name === 'errorHigh')?.value
  if (low === undefined && high === undefined) return []
  if (low === undefined || high === undefined) {
    host.warn(`<${tag}> mark ${seriesIndex + 1}: an error bar needs BOTH \`errorLow\` and \`errorHigh\`; the bound given alone is ignored (as on the web).`)
    return []
  }
  const lowBody = kotlinAccessorExpr(low, tag, `mark ${seriesIndex + 1} errorLow`, indent)
  const highBody = kotlinAccessorExpr(high, tag, `mark ${seriesIndex + 1} errorHigh`, indent)
  if (lowBody === 'unsupported' || highBody === 'unsupported') return 'unsupported'
  lets.push(`val ${namePrefix}ErrLow${seriesIndex}: List<Double> = ${kotlinPlotRowMap(rows, `(${lowBody}).toDouble()`, windowed, decimated)}`)
  lets.push(`val ${namePrefix}ErrHigh${seriesIndex}: List<Double> = ${kotlinPlotRowMap(rows, `(${highBody}).toDouble()`, windowed, decimated)}`)
  return [`errLow = ${namePrefix}ErrLow${seriesIndex}`, `errHigh = ${namePrefix}ErrHigh${seriesIndex}`]
}

/** A `Formatter` prop as a Kotlin `(Double) -> String`: a bare engine formatter becomes a function reference; a factory call or an arrow lowers as is. */
export function kotlinChartFormatter(e: Extract<ExprIR, { kind: 'jsx-element' }>, prop: string, indent: number): string | undefined {
  const v = chartAttrExprKotlin(e, prop)
  if (v === undefined) return undefined
  if (v.kind === 'identifier') return `::${v.name}`
  return host.expr(v, indent)
}

export function kotlinBubbleRange(opts: ExprIR | undefined): [string, string] {
  let min = '3.0'
  let max = '18.0'
  if (opts !== undefined && opts.kind === 'object') {
    for (const f of opts.fields) {
      if (f.value.kind !== 'literal' || typeof f.value.value !== 'number') continue
      if (f.name === 'minRadius') min = chartDouble(f.value.value)
      if (f.name === 'maxRadius') max = chartDouble(f.value.value)
    }
  }
  return [min, max]
}


// ---- `<PlotChart dataZoom>` — pinch + pan over a fraction window ---------------
//
// Compose lets state live where it is remembered, so the zoom window is a
// `remember { mutableStateOf }` inside the host's own BoxWithConstraints —
// no component-level splice. `detectTransformGestures` reports INCREMENTAL
// pan and zoom per event, which maps straight onto the engine's window math.

export function kotlinPlotRowMap(rows: string, body: string, zoomed: boolean, decimated = false): string {
  if (!zoomed && !decimated) return `${rows}.mapIndexed { pyreonI, pyreonD -> ${body} }`
  if (!/\bpyreonI\b/.test(body)) return `${rows}.mapIndexed { _, pyreonD -> ${body} }`
  const local = decimated ? 'pyreonKeep[pyreonJ]' : 'pyreonJ'
  const global = zoomed ? `${local} + pyreonRange.from` : local
  return `${rows}.mapIndexed { pyreonJ, pyreonD -> val pyreonI = ${global}; ${body} }`
}

/** `kotlinFrameHostWithTap` that can also force the density line (the transform gesture reads it even without a tap). */
export function kotlinFrameHostWithDensity(e: Extract<ExprIR, { kind: 'jsx-element' }>, lets: readonly string[], cmds: string, tap: string, W: string, H: string, hasWidth: boolean, indent: number, needsDensity: boolean, overlay?: string, describe?: string): string {
  const size = hasWidth ? `Modifier.width((${W}).dp).height((${H}).dp)` : `Modifier.fillMaxWidth().height((${H}).dp)`
  const generic = host.layoutModifiers(e)
  const titleMod = kotlinChartA11y(e, describe)
  const pad = ' '.repeat(indent + 2)
  const identity = titleMod + (generic === '' ? '' : generic.replace(/^Modifier/, ''))
  // With an overlay the host is a Box carrying the size + identity modifiers; the
  // canvas fills it and the overlay sits on top. Without one, the canvas IS the
  // host (modifier order unchanged: size, gestures, identity).
  const canvas =
    overlay === undefined
      ? kotlinChartCanvas(e, cmds, size + tap + identity, indent)
      : `Box(modifier = ${size + identity}) {\n${pad}  ${kotlinChartCanvas(e, cmds, `Modifier.fillMaxSize()${tap}`, indent + 2)}\n${pad}  ${overlay}\n${pad}}`
  const widthLine = hasWidth ? '' : `${pad}val pyreonW = maxWidth.value.toDouble()\n`
  const densityLine = needsDensity ? `${pad}val pyreonDensity = LocalDensity.current.density\n` : ''
  const body = lets.map((l) => `${pad}${l}\n`).join('')
  return `BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {\n${widthLine}${densityLine}${body}${pad}${canvas}\n${' '.repeat(indent)}}`
}


// ---- `<PlotChart zoomPresets>` — the preset strip, engine-laid-out ------------
//
// Compose twin of the Swift lowering: the engine lays the strip out, a tap
// that lands on a button writes the remembered window, and presets bring the
// window state with them even without `dataZoom`.

/** `zoomPresets={[{ label, count }, …]}` as `ZoomPreset(label = …, count = …)` literals; `undefined` when absent or empty; `'unsupported'` (warned) otherwise. */
export function kotlinZoomPresets(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string): string[] | 'unsupported' | undefined {
  const v = chartAttrExprKotlin(e, 'zoomPresets')
  if (v === undefined) return undefined
  if (v.kind !== 'array') return unsupportedZoomPresetsKotlin(tag)
  const out: string[] = []
  for (const el of v.elements) {
    if (el.kind !== 'object') return unsupportedZoomPresetsKotlin(tag)
    const label = el.fields.find((f) => f.name === 'label')?.value
    const count = el.fields.find((f) => f.name === 'count')?.value
    if (label?.kind !== 'literal' || typeof label.value !== 'string' || count?.kind !== 'literal' || typeof count.value !== 'number') return unsupportedZoomPresetsKotlin(tag)
    out.push(`ZoomPreset(label = ${kotlinStr(label.value)}, count = ${Math.trunc(count.value)})`)
  }
  return out.length === 0 ? undefined : out
}

export function unsupportedZoomPresetsKotlin(tag: string): 'unsupported' {
  host.warn(`<${tag} zoomPresets>: must be an inline array of \`{ label, count }\` literals on native; the chart renders without the preset strip.`)
  return 'unsupported'
}


// ---- `<PlotChart showLegend legendToggle legendMaxRows>` — legend tap + paging ----
//
// Compose twin of the Swift lowering: the hidden set and the page are
// remembered in the host, a tap on an entry toggles it, the plot draws what
// `hideHiddenSeries` leaves, and the entries render muted.

export interface KotlinLegendInteraction {
  toggling: boolean
  paging: boolean
}

export function kotlinLegendInteraction(e: Extract<ExprIR, { kind: 'jsx-element' }>): KotlinLegendInteraction {
  const legendOn = host.staticAttr(e, 'showLegend') === true
  return {
    toggling: legendOn && host.staticAttr(e, 'legendToggle') !== false,
    paging: legendOn && typeof host.staticAttr(e, 'legendMaxRows') === 'number',
  }
}


// ---- `<PlotChart navigator>` — the slider dataZoom, engine-laid-out ------------
//
// Compose twin of the Swift lowering: the strip is `renderNavigator` over the
// first mark across ALL rows, and its drag lives on its own Box laid over the
// strip (offset from the top of the host, above the preset strip), so the
// plot's tap and transform gestures never see a touch that starts there.

/** `kotlinFrameHostWithTap` that can also force the density line (the transform gesture reads it even without a tap) and lay an `overlay` composable over the canvas. */


// ---- `<PlotChart brush onBrush>` — drag-select a GLOBAL datum range -----------
//
// Compose twin of the Swift lowering: the committed range and the live span
// are remembered; a plain drag on the plot (never with `dataZoom`, where the
// web needs Shift) selects through the engine's `brushRange`; the band is
// `renderBrushBand` inside the chrome wrap. `onBrush` must be a NAMED handler.

/** The `onBrush` handler NAME, or undefined; warns by name for any other shape. */
export function kotlinBrushHandler(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string): string | undefined {
  const onBrush = e.attrs.find((a) => a.kind === 'event' && a.name === 'brush')
  if (onBrush?.kind !== 'event') return undefined
  const h = onBrush.handler
  if (h.kind === 'identifier') return kotlinIdent(h.name)
  host.warn(`<${tag} onBrush>: must be a NAMED handler (\`const onBrush = (r: BrushRange | null) => …\`) on native — an inline arrow is not lowered; the brush still selects, without the callback.`)
  return undefined
}

/** A pattern's optional texture fields (angle, symbol, spacingY), in struct order, when present as literals. */
function patternExtras(values: Map<string, ExprIR>, sep: string): string {
  const out: string[] = []
  const angle = values.get('angle')
  if (angle?.kind === 'literal' && typeof angle.value === 'number') out.push(`, angle${sep}${chartDouble(angle.value)}`)
  const symbol = values.get('symbol')
  if (symbol?.kind === 'literal' && typeof symbol.value === 'string') out.push(`, symbol${sep}${JSON.stringify(symbol.value)}`)
  const spacingY = values.get('spacingY')
  if (spacingY?.kind === 'literal' && typeof spacingY.value === 'number') out.push(`, spacingY${sep}${chartDouble(spacingY.value)}`)
  const image = values.get('image')
  if (image?.kind === 'literal' && typeof image.value === 'string') out.push(`, image${sep}${JSON.stringify(image.value)}`)
  const repeat = values.get('repeat')
  if (repeat?.kind === 'literal' && typeof repeat.value === 'string') out.push(`, repeat${sep}${JSON.stringify(repeat.value)}`)
  const shape = values.get('shape')
  if (shape?.kind === 'array') {
    const pts: string[] = []
    for (const e of shape.elements) {
      if (e.kind !== 'object') continue
      const xv = e.fields.find((f) => f.name === 'x')?.value
      const yv = e.fields.find((f) => f.name === 'y')?.value
      const x = xv?.kind === 'literal' && typeof xv.value === 'number' ? xv.value : 0
      const y = yv?.kind === 'literal' && typeof yv.value === 'number' ? yv.value : 0
      pts.push(`PyreonChartPt(${chartDouble(x)}, ${chartDouble(y)})`)
    }
    out.push(`, shape${sep}listOf(${pts.join(', ')})`)
  }
  const rings = values.get('shapeRings')
  if (rings?.kind === 'array') {
    const counts = rings.elements.map((e) => (e.kind === 'literal' && typeof e.value === 'number' ? chartDouble(e.value) : '0.0'))
    out.push(`, shapeRings${sep}listOf(${counts.join(', ')})`)
  }
  return out.join('')
}
