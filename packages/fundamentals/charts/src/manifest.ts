import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/charts',
  title: 'Two charting engines',
  tagline:
    "Reactive ECharts bridge, plus Pyreon's own tree-shakeable engine with canvas and SVG backends",
  description:
    "Two independent charting engines behind two subpaths. `@pyreon/charts/plot` is Pyreon's OWN: pure-TypeScript geometry over a flat draw list, marks as imported bindings so tree-shaking is structural, a canvas backend, and a PURE SVG backend that renders on a server. `@pyreon/charts` is the ECharts bridge: zero ECharts bytes in your bundle until a chart actually renders — chart types and components are auto-detected from your options and dynamically imported on demand. Signal-driven options reactively update the chart when tracked signals change. `useChart` is the low-level hook with full control; `<Chart />` is the declarative component with event binding. Both auto-resize via ResizeObserver and clean up on unmount.",
  category: 'browser',
  multiplatform: {
    tier: 'web-only',
    rationale:
      'wraps ECharts (browser canvas engine); consume on native via the `<WebView>` bridge subpath',
  },
  longExample: `import { Chart, useChart, type EChartsOption, type ComposeOption, type BarSeriesOption, type LineSeriesOption } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

const months = signal(['Jan', 'Feb', 'Mar', 'Apr'])
const revenue = signal([100, 200, 150, 300])

// Declarative component — simplest usage
<Chart
  options={() => ({
    xAxis: { type: 'category', data: months() },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: revenue() }],
    tooltip: { trigger: 'axis' },
  })}
  style="height: 400px"
  onClick={(params) => console.log('clicked:', params.name)}
/>

// useChart hook — full control over instance lifecycle
const MyChart = () => {
  const chart = useChart(() => ({
    xAxis: { type: 'category', data: months() },
    yAxis: { type: 'value' },
    series: [
      { type: 'bar', data: revenue() },
      { type: 'line', data: revenue().map((v) => v * 1.1) },
    ],
  }))

  return (
    <div>
      {chart.loading() ? 'Loading chart...' : null}
      <div ref={chart.ref} style="height: 400px" />
      <button onClick={() => chart.resize()}>Resize</button>
    </div>
  )
}

// Strict typed options — only bar + line allowed
type MyOption = ComposeOption<BarSeriesOption | LineSeriesOption>
const typedChart = useChart<MyOption>(() => ({
  series: [{ type: 'bar', data: [1, 2, 3] }],  // only 'bar' | 'line' autocomplete
}))

// Manual entry for tree-shaking control:
// import { useChart, Chart } from '@pyreon/charts/manual'
// — you register ECharts components yourself`,
  features: [
    'useChart<TOption>(optionsFn, config?) — low-level reactive hook with full lifecycle control',
    'Chart component with declarative options, event binding, and auto-resize',
    'onEvents map for ANY ECharts event (legendselectchanged, datazoom, brushselected, …), leak-safe binding',
    'showLoading — reactive toggle of the ECharts loading overlay',
    'Zero-byte lazy loading — chart types auto-detected and dynamically imported',
    'Generic TOption for strict typed options via ComposeOption<SeriesUnion>',
    '@pyreon/charts/manual entry for explicit tree-shaking control',
    'All ECharts option and series types re-exported for single-import convenience',
  ],
  api: [
    {
      name: 'useChart',
      kind: 'hook',
      signature:
        '<TOption extends EChartsOption = EChartsOption>(optionsFn: () => TOption, config?: UseChartConfig) => UseChartResult',
      summary:
        'Create a reactive ECharts instance. Options are passed as a function — signal reads inside are tracked and the chart updates automatically when any tracked signal changes. Lazy-loads the required ECharts modules on first render (zero bytes until mount). Returns `ref` (bind to a container div), `instance` (Signal<ECharts | null>), `loading` (Signal<boolean>), `error` (Signal<Error | null>), and `resize()`. Auto-resizes via ResizeObserver (`autoresize: false | { throttle }` to opt out/throttle) and disposes on unmount. `theme` accepts an accessor for reactive swaps; `initOptions` passes through to `core.init`; warm mounts (modules cached) are synchronous. `getCore()`/`connect()` are exported for `registerMap`/`registerTheme`/linked charts.',
      example: `const chart = useChart(() => ({
  xAxis: { type: 'category', data: months() },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: revenue() }],
}))

<div ref={chart.ref} style="height: 400px" />
// chart.loading() — true until ECharts modules loaded + chart initialized
// chart.instance() — raw ECharts instance for imperative API`,
      mistakes: [
        'Forgetting to set a height on the container div — ECharts requires explicit dimensions, it does not auto-size to content',
        'Passing options as a plain object instead of a function — signal reads are not tracked and the chart never updates',
        'Reading chart.instance() immediately after useChart — the instance is null until the async module load completes; check chart.loading() first',
        'Calling chart.resize() during SSR — useChart is browser-only; the hook no-ops safely on the server but resize is meaningless',
      ],
      seeAlso: ['Chart'],
    },
    {
      name: 'Chart',
      kind: 'component',
      signature: '(props: ChartProps) => VNodeChild',
      summary:
        'Declarative chart component that wraps `useChart` internally. Accepts `options` (reactive function), `style`/`class` for the container, and event handlers. `onEvents` binds ANY ECharts event by name (`legendselectchanged`, `datazoom`, `finished`, …), with `onClick`/`onMouseover`/`onMouseout` as shorthands — binding is leak-safe (handler changes swap listeners, all removed on unmount). `showLoading` reactively toggles the ECharts loading overlay. Renders a div with the chart — auto-resizes and cleans up on unmount. Simpler than useChart for most use cases.',
      example: `<Chart
  options={() => ({
    legend: {},
    series: [{ type: 'pie', data: [{ value: 60, name: 'A' }, { value: 40, name: 'B' }] }],
  })}
  style="height: 300px"
  showLoading={isFetching()}
  onEvents={{
    legendselectchanged: (p) => console.log('toggled', p.name),
    datazoom: (_p, instance) => syncOtherChart(instance.getOption()),
  }}
/>`,
      mistakes: [
        'Missing style height on the Chart component — same as useChart, ECharts requires explicit container dimensions',
        'Passing a static options object — wrap in `() => ({...})` so signal reads inside are tracked reactively',
        'Using onClick/onMouseover/onMouseout for a non-mouse event — those are only shorthands; reach for the general `onEvents` map (e.g. `onEvents={{ legendselectchanged: fn }}`) for any other ECharts event',
        'Passing `theme` as a plain VALUE and expecting runtime swaps — a value is applied once at init; pass an ACCESSOR (`theme: () => (dark() ? \'dark\' : null)`) and a flip disposes + re-inits with the option, group, and events preserved',
        'Relying on the default merge when data shrinks — a signal change that removes a series/point leaves the old one; pass `notMerge` or `replaceMerge="series"`',
      ],
      seeAlso: ['useChart'],
    },
    {
      name: 'PlotChart',
      kind: 'component',
      signature: '<T>(props: PlotChartProps<T>) => VNodeChild',
      summary:
        "Pyreon's OWN charting engine, from the `@pyreon/charts/plot` subpath — no ECharts, no third-party engine. Marks are IMPORTED BINDINGS (`bars`, `line`, `area`, `points`, `stackedBars`, `groupedBars`), so tree-shaking is structural rather than a build flag: a bar chart never pulls the radial trigonometry, the decimation or the time scales. Geometry is pure TypeScript over plain data and the platform half is a short backend that walks a flat `DrawCmd[]`, which is why the same source is the path to native rendering. Renders to canvas with a device-pixel-ratio-correct surface; `showLegend`, `tooltip` and a title are opt-in props, and width falls back to the container's own so a chart in a flexible column fills it.",
      example: `import { PlotChart, bars, line } from '@pyreon/charts/plot'
import { signal } from '@pyreon/reactivity'

interface Row { month: string; revenue: number; target: number }
const sales = signal<Row[]>([{ month: 'Jan', revenue: 120, target: 100 }])

<PlotChart
  data={() => sales()}
  x={(d: Row) => d.month}
  marks={[bars((d: Row) => d.revenue), line((d: Row) => d.target)]}
  showLegend
  tooltip
  title="Monthly revenue"
  height={240}
/>`,
      mistakes: [
        'Importing from `@pyreon/charts` instead of `@pyreon/charts/plot` — the default entry is the ECharts bridge; the two engines are separate subpaths and mixing them pulls ECharts back into the bundle',
        'Passing `marks` as a string type name — a mark is an imported FUNCTION, which is exactly what makes the unused ones droppable; there is no string-keyed registry to tree-shake around',
        'Expecting two series to be told apart without a legend — colours come from a per-series palette, but `showLegend` is opt-in and a chart with neither legend nor tooltip is unlabelled',
        'Reaching for `tooltip` on a static chart in a report — it installs pointer handlers and a DOM overlay, which is why it is off by default',
        'Spacing an irregular time series by index — without `xValue` the points sit at even thirds whatever their timestamps, so the chart claims gaps that are not there; pass `xValue={(d) => d.at}` and `xTime` for calendar tick labels',
        'Leaving `format` unset on a money or percentage chart — the default prints the raw number, so a revenue axis reads `3200000`; `currency`, `percent`, `compact` and `fixed` ship in the same subpath and one `format` covers the axis, the tooltip and the spoken description at once',
      ],
      seeAlso: ['chartToSvg', 'PieChart'],
    },
    {
      name: 'chartToSvg',
      kind: 'function',
      signature: '<T>(options: ChartToSvgOptions<T>) => string',
      summary:
        'Render a chart to a standalone `<svg>` STRING. Pure — no DOM, no canvas, no measurement context — so it runs in an SSG build, a serverless function or an email pipeline, where a canvas surface does not exist. Output is deterministic (coordinates rounded to two decimals, negative zero normalised), which makes an SVG snapshot a real assertion about geometry rather than a pixel flake. Labels are XML-escaped. The `<svg>` is `role="img"` named by its `<title>`; given a title and no description, the long form is DERIVED from the data via `describeChart`. Text width comes from `measureApprox` by default — an honest estimate, since a server has no font metrics; pass `canvasMeasure(ctx, font)` in a browser when label widths must be exact.',
      example: `import { chartToSvg, bars } from '@pyreon/charts/plot'

interface Row { month: string; revenue: number }
const rows: Row[] = [{ month: 'Jan', revenue: 120 }]

const svg = chartToSvg({
  data: rows,
  marks: [bars((d: Row) => d.revenue)],
  x: (d: Row) => d.month,
  title: 'Monthly revenue',
})
// -> '<svg xmlns="..." role="img" aria-labelledby=...>...</svg>'`,
      mistakes: [
        'Expecting exact label widths on a server — `measureApprox` estimates from glyph counts; axis gutters have slack so a few percent moves nothing visible, but do not use it for tight text layout',
        'Passing a title and assuming that is enough for a screen reader — a graphic whose only accessible text is its name says a chart exists and nothing about what it shows; leave `description` unset to get the derived one, or write your own',
        'Rendering several charts into one page without changing `svg.idPrefix` — the `<title>`/`<desc>` ids collide and `aria-labelledby` resolves to the first one',
        'Reaching for it to get a PNG — it emits vector markup; rasterize with the canvas backend (`paint`) or a downstream converter',
      ],
      seeAlso: ['PlotChart'],
    },
    {
      name: 'PieChart',
      kind: 'component',
      signature: '(props: PieChartProps) => VNodeChild',
      summary:
        'Pie and donut from the same engine (`@pyreon/charts/plot`); `innerRadius` is what makes it a donut. `GaugeChart` is its sibling for a single value against a range. Both carry the same accessibility contract as `PlotChart` — a `role="img"` graphic with a derived description — rather than being a decorative canvas with no accessible text.',
      example: `import { PieChart, GaugeChart } from '@pyreon/charts/plot'
import { signal } from '@pyreon/reactivity'

interface Slice { name: string; amount: number }
const slices = signal<Slice[]>([{ name: 'Direct', amount: 40 }])
const cpu = signal(42)

<PieChart data={() => slices()} label={(d: Slice) => d.name} value={(d: Slice) => d.amount} innerRadius={0.6} />
<GaugeChart value={() => cpu()} min={0} max={100} title="CPU" />`,
      mistakes: [
        'Using a pie for more than a handful of slices — angular area is hard to compare; the engine will draw it, which is not the same as it reading well',
        'Omitting `label` and expecting a legend — the slice labels are what name the data',
      ],
      seeAlso: ['PlotChart'],
    },
  ],
  gotchas: [
    {
      label: 'Two engines, two subpaths',
      note: 'The package ships TWO independent engines. `@pyreon/charts` bridges ECharts — mature, enormous chart-type coverage, browser-only. `@pyreon/charts/plot` is Pyreon\'s own: pure-TypeScript geometry over a flat draw list, tree-shakeable by construction, with a canvas backend and a pure SVG backend that runs on a server. Import from ONE of them; pulling a name from the default entry drags ECharts back into a bundle that had dropped it.',
    },
    {
      label: 'tslib Vite alias',
      note: 'ECharts imports `tslib` whose ESM `./modules/index.js` entry destructures named helpers from a `__toESM(require_tslib())` default — the helpers live as top-level vars on the CJS factory, so the destructure reads `undefined` and the page throws `TypeError: Cannot destructure property "__extends"` the moment ECharts loads. Use `chartsViteAlias()` from `@pyreon/charts/vite` in your `vite.config.ts` (`resolve: { alias: { ...chartsViteAlias() } }`); it resolves `tslib` to the flat-ESM `tslib.es6.js` across install layouts. Browser tests use `tslibBrowserAlias()` from the shared test config. Tracking upstream: microsoft/tslib#189.',
    },
    'Options must be a FUNCTION `() => EChartsOption`, not a plain object. Signal reads inside the function are tracked — changing any tracked signal reactively updates the chart.',
    {
      label: 'Lazy loading',
      note: 'ECharts modules are auto-detected from your options (series types, components) and dynamically imported. First render has an async loading phase — check `loading()` or `<Chart>` handles it internally. Zero ECharts bytes in your initial bundle.',
    },
    {
      label: 'Manual entry',
      note: '`@pyreon/charts/manual` skips auto-detection — you register ECharts components yourself via `use()` for maximum tree-shaking control.',
    },
    {
      label: 'Events',
      note: '`onEvents` is the general handler map — any ECharts event by name (`legendselectchanged`, `datazoom`, `brushselected`, `finished`, …); each handler gets `(params, instance)`. `onClick`/`onMouseover`/`onMouseout` are shorthands merged in (they WIN on a key collision). Binding is leak-safe: a changed handler swaps the listener (no pile-up) and all are removed on unmount.',
    },
    {
      label: 'Theme is not reactive',
      note: 'Reactive theme: pass `theme` as an ACCESSOR (`() => (dark() ? \'dark\' : null)`) — a flip disposes + re-inits with the current option/group/events preserved (ECharts has no in-place swap; dispose+re-init is the mechanism, as in vue-echarts). A plain value stays static. For map charts, `await getCore()` then `core.registerMap(...)` BEFORE rendering a `map` series.',
    },
  ],
})
