import { CHART_HOST_PALETTE, CHART_THEME_DEFAULT, CHART_THEME_FIELDS, chartDefaultLabel, chartEnterMs, chartHostAnimates, chartThemeFields, PLOT_MARK_OPTION_FIELDS, chartDouble, chartStaticFlag } from './hosts'
import type { ChartHostTarget, ChartThemeText } from './hosts'
import { substituteIdentifier, swiftIdent, swiftStr, type ExprIR, type TypeIR } from '@pyreon/native-compiler/plugin-api'
import { host } from './swift-facade'

// ---------------------------------------------------------------------------
// `@pyreon/charts` family hosts → PyreonChartCanvas (the SwiftUI Canvas
// that walks the generated engine's draw list). See hosts.ts.
// ---------------------------------------------------------------------------

export const SWIFT_CHART_TARGET: ChartHostTarget = {
  rect: (x, y, w, h) => `PyreonChartRect(x: ${x}, y: ${y}, w: ${w}, h: ${h})`,
  pt: (x, y) => `PyreonChartPt(x: ${x}, y: ${y})`,
  max0: (e) => `max(0.0, ${e})`,
  min: (a, b) => `min(${a}, ${b})`,
  nil: 'nil',
  nan: 'Double.nan',
  list: (items) => `[${items.join(', ')}]`,
  struct: (name, fields) => `${name}(${fields.map(([k, v]) => `${k}: ${v}`).join(', ')})`,
  coalesce: (a, b) => `(${a} ?? ${b})`,
  withProgress: (options, struct, progress) => (options === 'nil' ? `${struct}(progress: ${progress})` : `{ () -> ${struct} in var pyreonO = ${options}; pyreonO.progress = ${progress}; return pyreonO }()`),
  withThemeDefaults: (options, struct, fields) =>
    options === 'nil'
      ? `${struct}(${fields.map(([f, v]) => `${f}: ${v}`).join(', ')})`
      : `{ () -> ${struct} in var pyreonO = ${options}; ${fields.map(([f, v]) => `pyreonO.${f} = pyreonO.${f} ?? ${v}`).join('; ')}; return pyreonO }()`,
  pieOptions: (a) => `PieOptions(innerRadius: ${a.innerRatio}, showLabels: ${a.showLabels ?? 'true'}, labelColor: "#ffffff", fontSize: ${a.fontSize ?? '11.0'})`,
  theme: () => `ChartTheme(axis: ${swiftStr(CHART_THEME_DEFAULT.axis)}, grid: ${swiftStr(CHART_THEME_DEFAULT.grid)}, label: ${swiftStr(CHART_THEME_DEFAULT.label)}, fontSize: ${CHART_THEME_DEFAULT.fontSize})`,
}

/** `{ kind: 'typeRef' }` for an engine struct — steers an inline options literal (`tree={{ symbolSize: 8 }}`) to `TreeOptions` instead of a synthesized `__Obj`. */
export function chartStructRef(name: string | undefined): TypeIR | undefined {
  return name === undefined ? undefined : { kind: 'typeRef', name, args: [] }
}

/** Whether `<tag>` plays its entrance here: the engine takes a `progress` and the host did not write `animate={false}` — the web host's own rule. */
export function swiftChartAnimating(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string): boolean {
  return chartHostAnimates(tag) && host.staticAttr(e, 'animate') !== false
}

/**
 * The entrance: the host view inside `PyreonChartEntrance`, whose closure hands
 * the progress 0..1 down as `pyreonEntrance` — the host's render reads it the
 * way the web host reads its tween (`ChartSpec.progress`, `XOptions.progress`).
 * A host that does not animate is emitted exactly as before.
 */
export function swiftChartEntrance(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string, indent: number, inner: (indent: number) => string): string {
  if (!swiftChartAnimating(e, tag)) return inner(indent)
  const ms = chartEnterMs(chartAttrExpr(e, 'theme'), tag, SWIFT_CHART_TARGET.list, host.colorScope())
  const pad = ' '.repeat(indent + 2)
  return `PyreonChartEntrance(durationMs: ${ms}) { pyreonEntrance in\n${pad}${inner(indent + 2)}\n${' '.repeat(indent)}}`
}

/** A JSX attr's value expression, unwrapping a zero-arg accessor arrow. */
export function chartAttrExpr(e: Extract<ExprIR, { kind: 'jsx-element' }>, name: string): ExprIR | undefined {
  for (const a of e.attrs) {
    if (a.kind === 'attr' && a.name === name) {
      const v = a.value
      if (v.kind === 'arrow' && v.params.length === 0) return v.body
      return v
    }
  }
  return undefined
}

