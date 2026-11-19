/**
 * The scenarios `check-import-budgets.ts` measures: one canonical minimal
 * import per entry, with the package it targets. Data only, kept apart from
 * the gate's code so neither file outgrows the readable size limit; the gate
 * re-exports both names, so importers of `check-import-budgets.ts` are
 * unaffected. Add a package's scenarios grouped with that package's others.
 */
/** A canonical minimal import a real app writes, + the package it targets. */
export interface Scenario {
  /** Stable budget key. */
  id: string
  /** Workspace package name (for messages). */
  pkg: string
  /** Path to the package dir, relative to `packages/`. */
  dir: string
  /** Named exports the scenario imports (re-exported so they're retained). */
  imports: string[]
  /**
   * Lib entry file relative to the package's lib/ (default "index.js").
   * Subpath scenarios (e.g. charts' "engine.js") lock a subpath export's
   * tree-shaking without routing through the main barrel.
   */
  entry?: string
}

/**
 * The app-critical client packages + the imports real apps actually
 * write. Deliberately NOT the heavy fundamentals (charts/flow/document)
 * — those are lazy-loaded by design and covered by the full-barrel
 * budget + the `no-eager-import` lint rule.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: '@pyreon/reactivity::signals',
    pkg: '@pyreon/reactivity',
    dir: 'core/reactivity',
    imports: ['signal', 'computed', 'effect', 'batch', 'onCleanup', 'untrack'],
  },
  {
    id: '@pyreon/runtime-dom::mount',
    pkg: '@pyreon/runtime-dom',
    dir: 'core/runtime-dom',
    imports: ['mount'],
  },
  {
    id: '@pyreon/runtime-dom::mount+hydrate',
    pkg: '@pyreon/runtime-dom',
    dir: 'core/runtime-dom',
    imports: ['mount', 'hydrateRoot'],
  },
  {
    id: '@pyreon/router::basic',
    pkg: '@pyreon/router',
    dir: 'core/router',
    imports: ['RouterProvider', 'RouterView', 'RouterLink'],
  },
  {
    // Locks the PURE-form branding win (elements PR, 2026-07): bare top-level
    // `Component.x = y` brand assignments pinned EVERY component into every
    // consumer bundle — importing just <Portal> paid the whole 7.5KB gz of
    // @pyreon/elements; the fix took it to ~2.4KB and <Element> to ~4.0KB.
    // One reverted file taxes the SIBLING imports (the components pin each
    // other), so the aggregate outcome is what must be locked — a per-file
    // guard can't see it.
    id: '@pyreon/elements::portal',
    pkg: '@pyreon/elements',
    dir: 'ui-system/elements',
    imports: ['Portal'],
  },
  {
    id: '@pyreon/elements::element',
    pkg: '@pyreon/elements',
    dir: 'ui-system/elements',
    imports: ['Element'],
  },
  {
    // Locks the styler lazy-singleton win: the top-level `new StyleSheet()`
    // + flush registration + onSheetClear call pinned the whole sheet engine
    // into EVERY consumer bundle — `useTheme`-only imports paid 6.09KB gz.
    // After moving registration into the constructor (PURE singleton) and
    // the clear-hook to first styled() call: useTheme 1.12KB, css 1.49KB.
    id: '@pyreon/styler::useTheme',
    pkg: '@pyreon/styler',
    dir: 'ui-system/styler',
    imports: ['useTheme'],
  },
  {
    id: '@pyreon/styler::css',
    pkg: '@pyreon/styler',
    dir: 'ui-system/styler',
    imports: ['css'],
  },
  {
    // Locks the defineStore / defineSchemaStore split: a setup-only store must
    // not carry schema mode or the `@pyreon/validation` bridge. Re-merging
    // schema dispatch into `defineStore` puts both back.
    id: '@pyreon/store::defineStore',
    pkg: '@pyreon/store',
    dir: 'fundamentals/store',
    imports: ['defineStore'],
  },
  {
    // The matcher alone: the `core` entry has no @pyreon dependency, so a palette-less app that only filters a list pays for this and nothing else.
    id: '@pyreon/command::matcher',
    pkg: '@pyreon/command',
    dir: 'fundamentals/command',
    entry: 'core.js',
    imports: ['fuzzyMatch', 'rank'],
  },
  {
    // The registry without the palette or the components: the matcher, the registry and the hotkeys glue.
    id: '@pyreon/command::registry',
    pkg: '@pyreon/command',
    dir: 'fundamentals/command',
    entry: 'index.js',
    imports: ['createCommands', 'useCommand'],
  },
  {
    // The palette state without the components: the registry, the matcher and the state of the palette (pages, async source, ARIA wiring).
    id: '@pyreon/command::palette-state',
    pkg: '@pyreon/command',
    dir: 'fundamentals/command',
    entry: 'index.js',
    imports: ['createCommands', 'createPalette'],
  },
  {
    // The full palette: the registry, the palette state and the dialog components.
    id: '@pyreon/command::full-palette',
    pkg: '@pyreon/command',
    dir: 'fundamentals/command',
    entry: 'components.js',
    imports: ['CommandPalette'],
  },
  {
    // Navigation commands from a route table: its own entry, no dependency, nothing of the palette.
    id: '@pyreon/command::router',
    pkg: '@pyreon/command',
    dir: 'fundamentals/command',
    entry: 'router.js',
    imports: ['routeCommands'],
  },
  {
    // The pure core of the calendar: event expansion, the month lanes and the time-grid packing. No DOM, no @pyreon/core.
    id: '@pyreon/calendar::core',
    pkg: '@pyreon/calendar',
    dir: 'fundamentals/calendar',
    entry: 'core.js',
    imports: ['expandOccurrences', 'layoutMonth', 'layoutDay'],
  },
  {
    // The reactive calendar without a view: the state, the view models and the keyboard.
    id: '@pyreon/calendar::calendar-state',
    pkg: '@pyreon/calendar',
    dir: 'fundamentals/calendar',
    entry: 'index.js',
    imports: ['createCalendar'],
  },
  {
    // The month view alone (the grid, the lanes, the keyboard): no time grid.
    id: '@pyreon/calendar::month-view',
    pkg: '@pyreon/calendar',
    dir: 'fundamentals/calendar',
    entry: 'components.js',
    imports: ['MonthView'],
  },
  {
    // The week and day time grid alone.
    id: '@pyreon/calendar::week-view',
    pkg: '@pyreon/calendar',
    dir: 'fundamentals/calendar',
    entry: 'components.js',
    imports: ['WeekView'],
  },
  {
    // The whole calendar component: toolbar, month and time grid.
    id: '@pyreon/calendar::full',
    pkg: '@pyreon/calendar',
    dir: 'fundamentals/calendar',
    entry: 'components.js',
    imports: ['Calendar'],
  },
  {
    // Date arithmetic on plain strings: parsing, the padded writer and the duration loader, and nothing of the zone code.
    // `add` must not drag `Intl.DateTimeFormat` handling in; zone conversion is a separate import.
    id: '@pyreon/time::add',
    pkg: '@pyreon/time',
    dir: 'fundamentals/time',
    entry: 'core.js',
    imports: ['add'],
  },
  {
    // The typical set a calendar or scheduler writes: arithmetic, truncation, a grid and one zone conversion.
    id: '@pyreon/time::typical',
    pkg: '@pyreon/time',
    dir: 'fundamentals/time',
    entry: 'core.js',
    imports: ['add', 'diff', 'startOf', 'monthGrid', 'toInstant'],
  },
  {
    // The value-last entry is a thin wrapper: one fp function must cost core's function plus a closure, and must not pull the
    // other fp functions.
    id: '@pyreon/time::fp-add',
    pkg: '@pyreon/time',
    dir: 'fundamentals/time',
    entry: 'fp.js',
    imports: ['add'],
  },
  {
    // A typical pipeline: adjusters composed with pipe.
    id: '@pyreon/time::fp-pipeline',
    pkg: '@pyreon/time',
    dir: 'fundamentals/time',
    entry: 'fp.js',
    imports: ['add', 'startOf', 'pipe', 'isBetween'],
  },
  {
    // Exact money arithmetic on plain data: parsing, the canonical writer and one fast-path add and multiply. Rounding is one
    // bigint routine shared by every function, so this is the floor of the package.
    id: '@pyreon/money::add-multiply',
    pkg: '@pyreon/money',
    dir: 'fundamentals/money',
    entry: 'index.js',
    imports: ['money', 'add', 'multiply'],
  },
  {
    // Allocation adds the largest-remainder loop and the ratio reader on top of the floor.
    id: '@pyreon/money::allocate',
    pkg: '@pyreon/money',
    dir: 'fundamentals/money',
    entry: 'index.js',
    imports: ['money', 'allocate'],
  },
  {
    // The decimal entry alone: strings in, strings out, no currency table.
    id: '@pyreon/money::decimal',
    pkg: '@pyreon/money',
    dir: 'fundamentals/money',
    entry: 'decimal.js',
    imports: ['add', 'multiply', 'divide', 'round'],
  },
  {
    // The whole value layer: every function of the main entry.
    id: '@pyreon/money::everything',
    pkg: '@pyreon/money',
    dir: 'fundamentals/money',
    entry: 'index.js',
    imports: [
      'money',
      'fromMinor',
      'toMinor',
      'isMoney',
      'zero',
      'add',
      'subtract',
      'negate',
      'abs',
      'sum',
      'multiply',
      'divide',
      'allocate',
      'split',
      'percentage',
      'ratio',
      'compare',
      'equals',
      'min',
      'max',
      'isZero',
      'isPositive',
      'isNegative',
      'round',
      'convert',
      'defineCurrency',
      'currencyDigits',
      'isCurrency',
    ],
  },
  {
    // Recurrence only: expansion and the next occurrence. Business time, intervals, RRULE text and descriptions are separate imports and
    // must not come along (the exports are tree-shakeable: the `guard` wrapper is marked pure).
    id: '@pyreon/schedule::recurrence',
    pkg: '@pyreon/schedule',
    dir: 'fundamentals/schedule',
    entry: 'core.js',
    imports: ['occurrencesBetween', 'nextOccurrence'],
  },
  {
    // Business days only: weekends and holidays, no recurrence and no interval code.
    id: '@pyreon/schedule::business-days',
    pkg: '@pyreon/schedule',
    dir: 'fundamentals/schedule',
    entry: 'core.js',
    imports: ['isBusinessDay', 'addBusinessDays'],
  },
  {
    // Intervals only: overlap, merge, subtract; nothing of the calendar or the rule code.
    id: '@pyreon/schedule::intervals',
    pkg: '@pyreon/schedule',
    dir: 'fundamentals/schedule',
    entry: 'core.js',
    imports: ['overlaps', 'mergeIntervals', 'subtractIntervals'],
  },
  {
    // Free slots: intervals plus the opening-hours code, but no recurrence.
    id: '@pyreon/schedule::free-slots',
    pkg: '@pyreon/schedule',
    dir: 'fundamentals/schedule',
    entry: 'core.js',
    imports: ['freeSlots'],
  },
  {
    // RFC 5545 text: the reader and the writer.
    id: '@pyreon/schedule::rrule-text',
    pkg: '@pyreon/schedule',
    dir: 'fundamentals/schedule',
    entry: 'core.js',
    imports: ['parseRRule', 'toRRule'],
  },
  {
    // The whole value layer: every function of the core entry.
    id: '@pyreon/schedule::everything',
    pkg: '@pyreon/schedule',
    dir: 'fundamentals/schedule',
    entry: 'core.js',
    imports: [
      'occurrences',
      'occurrencesBetween',
      'nextOccurrence',
      'previousOccurrence',
      'occursOn',
      'toInstants',
      'parseRRule',
      'tryParseRRule',
      'toRRule',
      'describeRule',
      'isBusinessDay',
      'addBusinessDays',
      'businessDaysBetween',
      'nextBusinessDay',
      'previousBusinessDay',
      'addBusinessTime',
      'businessTimeBetween',
      'isOpen',
      'nextOpening',
      'nextClosing',
      'overlaps',
      'intersection',
      'mergeIntervals',
      'subtractIntervals',
      'freeSlots',
      'expandEvents',
    ],
  },
  {
    // The ambient clock hook alone: the shared ticker machinery, without the locale and zone context.
    id: '@pyreon/ambient::useNow',
    pkg: '@pyreon/ambient',
    dir: 'fundamentals/ambient',
    imports: ['useNow'],
  },
  {
    // The reactive time entry with one clock hook: the hook, the ambient clock it sits on, and the date math it needs.
    id: '@pyreon/time::reactive-useRelative',
    pkg: '@pyreon/time',
    dir: 'fundamentals/time',
    imports: ['useRelative'],
  },
  {
    // The queue alone: validation, scheduling, retry, progress coalescing. No transport, no picker, no drop zone.
    id: '@pyreon/upload::uploader',
    pkg: '@pyreon/upload',
    dir: 'fundamentals/upload',
    entry: 'index.js',
    imports: ['createUploader'],
  },
  {
    // Validation without the queue: the `core` entry has no @pyreon dependency at all.
    id: '@pyreon/upload::validate',
    pkg: '@pyreon/upload',
    dir: 'fundamentals/upload',
    entry: 'core.js',
    imports: ['validateFile', 'sniffType'],
  },
  {
    // The XHR transport is its own entry: it must not pull the queue, the picker or the drop zone.
    id: '@pyreon/upload::xhr-transport',
    pkg: '@pyreon/upload',
    dir: 'fundamentals/upload',
    entry: 'transport-xhr.js',
    imports: ['xhrTransport'],
  },
  {
    // The picker and drop-zone state: no queue, no transport.
    id: '@pyreon/upload::picker-drop',
    pkg: '@pyreon/upload',
    dir: 'fundamentals/upload',
    entry: 'index.js',
    imports: ['useFilePicker', 'useFileDrop'],
  },
  {
    // The chunked transport is its own entry: it pulls the shared XHR part helper and chunk planning, no queue and no other transport.
    id: '@pyreon/upload::chunked-transport',
    pkg: '@pyreon/upload',
    dir: 'fundamentals/upload',
    entry: 'transport-chunked.js',
    imports: ['chunkedTransport'],
  },
  {
    // The S3 transport: presigned single and multipart, no SDK, no other transport.
    id: '@pyreon/upload::s3-transport',
    pkg: '@pyreon/upload',
    dir: 'fundamentals/upload',
    entry: 'transport-s3.js',
    imports: ['s3Transport'],
  },
  {
    // The tus transport: the tus 1.0 protocol, no other transport.
    id: '@pyreon/upload::tus-transport',
    pkg: '@pyreon/upload',
    dir: 'fundamentals/upload',
    entry: 'transport-tus.js',
    imports: ['tusTransport'],
  },
  {
    // The two headless components with their shared intake (validation, drop and picker state): no queue, no transport.
    id: '@pyreon/upload::components',
    pkg: '@pyreon/upload',
    dir: 'fundamentals/upload',
    entry: 'components.js',
    imports: ['FileDrop', 'FilePicker'],
  },
  {
    // The form adapter: reads a field's public state, needs no queue code of its own.
    id: '@pyreon/upload::form',
    pkg: '@pyreon/upload',
    dir: 'fundamentals/upload',
    entry: 'form.js',
    imports: ['bindFileField', 'fileValidator'],
  },
  {
    // The query adapter is a few lines over the uploader contract.
    id: '@pyreon/upload::query',
    pkg: '@pyreon/upload',
    dir: 'fundamentals/upload',
    entry: 'query.js',
    imports: ['uploadMutation'],
  },
  {
    // Locks the import-chosen drag preview: a plain draggable must not carry
    // pdnd's preview utilities (`setCustomNativeDragPreview` + offset presets),
    // which `dragPreview()` brings in only when used.
    id: '@pyreon/dnd::useDraggable',
    pkg: '@pyreon/dnd',
    dir: 'fundamentals/dnd',
    imports: ['useDraggable'],
  },
  {
    // Locks the `mini` entry WITHOUT the runtime JIT (~3.5 KB gz): the JIT is
    // installed by the main entry or `enableJit()` from `@pyreon/validate/jit`,
    // never reached from `mini`. A static `./jit` import in `core/schema.ts`
    // puts it back into every `mini` bundle.
    id: '@pyreon/validate::mini',
    pkg: '@pyreon/validate',
    dir: 'fundamentals/validate',
    entry: 'mini.js',
    imports: ['object', 'string', 'number', 'boolean', 'email', 'minLength', 'minValue', 'integer'],
  },
  {
    id: '@pyreon/core::jsx',
    pkg: '@pyreon/core',
    dir: 'core/core',
    imports: ['h', 'Fragment', 'createContext', 'useContext'],
  },
  {
    // @pyreon/hooks is a 36-hook grab-bag, and essentially every consumer
    // imports one to three of them — so the KITCHEN-SINK budget (which the
    // main-entry gate locks) is not the number that reaches a real app. The
    // meaningful property is that one hook costs one hook. Locked here
    // because nothing measured it before: `sideEffects: false` made
    // tree-shaking an ASSUMPTION, and the web halves of the lowered native
    // hooks (useAuth/usePush/usePayments) are exactly the shape that breaks
    // it — a top-level registry write or a shared eager singleton would pin
    // all three into every `useEventListener` import without moving the
    // main-entry budget at all.
    id: '@pyreon/hooks::useEventListener',
    pkg: '@pyreon/hooks',
    dir: 'fundamentals/hooks',
    imports: ['useEventListener'],
  },
  {
    // The native-lowered hook's own web half, isolated: locks that it does
    // not drag its two siblings (or the rest of the barrel) in with it.
    id: '@pyreon/hooks::useAuth',
    pkg: '@pyreon/hooks',
    dir: 'fundamentals/hooks',
    imports: ['useAuth'],
  },
  {
    // reportWebVitals must stay a small standalone subpath: the observer
    // logic only, nothing from zero's main entry or server modules.
    id: '@pyreon/zero::web-vitals',
    pkg: '@pyreon/zero',
    dir: 'zero/zero',
    entry: 'web-vitals.js',
    imports: ['reportWebVitals'],
  },
  {
    id: '@pyreon/charts::plot-minimal',
    pkg: '@pyreon/charts',
    dir: 'fundamentals/charts',
    entry: 'engine.js',
    // A bar+line chart must not pull the radial/finance/matrix families
    // or the SVG serializer — marks are imported bindings by design.
    imports: ['PlotChart', 'bars', 'line'],
  },
  {
    id: '@pyreon/charts::plot-svg',
    pkg: '@pyreon/charts',
    dir: 'fundamentals/charts',
    entry: 'svg.js',
    // The server-side serializer must not drag components or the canvas
    // host (ResizeObserver/rAF) into a node bundle.
    imports: ['chartToSvg'],
  },
  {
    id: '@pyreon/flow::core',
    pkg: '@pyreon/flow',
    dir: 'fundamentals/flow',
    // A flow that never calls `layout()` must not pull the 932-line
    // layout engine: `layout.ts` code-splits it behind a dynamic import, and
    // this is the lock that the split stays a split.
    imports: ['createFlow', 'Flow', 'Background', 'Controls', 'MiniMap'],
  },
  {
    id: '@pyreon/charts::chart-pie',
    pkg: '@pyreon/charts',
    dir: 'fundamentals/charts',
    // A pie through the main entry, <Chart> + <Arc>: must not pull the
    // funnel, heatmap or candlestick hosts, nor the zoom and toolbox code.
    imports: ['Chart', 'Arc'],
  },
  {
    id: '@pyreon/charts::chart-map',
    pkg: '@pyreon/charts',
    dir: 'fundamentals/charts',
    // A choropleth through the main entry: the map family is a host of its own, so its size is locked on its own and
    // a chart that is NOT a map must never pay for it (see plot-treeshake).
    imports: ['MapChart'],
  },
  {
    id: '@pyreon/charts-maps::world-110m',
    pkg: '@pyreon/charts-maps',
    dir: 'fundamentals/charts-maps',
    entry: 'world-110m.js',
    // One data module, one lazy file: importing it must cost about its own data and nothing else.
    imports: ['data'],
  },
  {
    id: '@pyreon/charts-maps::us-states',
    pkg: '@pyreon/charts-maps',
    dir: 'fundamentals/charts-maps',
    entry: 'us-states.js',
    imports: ['data'],
  },
  {
    id: '@pyreon/charts::chart-line',
    pkg: '@pyreon/charts',
    dir: 'fundamentals/charts',
    // The recommended first chart from the main entry: <Chart> + <Line>.
    // Must not pull the family hosts (pie/funnel/heatmap/candlestick) — each
    // family mark carries its own host, so an unused mark leaves its
    // renderer unreferenced — nor the ECharts wrapper.
    imports: ['Chart', 'Line'],
  },
  {
    id: '@pyreon/format::core-formatNumber',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'core.js',
    // One number formatter from the pure entry must not pull the date, duration,
    // list, parse or defineFormats code: every function is individually shakeable.
    imports: ['formatNumber'],
  },
  {
    id: '@pyreon/format::core-formatBytes',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'core.js',
    imports: ['formatBytes'],
  },
  {
    id: '@pyreon/format::core-formatCurrency',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'core.js',
    imports: ['formatCurrency'],
  },
  {
    id: '@pyreon/format::core-formatDuration',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'core.js',
    imports: ['formatDuration'],
  },
  {
    id: '@pyreon/format::core-parseNumber',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'core.js',
    imports: ['parseNumber'],
  },
  {
    id: '@pyreon/format::core-parseDate',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'core.js',
    imports: ['parseDate'],
  },
  {
    id: '@pyreon/format::core-formatRelativeTo',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'core.js',
    // The calendar-aware relative words, with the zone arithmetic of the date-only rule.
    imports: ['formatRelativeTo'],
  },
  {
    id: '@pyreon/format::units-convert',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'units/core.js',
    // The conversion alone: the exact-rational table and `convert`, nothing of the formatters.
    imports: ['convert'],
  },
  {
    id: '@pyreon/format::units-formatUnit',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'units/core.js',
    // A converting unit formatter: the conversion, the measurement-system table and the unit formatter it wraps.
    imports: ['formatUnit', 'measurementSystem', 'preferredUnit'],
  },
  {
    id: '@pyreon/format::core-formatDate',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'core.js',
    imports: ['formatDate'],
  },
  {
    id: '@pyreon/format::core-all',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'core.js',
    // The whole pure entry: every formatter, both parsers, createFormatter, defineFormats.
    imports: [
      'createFormatter',
      'defineFormats',
      'formatBytes',
      'formatCompact',
      'formatCurrency',
      'formatDate',
      'formatDateRange',
      'formatDateTime',
      'formatDateToParts',
      'formatDuration',
      'formatList',
      'formatNumber',
      'formatNumberRange',
      'formatNumberToParts',
      'formatPercent',
      'formatRelative',
      'formatRelativeTo',
      'formatTime',
      'formatUnit',
      'parseDate',
      'parseNumber',
      'numberFormatter',
      'currencyFormatter',
      'percentFormatter',
      'compactFormatter',
      'unitFormatter',
      'bytesFormatter',
      'durationFormatter',
      'listFormatter',
      'dateFormatter',
      'timeFormatter',
      'dateTimeFormatter',
      'relativeFormatter',
    ],
  },
  {
    id: '@pyreon/format::useRelativeTime',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'index.js',
    // The self-updating relative label: the hook, the calendar words and the date-only rule; the ambient clock (@pyreon/ambient) is external, as every workspace dependency is in this method.
    imports: ['useRelativeTime'],
  },
  {
    id: '@pyreon/format::formatNumber',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    // The reactive entry with one formatter: the locale signal and context are
    // the only extras over the pure entry.
    imports: ['formatNumber'],
  },
  {
    id: '@pyreon/format::core-numberFormatter',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'core.js',
    // One reusable number formatter from the pure entry: the formatter machinery
    // (with / from / fallback / parts / range) plus the number kind, nothing else.
    imports: ['numberFormatter'],
  },
  {
    id: '@pyreon/format::core-currencyFormatter',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    entry: 'core.js',
    imports: ['currencyFormatter'],
  },
  {
    id: '@pyreon/format::currencyFormatter',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    // The reactive entry with one factory: the locale signal and context are the extras over core.
    imports: ['currencyFormatter'],
  },
  {
    id: '@pyreon/format::formatNumber-and-setLocale',
    pkg: '@pyreon/format',
    dir: 'fundamentals/format',
    imports: ['formatNumber', 'setLocale'],
  },
]
