import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/charts',
  title: 'Reactive ECharts',
  tagline:
    'Reactive ECharts bridge with lazy loading, auto-detection, typed options',
  description:
    'Reactive ECharts bridge for Pyreon. Zero ECharts bytes in your bundle until a chart actually renders — chart types and components are auto-detected from your options and dynamically imported on demand. Signal-driven options reactively update the chart when tracked signals change. `useChart` is the low-level hook with full control; `<Chart />` is the declarative component with event binding. Both auto-resize via ResizeObserver and clean up on unmount.',
  category: 'browser',
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
  ],
  gotchas: [
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