/** A numeric host prop as a Double expression: static → literal, dynamic → `Double(expr)`, absent → the default. */
export function swiftChartDouble(e: Extract<ExprIR, { kind: 'jsx-element' }>, name: string, fallback: number, indent: number): string {
  const stat = host.staticAttr(e, name)
  if (typeof stat === 'number') return chartDouble(stat)
  const dyn = chartAttrExpr(e, name)
  if (dyn !== undefined) return `Double(${host.expr(dyn, indent)})`
  return chartDouble(fallback)
}

/** Select the stateful draw-list host unless update animation is explicitly disabled. */
export function swiftChartCanvas(e: Extract<ExprIR, { kind: 'jsx-element' }>, cmds: string, indent: number): string {
  const args = [`cmds: ${cmds}`]
  if (chartAttrExpr(e, 'updateDuration') !== undefined) args.push(`durationMs: ${swiftChartDouble(e, 'updateDuration', 350, indent)}`)
  const flag = (prop: string): boolean => chartStaticFlag(e, e.tag, prop, (name) => host.staticAttr(e, name), (w) => host.warn(w))
  if (flag('universalTransition')) args.push('universal: true')
  if (host.staticAttr(e, 'updateAnimation') === false) args.push('animated: false')
  else flag('updateAnimation')
  const canvas = `PyreonChartCanvas(${args.join(', ')})`
  // `toolbox={{ saveAsImage: true }}` on a family host: a save button over the
  // top-right corner (the web canvas host draws the same glyph there) that
  // shares the chart image, or hands `onSaveImage` its PNG data URL. PlotChart
  // lowers its whole toolbox itself.
  if (e.tag === 'PlotChart' || !swiftToolboxSaves(e)) return canvas
  const onSave = e.attrs.find((a) => a.kind === 'event' && a.name === 'saveimage')
  const size = 'Double(pyreonSaveGeo.size.width), Double(pyreonSaveGeo.size.height)'
  const action = onSave?.kind === 'event'
    ? swiftChartSelectBody(onSave.handler, `pyreonChartDataUrl(${cmds}, ${size})`, indent)
    : `pyreonShareChartImage(${cmds}, ${size}, ${JSON.stringify(String(host.staticAttr(e, 'title') ?? 'chart'))})`
  return `GeometryReader { pyreonSaveGeo in ZStack(alignment: .topTrailing) { ${canvas}; Button(action: { ${action} }) { Text("⤓") }.padding(4).accessibilityIdentifier("pyreon-save-image") } }.accessibilityElement(children: .contain)`
}

/** Whether a host's `toolbox` literal asks for `saveAsImage`. */
function swiftToolboxSaves(e: Extract<ExprIR, { kind: 'jsx-element' }>): boolean {
  const tb = chartAttrExpr(e, 'toolbox')
  if (tb === undefined) return false
  const saves = tb.kind === 'object' && tb.fields.some((f) => f.name === 'saveAsImage' && f.value.kind === 'literal' && f.value.value === true)
  if (!saves) host.warn(`<${e.tag} toolbox>: a family chart's toolbox offers \`saveAsImage: true\` (a literal) on native; nothing else is drawn.`)
  return saves
}

/**
 * The body of the tap closure for `onSelectIndex`: bind the handler's param to
 * the engine's index hit, then run the handler's own body as a zero-arg
 * closure (which captures the binding). A bare function reference is called
 * with the hit directly.
 */
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

export function swiftChartSelectBody(handler: ExprIR, hitExpr: string, indent: number): string {
  if (handler.kind === 'arrow') {
    const p = handler.params[0]
    const zeroArg: ExprIR = { ...handler, params: [] }
    const closure = host.action(zeroArg, indent)
    return p === undefined ? `(${closure})()` : `let ${swiftIdent(p)} = ${hitExpr}; (${closure})()`
  }
  const resolved = host.handlerName(handler)
  if (resolved !== undefined) return `${swiftIdent(resolved)}(${hitExpr})`
  return `(${host.expr(handler, indent)})(${hitExpr})`
}

// ---- accessor-prop hosts (FunnelChart / PieChart) + GaugeChart ------------

/**
 * An accessor prop's body with its params substituted for the mapped
 * closure's (`pyreonD`, `pyreonI`), emitted as an expression — or null when
 * the prop is absent. A block-bodied accessor is reported by name.
 */
export function swiftChartAccessor(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string, prop: string, indent: number): string | null | 'unsupported' {
  const v = chartAttrExpr(e, prop)
  if (v === undefined) return null
  if (v.kind !== 'arrow' || (v.stmts !== undefined && v.stmts.length > 0) || v.params.length > 2) {
    host.warn(`<${tag} ${prop}>: only a single-expression arrow \`(d, i) => …\` lowers on native; emitting an EmptyView().`)
    return 'unsupported'
  }
  let body: ExprIR | null = v.body
  const names = ['pyreonD', 'pyreonI']
  for (let i = 0; i < v.params.length && body !== null; i++) {
    body = substituteIdentifier(body, v.params[i]!, { kind: 'identifier', name: names[i]! })
  }
  if (body === null) {
    host.warn(`<${tag} ${prop}>: the accessor shadows its own parameter; emitting an EmptyView().`)
    return 'unsupported'
  }
  return host.expr(body, indent)
}

// ---- cartesian-frame hosts (Candlestick / Heatmap) + Radar ----------------
//
// The mapped inputs are hoisted into typed `let`s inside the host's view
// builder rather than inlined into one expression: a render call whose
// arguments are two `enumerated().map` closures (and the same two again in the
// tap's hit test) sends swiftc into "unable to type-check this expression in
// reasonable time". A `let pyreonCandles: [Ohlc] = …` per input keeps every
// expression small and its type stated — and the Int→Double coercion goes
// through `pyreonChartDouble` (two overloads) rather than `Double(_:)` (twenty),
// because four of those in one struct init is the same explosion.

/** `data.enumerated().map { (pyreonI, pyreonD) in <wrap(accessor body)> }`, or 'unsupported' (reported) / null (absent). */
export function swiftChartMap(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  tag: string,
  data: string,
  prop: string,
  wrap: (body: string) => string,
  indent: number,
): string | null | 'unsupported' {
  const acc = swiftChartAccessor(e, tag, prop, indent)
  if (acc === null || acc === 'unsupported') return acc
  return `${data}.enumerated().map { (pyreonI, pyreonD) in ${wrap(acc)} }`
}

/**
 * The host's view: a GeometryReader (width from the reader) or a Group (width
 * given) whose builder holds the hoisted `let`s and then the canvas.
 */
/**
 * The canvas's accessible name, in the web host's order of precedence: an
 * explicit `accessibilityLabel`, else the engine's data DESCRIPTION when the
 * host can build one (`describeChart` over the plot's series — the sentence
 * the web `aria-label` carries), else `title`, else the family word. Every
 * native chart canvas is therefore named; before this only a titled host was.
 */
export function swiftChartA11y(e: Extract<ExprIR, { kind: 'jsx-element' }>, describe: string | undefined, indent: number): string {
  // With the data in hand (the plot host), VoiceOver also gets the chart's
  // DATA: an AXChartDescriptor over the same A11yInput the description reads —
  // the Audio Graph and a per-point explorer, the native twin of the web
  // host's hidden table.
  const descriptor = describe === undefined ? '' : `.accessibilityChartDescriptor(PyreonChartDescriptor(${describe.slice('describeChart('.length, -1)}))`
  const explicit = host.stringAttr(e, 'accessibilityLabel', indent)
  if (explicit !== undefined) return `.accessibilityLabel(${explicit})${descriptor}`
  if (describe !== undefined) return `.accessibilityLabel(${describe})${descriptor}`
  const title = host.stringAttr(e, 'title', indent)
  return `.accessibilityLabel(${title ?? swiftStr(chartDefaultLabel(e.tag))})`
}

/**
 * RTL for a chart host: the mirror for its finished draw list, and the tap-x
 * translation that must accompany it.
 *
 * Returned as a PAIR, and every caller takes both. The paint and the pointer
 * are one contract — a host that mirrors what it draws but hit-tests the raw
 * x reports the item on the opposite side of the chart, silently, and only
 * for right-to-left users. Handing them out separately is how one of six
 * emitters ends up with half.
 */
/** The visualMap drag + piece tap, as a simultaneous gesture; `at` maps a gesture location to plot space. */
export function swiftVisualMapGesture(at: (loc: string) => [string, string]): string {
  const [sx, sy] = at('pyreonV.startLocation')
  const [mx, my] = at('pyreonV.location')
  return `.simultaneousGesture(DragGesture(minimumDistance: 0).onChanged { pyreonV in if pyreonVmHandle == -2.0 { pyreonVmHandle = visualStripHandleAt(pyreonStrip, pyreonVmPlace.at, pyreonVmRange, ${sx}, ${sy}) }; if pyreonVmHandle >= 0.0 { pyreonVmRange = visualStripDrag(pyreonStrip, pyreonVmRange, pyreonVmHandle, visualStripValueAt(pyreonStrip, pyreonVmPlace.at, ${mx}, ${my})) } }.onEnded { pyreonV in if pyreonVmHandle < 0.0 { let pyreonP = visualStripPieceAt(pyreonStrip, pyreonVmPlace.at, ${sx}, ${sy}); if pyreonP >= 0.0 { pyreonVmSelected = visualStripToggle(pyreonStrip, pyreonVmSelected, pyreonP) } }; pyreonVmHandle = -2.0 })`
}

/** The visualMap's host state (Swift `@State`). */
export function swiftVisualMapState(vm: { lo: string; hi: string; selected: string }): void {
  host.hostState.declare(`@State private var pyreonVmRange: Domain = Domain(min: ${vm.lo}, max: ${vm.hi})`)
  host.hostState.declare(`@State private var pyreonVmSelected: [Bool] = ${vm.selected}`)
  host.hostState.declare('@State private var pyreonVmHandle: Double = -2.0')
}

export function swiftRtl(e: Extract<ExprIR, { kind: 'jsx-element' }>, W: string): { mirror: (cmds: string) => string; tapX: (raw: string) => string } {
  const rtl = host.staticAttr(e, 'rtl') === true
  return {
    mirror: (cmds) => (rtl ? `pyreonMirrorCmds(${cmds}, ${W})` : cmds),
    tapX: (raw) => (rtl ? `(${W} - ${raw})` : raw),
  }
}

export function swiftFrameHost(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  lets: readonly string[],
  canvas: string,
  gesture: string,
  W: string,
  H: string,
  hasWidth: boolean,
  indent: number,
  describe?: string,
  after = '',
): string {
  // The label sits INSIDE the scope with the hoisted `let`s: a data
  // description reads `pyreonSeries` / `pyreonCats`, which do not exist
  // outside the GeometryReader / Group.
  const a11y = swiftChartA11y(e, describe, indent)
  const tail = host.layoutModifiers(e)
  const pad = ' '.repeat(indent + 2)
  const body = lets.map((l) => `${pad}${l}\n`).join('')
  // A host carrying an overlay (the data view) keeps its children reachable:
  // without `.contain` SwiftUI folds the one-child host into a single element.
  const contain = after === '' ? '' : '.accessibilityElement(children: .contain)'
  if (hasWidth) return `Group {\n${body}${pad}${canvas}${gesture}${a11y}${after}.frame(width: ${W}, height: ${H})${contain}${tail}\n${' '.repeat(indent)}}`
  return `GeometryReader { pyreonGeo in\n${body}${pad}${canvas}${gesture}${a11y}${after}\n${' '.repeat(indent)}}.frame(height: ${H})${contain}${tail}`
}

export function swiftChartGesture(e: Extract<ExprIR, { kind: 'jsx-element' }>, hit: (x: string, y: string) => string, indent: number, names: readonly string[] = ['selectindex', 'select'], tapX: (raw: string) => string = (raw) => raw): string {
  const onSel = e.attrs.find((a) => a.kind === 'event' && names.includes(a.name))
  if (onSel?.kind !== 'event') return ''
  return `.contentShape(Rectangle()).simultaneousGesture(SpatialTapGesture().onEnded { pyreonTap in ${swiftChartSelectBody(onSel.handler, hit(tapX('Double(pyreonTap.location.x)'), 'Double(pyreonTap.location.y)'), indent)} })`
}

// ---- `<PlotChart marks>` -----------------------------------------------------

/** An accessor arrow's body with its params substituted, as an expression — or 'unsupported' (reported). */
export function swiftAccessorExpr(v: ExprIR, tag: string, what: string, indent: number): string | 'unsupported' {
  if (v.kind !== 'arrow' || (v.stmts !== undefined && v.stmts.length > 0) || v.params.length > 2) {
    host.warn(`<${tag}> ${what}: only a single-expression arrow \`(d, i) => …\` lowers on native; emitting an EmptyView().`)
    return 'unsupported'
  }
  let body: ExprIR | null = v.body
  const names = ['pyreonD', 'pyreonI']
  for (let i = 0; i < v.params.length && body !== null; i++) {
    body = substituteIdentifier(body, v.params[i]!, { kind: 'identifier', name: names[i]! })
  }
  if (body === null) {
    host.warn(`<${tag}> ${what}: the accessor shadows its own parameter; emitting an EmptyView().`)
    return 'unsupported'
  }
  return host.expr(body, indent)
}

/** The literal option fields of one mark call as `name: value` Swift args, in `Series` declaration order. */
export function swiftMarkOptionArgs(opts: ExprIR | undefined, tag: string, seriesIndex: number, palette: readonly string[] = CHART_HOST_PALETTE, colorSlot: number = seriesIndex): string[] | 'unsupported' {
  const fields = new Map<string, ExprIR>()
  if (opts !== undefined) {
    if (opts.kind !== 'object' || (opts.spreads !== undefined && opts.spreads.length > 0)) {
      host.warn(`<${tag}> mark ${seriesIndex + 1}: options must be an object literal on native; emitting an EmptyView().`)
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
    args.push(`pattern: PyreonChartPattern(kind: ${JSON.stringify(kind.value)}, color: ${JSON.stringify(color.value)}, spacing: ${chartDouble(spacing.value)}, width: ${chartDouble(width.value)}${patternExtras(values, ': ')})`)
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
      stopArgs.push(`PyreonChartGradientStop(offset: ${chartDouble(offset.value)}, color: ${JSON.stringify(color.value)})`)
    }
    if (direction !== undefined && (direction.kind !== 'literal' || typeof direction.value !== 'string')) return false
    if (shape !== undefined && (shape.kind !== 'literal' || typeof shape.value !== 'string')) return false
    args.push(`gradient: SeriesGradient(stops: [${stopArgs.join(', ')}]${direction === undefined ? '' : `, direction: ${JSON.stringify(direction.value)}`}${shape === undefined ? '' : `, shape: ${JSON.stringify(shape.value)}`})`)
    return true
  }
  let patternPushed = false
  for (const spec of PLOT_MARK_OPTION_FIELDS) {
    if (spec.name === 'negativeColor' && !patternPushed) {
      if (!pushGradient()) {
        host.warn(`<${tag}> mark ${seriesIndex + 1}: \`gradient\` needs literal stops (offset + color) and an optional direction on native; emitting an EmptyView().`)
        return 'unsupported'
      }
      if (!pushPattern()) {
        host.warn(`<${tag}> mark ${seriesIndex + 1}: \`pattern\` needs literal kind/color/spacing/width fields on native; emitting an EmptyView().`)
        return 'unsupported'
      }
      patternPushed = true
    }
    const v = fields.get(spec.name)
    if (v !== undefined) {
      if (v.kind !== 'literal' || typeof v.value !== spec.kind) {
        host.warn(`<${tag}> mark ${seriesIndex + 1}: \`${spec.name}\` must be a ${spec.kind} literal on native; emitting an EmptyView().`)
        return 'unsupported'
      }
      const lit = spec.kind === 'number' ? chartDouble(v.value as number) : swiftStr(v.value)
      args.push(`${spec.name}: ${lit}`)
      continue
    }
    if (spec.name === 'color') args.push(`color: ${swiftStr(palette[colorSlot % palette.length])}`)
    else if (spec.name === 'label') args.push(`label: ${swiftStr(`Series ${seriesIndex + 1}`)}`)
    else if (spec.default !== undefined) args.push(`${spec.name}: ${spec.kind === 'number' ? chartDouble(spec.default as number) : String(spec.default)}`)
  }
  if (!patternPushed && !pushGradient()) {
    host.warn(`<${tag}> mark ${seriesIndex + 1}: \`gradient\` needs literal stops (offset + color) and an optional direction on native; emitting an EmptyView().`)
    return 'unsupported'
  }
  if (!patternPushed && !pushPattern()) {
    host.warn(`<${tag}> mark ${seriesIndex + 1}: \`pattern\` needs literal kind/color/spacing/width fields on native; emitting an EmptyView().`)
    return 'unsupported'
  }
  return args
}

// ---- legend + title chrome (Plot / Pie / Radar) ------------------------------
//
// The web hosts draw the title block, then the legend, then the plot in what
// is left, translating the plot's commands down by the height the two used.
// Natively the same three lists are built from the crossed `renderTitle` /
// `renderLegend` and the runtime's `pyreonShiftCmds`; a host with neither
// flag emits exactly what it emitted before (no lets, no shift).

interface SwiftChartChrome {
  lets: string[]
  /** `'0.0'` when there is no chrome — callers then leave their emit untouched. */
  top: string
  /** `'0.0'` unless the legend sits on the LEFT, which indents the plot. */
  left: string
  /** Wraps the plot's draw list: `title + legend + shift(plot, left, top)`. */
  wrap: (plot: string) => string
  /** The plot's height once the chrome is subtracted. */
  height: (H: string) => string
  /** The plot's width once a side legend is subtracted. */
  width: (W: string) => string
  /**
   * RTL: mirror a finished draw list about the canvas centreline, or hand it
   * back untouched.
   *
   * Lives on the chrome rather than in each host emitter because it TRAVELS
   * WITH `tapX`. The paint and the pointer are one contract — a host that
   * mirrors its list and not its taps reports the wrong item, silently, in
   * one locale — and shipping them as a pair is what stops the next host
   * from taking half of it.
   */
  mirror: (cmds: string) => string
  /** A tap's x in CANVAS space: RTL-unmirrored, but NOT plot-offset — what the chrome hits (legend entries, pager, presets) are laid out in. */
  tapX: (raw: string) => string
  /** A tap's x in PLOT space: `tapX` minus a left legend's column. The plot's own hit test and its tooltip read this. */
  plotX: (raw: string) => string
}

export function swiftChartChrome(e: Extract<ExprIR, { kind: 'jsx-element' }>, entries: string, W: string, H: string, indent: number, withTitle: boolean, t: ChartThemeText, page?: string): SwiftChartChrome {
  const title = host.stringAttr(e, 'title', indent)
  const showTitle = withTitle && host.staticAttr(e, 'showTitle') === true && title !== undefined
  const showLegend = host.staticAttr(e, 'showLegend') === true
  const { mirror, tapX } = swiftRtl(e, W)
  if (!showTitle && !showLegend) return { lets: [], top: '0.0', left: '0.0', wrap: (p) => p, height: (h) => h, width: (w) => w, mirror, tapX, plotX: tapX }
  const lets: string[] = []
  if (showTitle) {
    const subtitle = host.stringAttr(e, 'subtitle', indent) ?? 'nil'
    lets.push(`let pyreonTitle: TitleLayout = renderTitle(${title}, ${subtitle}, PyreonChartRect(x: 0.0, y: 0.0, w: ${W}, h: ${H}), TitleOptions(fontSize: ${t.titleSize}, color: ${t.text}, align: "start"))`)
  } else {
    lets.push('let pyreonTitle: TitleLayout = TitleLayout(cmds: [], height: 0.0)')
  }
  if (showLegend) {
    const maxRowsRaw = host.staticAttr(e, 'legendMaxRows')
    const maxRows = typeof maxRowsRaw === 'number' ? `, maxRows: ${chartDouble(maxRowsRaw)}` : ''
    const pageArg = page === undefined ? '' : `, page: ${page}`
    // PLACEMENT is the engine's (`placeLegend`), the same call the web host
    // makes — not four branches re-derived here. The emit used to draw the
    // legend at x: 0 with the full width while the web host inset it by 8 on
    // each side, so a legend sat 8px further left on a phone than in a
    // browser and the plot 8px higher; that divergence goes with the split.
    lets.push(
      `let pyreonLegend: LegendPlacement = placeLegend(${entries}, PyreonChartRect(x: 0.0, y: pyreonTitle.height, w: ${W}, h: ${H} - pyreonTitle.height), ${swiftLegendPosition(e)}, `
        + `LegendOptions(fontSize: ${t.fontSize}, labelColor: ${t.label}, swatch: 10.0, gap: 12.0, orientation: "horizontal"${maxRows}${pageArg}), pyreonChartMeasure)`,
    )
  } else {
    lets.push('let pyreonLegend: LegendPlacement = LegendPlacement(cmds: [], top: 0.0, bottom: 0.0, left: 0.0, right: 0.0, boxes: [])')
  }
  lets.push('let pyreonTop: Double = pyreonTitle.height + pyreonLegend.top')
  // Only the insets a legend at THIS position can actually take are emitted,
  // so a top legend (the default, and every chart before this) keeps the exact
  // shift and height it had.
  const pos = swiftLegendPosition(e)
  const side = showLegend && (pos === '.left' || pos === '.right')
  const below = showLegend && pos === '.bottom'
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
function swiftLegendPosition(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const raw = host.staticAttr(e, 'legendPosition')
  return typeof raw === 'string' && (raw === 'bottom' || raw === 'left' || raw === 'right') ? `.${raw}` : '.top'
}

/** `<RadarChart data axes values label color? fillAlpha? rings? showLabels? showLegend? height width title>` → renderRadar over the mapped series. */

/** `<PlotChart data marks x? xValue? showXAxis? showYAxis? showGrid? horizontal? xTime? annotations? markers? y2Domain? showLegend? showTitle? onSelect? …>` */


// ---- theme overrides, formatters and bubble marks -----------------------------

/**
 * The host's `ChartTheme` literal: the web default, overridden by the literal
 * fields of a `theme={{ … }}` object literal. Any other shape keeps the default
 * and says so.
 */
export function swiftChartTheme(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string): string {
  return swiftChartThemeFrom(swiftChartThemeFields(e, tag))
}

/** The resolved theme per field as emitted text — read ONCE per host (it warns on a non-literal theme) and shared by the chrome, the tooltip and the palette default. */
export function swiftChartThemeFields(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string): ChartThemeText {
  return chartThemeFields(chartAttrExpr(e, 'theme'), tag, (w) => host.warn(w), (items) => `[${items.join(', ')}]`, host.colorScope(), swiftChartScheme)
}

/** The runtime colour-scheme switch: SwiftUI's `colorScheme` environment (injected into the view once any host reads it). */
export function swiftChartScheme(light: string, dark: string): string {
  host.markColorSchemeUsed()
  return `(pyreonColorScheme == .dark ? ${dark} : ${light})`
}

/** Whether the host is themed at all — by its own `theme` or by a provider scope. */
export function swiftChartThemed(e: Extract<ExprIR, { kind: 'jsx-element' }>): boolean {
  // Always: with neither a theme nor a provider the host still follows the runtime colour scheme.
  void e
  return true
}

export function swiftChartThemeFrom(f: ChartThemeText): string {
  return `ChartTheme(${CHART_THEME_FIELDS.map((x) => `${x.name}: ${f[x.name]}`).join(', ')})`
}

/**
 * A `Formatter` prop as a Swift `(Double) -> String`: an engine formatter by
 * name (`plain`, `compact`), an engine factory call (`fixed(2)`, `currency("$", 2)`,
 * `percent(1)`), or an arrow — which lowers as a closure and is type-checked by
 * the compile gates. `undefined` when the prop is absent.
 */
export function swiftChartFormatter(e: Extract<ExprIR, { kind: 'jsx-element' }>, prop: string, indent: number): string | undefined {
  const v = chartAttrExpr(e, prop)
  if (v === undefined) return undefined
  return host.expr(v, indent)
}

/** `<CandlestickChart data open high low close x? candle? theme? height width title>` → the shared frame over the mapped candles. */

/** `<HeatmapChart data x y value colors? gap? theme? height width title onSelectIndex?>` → heatGridFrom over the mapped rows + the shared frame. */

/** `<PlotChart data marks x? xValue? showXAxis? showYAxis? showGrid? horizontal? xTime? annotations? markers? y2Domain? theme? format? xFormat? y2Format? showLegend? showTitle? onSelect? …>` */

/**
 * The error-bar bounds of one mark's options as `errLow:` / `errHigh:` Series
 * args, mapping each accessor over the SAME rows the values came from (the
 * bubble radius channel's shape). Both bounds are needed for a whisker, so
 * exactly one is named and dropped. `lets` receives the two row maps.
 */
export function swiftMarkErrorArgs(
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
  const lowBody = swiftAccessorExpr(low, tag, `mark ${seriesIndex + 1} errorLow`, indent)
  const highBody = swiftAccessorExpr(high, tag, `mark ${seriesIndex + 1} errorHigh`, indent)
  if (lowBody === 'unsupported' || highBody === 'unsupported') return 'unsupported'
  lets.push(`let ${namePrefix}ErrLow${seriesIndex}: [Double] = ${swiftPlotRowMap(rows, `pyreonChartDouble(${lowBody})`, 'Double', windowed, decimated)}`)
  lets.push(`let ${namePrefix}ErrHigh${seriesIndex}: [Double] = ${swiftPlotRowMap(rows, `pyreonChartDouble(${highBody})`, 'Double', windowed, decimated)}`)
  return [`errLow: ${namePrefix}ErrLow${seriesIndex}`, `errHigh: ${namePrefix}ErrHigh${seriesIndex}`]
}

/** `[minRadius, maxRadius]` of a bubble's options literal, the web defaults (3, 18) when absent. */
export function swiftBubbleRange(opts: ExprIR | undefined): [string, string] {
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
// A host is an expression inside the user's component and cannot declare
// state on its own, so the plot host with `dataZoom` REGISTERS the `@State`
// properties it needs here; `emitSwiftComponent` splices them into the
// struct right before `var body` once the body has been emitted. The window
// is the engine's `ZoomWindow`; the rows are sliced through `sliceRange`,
// so a zoomed chart is just a chart of fewer rows — and the accessors keep
// seeing the GLOBAL index, exactly as on the web.



export function swiftPlotRowMap(rows: string, body: string, type: string, zoomed: boolean, decimated = false): string {
  if (!zoomed && !decimated) return `${rows}.enumerated().map { (pyreonI, pyreonD) in ${body} }`
  // Bind the rebased GLOBAL index only when the accessor reads it (an unused let is a warning).
  if (!/\bpyreonI\b/.test(body)) return `${rows}.enumerated().map { (_, pyreonD) -> ${type} in ${body} }`
  const local = decimated ? 'pyreonKeep[pyreonJ]' : 'pyreonJ'
  const global = zoomed ? `${local} + pyreonRange.from` : local
  return `${rows}.enumerated().map { (pyreonJ, pyreonD) -> ${type} in let pyreonI = ${global}; return ${body} }`
}

/** `<PlotChart data marks x? xValue? … dataZoom? showLegend? showTitle? onSelect? …>` */


// ---- `<PlotChart zoomPresets>` — the preset strip, engine-laid-out ------------
//
// The strip is the engine's `renderPresets` (the same layout the web host
// paints), so iOS places and hit-tests the same buttons. A tap that lands on a
// button writes the window; presets therefore need the host's window state
// even without `dataZoom` (no gestures then — just the strip).

/** `zoomPresets={[{ label, count }, …]}` as `ZoomPreset(label:count:)` literals; `undefined` when absent or empty; `'unsupported'` (warned) for any other shape. */
export function swiftZoomPresets(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string): string[] | 'unsupported' | undefined {
  const v = chartAttrExpr(e, 'zoomPresets')
  if (v === undefined) return undefined
  if (v.kind !== 'array') return unsupportedZoomPresets(tag)
  const out: string[] = []
  for (const el of v.elements) {
    if (el.kind !== 'object') return unsupportedZoomPresets(tag)
    const label = el.fields.find((f) => f.name === 'label')?.value
    const count = el.fields.find((f) => f.name === 'count')?.value
    if (label?.kind !== 'literal' || typeof label.value !== 'string' || count?.kind !== 'literal' || typeof count.value !== 'number') return unsupportedZoomPresets(tag)
    out.push(`ZoomPreset(label: ${swiftStr(label.value)}, count: ${Math.trunc(count.value)})`)
  }
  return out.length === 0 ? undefined : out
}

function unsupportedZoomPresets(tag: string): 'unsupported' {
  host.warn(`<${tag} zoomPresets>: must be an inline array of \`{ label, count }\` literals on native; the chart renders without the preset strip.`)
  return 'unsupported'
}

/** `<PlotChart data marks x? xValue? … dataZoom? zoomPresets? showLegend? showTitle? onSelect? …>` */


// ---- `<PlotChart showLegend legendToggle legendMaxRows>` — legend tap + paging ----
//
// The legend's boxes and pager rects come from the engine's `renderLegend`;
// the hidden set and the page are host state (the same `@State` splice the
// window uses). A tap on an entry toggles it (`legendToggle`), the series
// feed the plot through `hideHiddenSeries`, and the entries render muted —
// exactly the web's model, so a hidden series keeps its slot on every target.

/** Legend interaction the host must wire: none, toggle only, page only, or both. */
interface SwiftLegendInteraction {
  toggling: boolean
  paging: boolean
}

export function swiftLegendInteraction(e: Extract<ExprIR, { kind: 'jsx-element' }>): SwiftLegendInteraction {
  const legendOn = host.staticAttr(e, 'showLegend') === true
  return {
    toggling: legendOn && host.staticAttr(e, 'legendToggle') !== false,
    paging: legendOn && typeof host.staticAttr(e, 'legendMaxRows') === 'number',
  }
}

/** `<PlotChart data marks x? xValue? … dataZoom? zoomPresets? showLegend? legendToggle? legendMaxRows? showTitle? onSelect? …>` */


// ---- `<PlotChart navigator>` — the slider dataZoom, engine-laid-out ------------
//
// The strip is the engine's `renderNavigator` over the FIRST mark's values
// across ALL rows; its drag model (`navigatorHit` / `navigatorDrag`) writes
// the same window the pinch and the presets write. The drag lives on its own
// clear overlay above the strip, so it never competes with the plot's pinch
// and pan gestures — a touch that starts on the strip is the navigator's.

/** `<PlotChart data marks x? xValue? … dataZoom? zoomPresets? navigator? showLegend? legendToggle? legendMaxRows? showTitle? onSelect? …>` */


// ---- `<PlotChart brush onBrush>` — drag-select a GLOBAL datum range -----------
//
// The brush's mapping, placement and band come from the engine (`brush.ts`);
// the host holds the committed range and the live span as state. Without
// `dataZoom` a plain drag on the plot IS the brush (the web's rule); with it
// the web needs Shift, which touch has not, so that combination stays
// web-only and says so. `onBrush` takes `BrushRange | null` and must be a
// NAMED handler (`const onBrush = (r: BrushRange | null) => …`): a named
// handler lowers to a func whose optional parameter narrows; an inline arrow
// does not carry that type through the tap's closure.

/** The `onBrush` handler NAME, or undefined; warns by name for any other shape. */
export function swiftBrushHandler(e: Extract<ExprIR, { kind: 'jsx-element' }>, tag: string): string | undefined {
  const onBrush = e.attrs.find((a) => a.kind === 'event' && a.name === 'brush')
  if (onBrush?.kind !== 'event') return undefined
  const h = onBrush.handler
  if (h.kind === 'identifier') return swiftIdent(h.name)
  const resolved = host.handlerName(h)
  if (resolved !== undefined) return swiftIdent(resolved)
  host.warn(`<${tag} onBrush>: must be a NAMED handler (\`const onBrush = (r: BrushRange | null) => …\`) on native — an inline arrow is not lowered; the brush still selects, without the callback.`)
  return undefined
}

/** `<PlotChart data marks x? xValue? … dataZoom? zoomPresets? navigator? brush? onBrush? showLegend? legendToggle? legendMaxRows? showTitle? onSelect? …>` */

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
      pts.push(`PyreonChartPt(x: ${chartDouble(x)}, y: ${chartDouble(y)})`)
    }
    out.push(`, shape${sep}[${pts.join(', ')}]`)
  }
  const rings = values.get('shapeRings')
  if (rings?.kind === 'array') {
    const counts = rings.elements.map((e) => (e.kind === 'literal' && typeof e.value === 'number' ? chartDouble(e.value) : '0.0'))
    out.push(`, shapeRings${sep}[${counts.join(', ')}]`)
  }
  return out.join('')
}
