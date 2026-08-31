# @pyreon/charts

Two charting engines, one package, one subpath each.

| Import | Engine | Use it when |
| --- | --- | --- |
| `@pyreon/charts` | Apache ECharts, bridged | You want ECharts' breadth — 20+ chart types, maps, sankey, candlestick — and you are on the web |
| `@pyreon/charts/plot` | Pyreon's own | You want a small, tree-shakeable chart, server-rendered SVG, or a path to native |

They are INDEPENDENT. Pulling a name from the default entry loads ECharts;
`/plot` never does.

`@pyreon/charts` wraps Apache ECharts in a Pyreon-native shape: `<Chart options={() => ({...})}>` reads signals inside the options function, and the chart's `setOption` is called whenever the tracked dependencies change. Zero ECharts bytes ship until a chart actually renders — the bridge inspects your config, detects which chart types + components are needed (BarChart, GridComponent, TooltipComponent, …), and dynamically imports only those. ECharts is ~300KB+ if you import it whole; a typical bar-with-tooltip chart loads ~35KB gzipped. Ships three entries: main (auto-detection), `/manual` (explicit `use(...)` for absolute tree-shake control), and `/vite` (a `chartsViteAlias()` helper for the recurring tslib bundler bug).

## `@pyreon/charts/plot` — Pyreon's own engine

No third-party engine. The geometry is pure TypeScript over plain data, and the
platform half is a short backend that walks a flat `DrawCmd[]` — which is what
makes it tree-shakeable, server-renderable, and the path to native rendering.

```tsx
import { PlotChart, bars, line } from '@pyreon/charts/plot'

<PlotChart
  data={() => sales()}
  x={(d) => d.month}
  marks={[bars((d) => d.revenue), line((d) => d.target)]}
  showLegend
  tooltip
  title="Monthly revenue"
  height={240}
/>
```

**A mark is an imported binding, not a string.** That is the whole
tree-shaking story: `bars` and `line` are functions your bundler can see you
using, so a bar chart never pulls the radial trigonometry, the LTTB
decimation, or the time scales. A string-keyed `type: 'bars'` could not be
dropped by any bundler, however the library was built.

Marks: `bars`, `line`, `area`, `points`, `stackedBars`, `groupedBars`.
Components: `PlotChart`, `PieChart` (donut via `innerRadius`), `GaugeChart`.

### Curves, annotations, bubbles, labels

```tsx
import { PlotChart, line, area, bubble, smooth, step } from '@pyreon/charts/plot'

<PlotChart
  data={readings}
  marks={[
    area((d) => d.value, { curve: smooth }),
    bubble((d) => d.price, (d) => d.volume),
  ]}
  annotations={[
    { y: 100, label: 'Target' },
    { yFrom: 40, yTo: 60 },       // a translucent band
  ]}
/>
```

A **curve** is an imported binding, like a mark — `smooth` (monotone cubic:
it never invents an extremum the data does not have, unlike the Catmull-Rom
family) or `step` (holds each value to the next datum — the honest shape for
prices). Under the hood a curve is a `(points) => points` densifier, which is
why it costs zero new backend work on any platform.

**Annotations** are dashed rules and translucent bands with optional labels,
placed by the same scale the axis is labelled with. **`bubble`** maps its r
channel by AREA, not radius — radius-proportional bubbles exaggerate the data.
**`bars(y, { showValues: true })`** labels each bar with its formatted value.

### Entrance animation

On by default: bars rise from the zero line, lines draw left to right, points
grow. Off automatically under `prefers-reduced-motion`, and via
`animate={false}`. Only the FIRST paint animates — an update should read as
the new truth, not a morph. The mechanism is `ChartSpec.progress`, a pure
engine parameter (0..1) the host tweens, so any backend animates by tweening
one number.

### Horizontal bars

```tsx
<PlotChart data={teams} x={(d) => d.name} marks={[bars((d) => d.headcount)]} horizontal />
```

Categories move to the Y axis and bars grow rightward — and the left gutter
sizes itself from the widest CATEGORY label, because long category names are
the reason horizontal bars exist. The value axis keeps your `format`. Bar
marks only: a horizontal line or scatter is a transposed coordinate system,
not a flipped bar chart, so non-bar marks are skipped rather than drawn
misleadingly.

### Heatmap

```tsx
import { HeatmapChart } from '@pyreon/charts/plot'

<HeatmapChart
  data={events}
  x={(d) => d.day}
  y={(d) => d.hour}
  value={(d) => d.count}
/>
```

Two categorical axes, a value per cell, color as the third channel. Category
order is FIRST-SEEN — weekday names and funnel stages carry an order that
alphabetical sorting would destroy. Duplicate `(x, y)` observations SUM.
Absent cells are not drawn: absence and zero are different facts, and
painting absence as the coldest color would conflate them. The ramp is
plain `#rrggbb` stops (`colors={['#eff6ff', '#1e40af']}`), interpolated by
hand-rolled math so the same code lowers to native.

### Candlestick

```tsx
<CandlestickChart
  data={bars}
  open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c}
  x={(d) => d.day}
/>
```

Direction by color, close vs open — up green, down red by default, both
overridable. A doji (open == close) keeps a 1px body: flat trading is a fact,
and a missing candle reads as missing data. The wick draws first so the body
sits over it. The geometry (`renderCandles`, `ohlcExtent`) is exported
standalone.

### Formatting

```tsx
import { PlotChart, bars, compact, currency } from '@pyreon/charts/plot'

<PlotChart data={rows} marks={[bars((d) => d.revenue)]} format={currency('$')} />
```

One `format` covers the y-axis ticks, the tooltip values and the spoken
description. One rather than one per surface, because an axis reading `$3.2K`
beside a tooltip reading `3204.55` for the same point reads as a bug. Ships
`plain` (the default) and `compact` as formatters, and `currency(symbol)`,
`percent()` and `fixed(places)` as factories that return one; any
`(v: number) => string` works.

The formatters are hand-rolled rather than `Intl.NumberFormat`, because this
layer has to compile through PMTC — which lowers your source, not the browser's
built-ins. Pass your own `Intl`-backed formatter on the web when you want full
locale support.

### Time and continuous axes

```tsx
<PlotChart
  data={readings}
  marks={[line((d) => d.value)]}
  xValue={(d) => d.at}      // epoch ms, or any number
  xTime                      // label with calendar steps
/>
```

Without `xValue` the points are spaced evenly by index. That is right for a
categorical axis and **wrong for an irregular series**: readings on Jan 1, Jan 2
and Mar 1 drawn at even thirds claim the first gap equals the second, which is
the chart stating something false about the data. `xValue` places each point by
its own value and derives the domain from them.

`xTime` picks the tick labels from calendar units — a day of data ticks hourly,
a year of it monthly — because the nice-number ladder that labels a numeric axis
produces steps like 20,000ms that nobody reads. `xFormat` overrides either.

Bars stay categorical: bars on a continuous axis need a width in domain units,
which is a different chart.

### Server-rendered SVG

The same command list renders to a string, with no DOM and no canvas:

```ts
import { chartToSvg, bars } from '@pyreon/charts/plot'

const svg = chartToSvg({
  data: rows,
  marks: [bars((d) => d.revenue)],
  x: (d) => d.month,
  title: 'Monthly revenue',
})
```

Works in an SSG build, a serverless function, or an email pipeline. The output
is deterministic — coordinates are rounded and negative zero normalised — so an
SVG snapshot is an assertion about geometry rather than a pixel flake. Text
width comes from an estimate (`measureApprox`), because a server has no font
metrics; pass `canvasMeasure(ctx, font)` in a browser when label widths must be
exact.

### Accessibility

Both the canvas components and the SVG output present as ONE `role="img"`
graphic rather than a tree of several hundred shapes — naming the individual
rects would make a screen reader read out the whole drawing. Give it a `title`;
the long description is derived from your data via `describeChart` unless you
write your own. `chartTable` returns the same data as rows, for a visually
hidden table beside the chart.

## Install

```bash
bun add @pyreon/charts echarts @pyreon/core @pyreon/reactivity
```

`echarts` is a peer dep (`>=5.6.0`). **You must add the [tslib alias](#bundler-fix-tslib-alias) to your `vite.config.ts`** or the page throws on ECharts load. The same alias is needed for browser tests; see `vitest.browser.ts` / `tslibBrowserAlias()` in `@pyreon/test-utils` for the test-side variant.

## Quick start

```tsx
import { Chart } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

function RevenueChart() {
  const revenue = signal([120, 200, 150, 80, 70, 110, 130])

  return (
    <Chart
      options={() => ({
        xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'] },
        yAxis: { type: 'value' },
        tooltip: { trigger: 'axis' },
        series: [{ type: 'bar', data: revenue() }],
      })}
      style="height: 400px"
    />
  )
}
```

Signal changes → chart updates automatically. No manual `setOption`, no manual resize handler.

## How it works

1. You write a config with `type: 'bar'` somewhere in series.
2. The bridge detects the chart type + components needed (BarChart + GridComponent + TooltipComponent + CanvasRenderer).
3. Dynamically imports only those ECharts modules.
4. Creates the chart instance with the chosen renderer.
5. Wires a reactive effect — when signals in your options function change, `setOption()` runs.
6. `ResizeObserver` auto-resizes on container changes.
7. On unmount, the chart is disposed and the observer disconnected.

## `<Chart />`

Component shorthand wrapping `useChart` — pass a reactive options function, get a rendered chart.

```tsx
<Chart
  options={() => ({
    series: [{ type: 'pie', data: segments() }],
    legend: {},
  })}
  theme="dark"
  renderer="canvas"
  style="height: 300px"
  class="my-chart"
  onClick={(params) => console.log(params)}
/>
```

| Prop           | Type                          | Description                                        |
| -------------- | ----------------------------- | -------------------------------------------------- |
| `options`      | `() => EChartsOption`         | Reactive config function — signal reads track here |
| `theme?`       | `string \| object`            | ECharts theme                                      |
| `renderer?`    | `'canvas' \| 'svg'`           | Default: `'canvas'`                                |
| `locale?`      | `string`                      | ECharts locale                                     |
| `notMerge?`    | `boolean`                     | Replace options instead of merging (default false) |
| `replaceMerge?`| `string \| string[]`          | Component types to REPLACE (not merge) per update  |
| `lazyUpdate?`  | `boolean`                     | Batch updates (default `true`)                     |
| `onInit?`      | `(instance: ECharts) => void` | Called once when chart is created                  |
| `showLoading?` | `boolean`                     | Reactive — toggles ECharts' loading overlay        |
| `loadingOption?`| `Record<string, unknown>`    | Options for the loading overlay                    |
| `style?`       | `string`                      | CSS for the container                              |
| `class?`       | `string`                      | CSS class                                          |
| `ariaLabel?`   | `string`                      | Text alternative → `role="img"` + `aria-label`     |
| `onEvents?`    | `Record<string, (params, instance) => void>` | **Any** ECharts event, keyed by name  |
| `onClick?`     | `(params, instance) => void`  | Shorthand for `onEvents.click`                     |
| `onMouseover?` | `(params, instance) => void`  | Shorthand for `onEvents.mouseover`                 |
| `onMouseout?`  | `(params, instance) => void`  | Shorthand for `onEvents.mouseout`                  |

### Events — `onEvents`

`onClick`/`onMouseover`/`onMouseout` are shorthands. For **any** ECharts event
(`legendselectchanged`, `datazoom`, `brushselected`, `finished`, …), use the
general `onEvents` map — each handler receives `(params, instance)`. Binding is
leak-safe: changing a handler removes the old listener and binds the new one
(no pile-up), and all listeners are removed on unmount.

```tsx
<Chart
  options={() => ({ legend: {}, series: [{ type: 'pie', data: segments() }] })}
  onEvents={{
    legendselectchanged: (p) => console.log('toggled', p.name),
    datazoom: (_p, instance) => syncOtherChart(instance.getOption()),
  }}
  style="height: 300px"
/>
```

### Loading overlay — `showLoading`

Reactive toggle of ECharts' built-in loading spinner (distinct from
`useChart`'s `loading` signal, which tracks lazy MODULE loading before the
instance exists):

```tsx
<Chart options={() => data.chartOption()} showLoading={data.isFetching()} />
```

## `useChart(() => options, config?)`

Programmatic core hook — use when you need direct access to the ECharts instance, custom container wiring, or a `loading` signal.

```tsx
const chart = useChart(() => ({
  xAxis: { data: months() },
  series: [{ type: 'line', data: values(), smooth: true }],
}))

return <div ref={chart.ref} style="height: 400px" />
```

Returns `UseChartResult`:

| Property   | Type                                | Description                                          |
| ---------- | ----------------------------------- | ---------------------------------------------------- |
| `ref`      | `(el: HTMLElement \| null) => void` | Bind to a container `<div>`                          |
| `instance` | `Signal<ECharts \| null>`           | ECharts instance, `null` until modules load          |
| `loading`  | `Signal<boolean>`                   | True while dynamic imports are in flight             |
| `error`    | `Signal<Error \| null>`             | Captures option-function throws + ECharts init fails |
| `resize`   | `() => void`                        | Manually trigger resize                              |

Strict typing per chart-type set via the generic param:

```ts
import type { ComposeOption, BarSeriesOption, LineSeriesOption } from '@pyreon/charts'
type MyChartOption = ComposeOption<BarSeriesOption | LineSeriesOption>

const chart = useChart<MyChartOption>(() => ({
  series: [{ type: 'bar', data: revenue() }], // pie/scatter/etc. would be a TS error
}))
```

## Manual registration — `@pyreon/charts/manual`

For absolute bundle control. Explicitly register the modules you need; the bundler eliminates the rest. No dynamic imports, no `loading` flicker on first render.

```tsx
import { useChart, Chart, use } from '@pyreon/charts/manual'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use(BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer)

;<Chart
  options={() => ({
    series: [{ type: 'bar', data: values() }],
  })}
  style="height: 400px"
/>
```

Same API as the main entry — `Chart`, `useChart`, types — plus `use(...)` for registration.

## Bundler fix — tslib alias

ECharts imports `tslib` for TypeScript helpers (`__extends`, `__assign`, etc.). tslib's `package.json` `exports` map points the `import` condition at `./modules/index.js`, which destructures helpers from a `__toESM(require_tslib())` default — but the helpers live as top-level `var`s on the CJS factory, NOT as properties of `module.exports.default`. The destructure reads `undefined` and the page throws:

```text
TypeError: Cannot destructure property '__extends' of '__toESM(...).default' as it is undefined
```

(Upstream: [microsoft/tslib#189](https://github.com/microsoft/tslib/issues/189).)

**Fix via `@pyreon/charts/vite`:**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { chartsViteAlias } from '@pyreon/charts/vite'

export default defineConfig({
  resolve: {
    alias: { ...chartsViteAlias() },
  },
})
```

`chartsViteAlias()` resolves `tslib.es6.js` (the flat ESM module with proper named exports) via echarts itself, falls back to walking up `node_modules`, and returns `{}` if tslib can't be located — apps that don't use `@pyreon/charts` aren't broken by the alias call.

**For browser tests** (`vitest.browser.ts`), use `tslibBrowserAlias(import.meta.url)` from `@pyreon/test-utils`. The two helpers exist because Vite config runs under Node's `node` condition (needs the package's `lib/vite.js` build artifact), while vitest browser configs run inside the runner's bundler context (can reach the repo-root `vitest.browser.ts` directly).

## Supported chart types

bar, line, pie, scatter, radar, heatmap, treemap, sunburst, sankey, funnel, gauge, graph, tree, boxplot, candlestick, parallel, themeRiver, effectScatter, lines, pictorialBar, custom, map.

## Supported components

tooltip, legend, title, toolbox, dataZoom, visualMap, timeline, graphic, brush, calendar, dataset, aria, grid (also implied by `xAxis`/`yAxis`), polar, radar, geo.

## Bundle size (rough)

| Usage                      | ECharts loaded                                                 | Approx gzipped |
| -------------------------- | -------------------------------------------------------------- | -------------- |
| No charts rendered         | Nothing                                                        | 0 KB           |
| Bar + tooltip              | core + BarChart + Grid + Tooltip + Canvas                      | ~35 KB         |
| Bar + Line + legend        | core + BarChart + LineChart + Grid + Legend + Tooltip + Canvas | ~42 KB         |
| Pie only                   | core + PieChart + Canvas                                       | ~25 KB         |
| `@pyreon/charts` bridge     | Module map + hook                                              | ~3 KB          |

## Why Canvas by default

Canvas renders the whole chart as one `<canvas>` element. SVG creates hundreds of DOM nodes for complex charts. Canvas wins for: many data points, frequent signal-driven updates, animations, memory. Use `renderer: 'svg'` only when you need CSS styling on individual chart elements or PDF export.

## Gotchas

- **The tslib alias is mandatory** when consuming `@pyreon/charts` from a Vite app. Without it the page throws the moment any chart loads. Use `chartsViteAlias()` from `@pyreon/charts/vite`.
- **Options must be a function** `() => ({...})`. Signal reads inside the function track for `setOption` updates. A plain object captures values once and never updates.
- **`loading` is `true` until the first chart renders** — show a placeholder, or accept a brief blank container. The manual entry skips this since modules are registered up-front.
- **Option-function throws are captured into `error`** — they do NOT crash the component. Read `chart.error()` to surface them.
- **`onUnmount` disposes the chart + observer** — no manual cleanup needed. Storing `chart.instance()` elsewhere and using it after unmount throws.
- **Reactive theme: pass an ACCESSOR** — `theme: () => (dark() ? 'dark' : null)` (or `<Chart theme={() => …}>`). A flip disposes + re-inits the instance with the current option, group, and events preserved (ECharts has no in-place theme swap — dispose+re-init IS the mechanism, same as vue-echarts). A plain string/object theme stays static (applied once at init), and a same-value re-run never swaps.
- **`getCore()` / `connect()` are exported** — `const core = await getCore()` unlocks `core.registerMap(...)` (REQUIRED before any `map` series renders), `core.registerTheme(...)`, `core.getInstanceByDom(...)`. Linked charts: set `group: 'dashboard'` in config on each chart + `connect('dashboard')`.
- **`initOptions` passes anything to `core.init`** (`useDirtyRect`, `useCoarsePointer`, `pointerSize`, …); reactive updates accept the full `SetOptionOpts` (incl. `silent`, `transition`).
- **`autoresize`** defaults to `true` (ResizeObserver). Opt out with `autoresize: false`, or throttle resize storms with `autoresize: { throttle: 100 }`.
- **Warm mounts are synchronous.** Once the needed ECharts modules are cached (2nd..Nth chart with the same chart types), the instance is created in the same task — no wrapper-imposed microtask delay, no blank-frame flicker.
- **Merge vs replace on update.** Reactive updates `setOption(merge)` by default — a signal change that REMOVES a series/point leaves the old one merged. Pass `notMerge` (replace everything) or `replaceMerge="series"` (replace just the named components) when your data shrinks.

## Performance — wrapper overhead vs echarts-for-react

Both `@pyreon/charts` and [`echarts-for-react`](https://github.com/hustcc/echarts-for-react) wrap the same ECharts engine, so the only thing that differs is the **wrapper's own JS work** around it. Measured with an identical stubbed engine (so per-call ECharts cost is byte-identical and near-zero — isolating the wrapper), real React 19 + real `echarts-for-react` vs the real `<Chart>` + `useChart`:

| Phase | `@pyreon/charts` | `echarts-for-react` | verdict |
| --- | --- | --- | --- |
| **Reactive update** (per data change) | ~0.2µs | ~1.9µs | **~9.4× faster** |
| Dispose | ~16µs | ~37µs | **~2.3× faster** |
| Mount → ready | ~97µs | ~84µs | 🤝 **CI95-overlap tie** |

Protocol: per-impl **process isolation** (fresh `bun` child per impl ×3, pooled samples — impls never share a heap/JIT/order bias, the store-bench lesson) + bootstrap CI95 with 🤝 tie detection. The update win is the fine-grained-reactivity story: a signal change re-runs one effect that calls `setOption` — no component re-render, no VDOM diff, no prop deep-compare. Mount is now a statistical **tie** — the earlier "~1.65× slower" was single-process order bias plus the pre-fast-path async loader (warm mounts have been synchronous since the cached-modules fast path landed). Reproduce: `bun run --filter=@pyreon/charts bench`. *Author-run micro-bench (Bun/JSC + happy-dom, stubbed engine) — magnitudes/ratios are the signal, not the last digit; it measures wrapper JS, not chart render speed (identical ECharts for both). A vue-echarts driver (the feature-leading competitor) is a tracked follow-up — beating the React wrapper is a scoped claim.*

## Multiplatform — `@pyreon/charts/webview`

`@pyreon/charts` is web-only (it wraps ECharts, a canvas engine that can't compile to SwiftUI/Compose). To ship charts on iOS/Android too, host the real engine inside a native `<WebView>` — the sanctioned Pyreon multiplatform mechanism, with a bidirectional data bridge.

```ts
import { buildChartHostHtml } from '@pyreon/charts/webview'

// A self-contained host page. Inline your BUNDLED echarts for an offline,
// App-Store-safe page; omit `echartsScript` for a dev/web CDN fallback.
const CHART_HOST = buildChartHostHtml({ echartsScript: BUNDLED_ECHARTS_UMD })
```

Use it with the `<WebView>` primitive (compiles to WKWebView / Android WebView / an `<iframe srcdoc>` on web — same bridge everywhere). The `data` you pass IS the ECharts `option`; on change it's pushed into the live page with no reload, and a tap posts back:

```tsx
import { WebView } from '@pyreon/primitives'

<WebView
  html={CHART_HOST}
  data={{ xAxis: { type: 'category', data: days() }, yAxis: {}, series: [{ type: 'bar', data: revenue() }] }}
  onMessage={(m) => selected.set(m)}   // native gets the tapped element as a JSON string
/>
```

- **Forward** — `data={option}` → `window.__pyreonData` + a `pyreondata` event → `chart.setOption(option, true)`, in place. Use a data-driven option (no embedded `formatter`/`renderItem` closures — they don't survive JSON encoding across the native bridge).
- **Reverse** — a chart tap → `window.pyreonPostMessage(json)` → your `onMessage`. The host resizes via `ResizeObserver` (rotation / late layout).
- **`<ChartWebView option onSelect>`** is the web-side ergonomic wrapper (it builds the host + emits `<WebView>` for you); on native, use `<WebView html={CHART_HOST} …>` directly (the component's body can't be PMTC-lowered — the host string + `<WebView>` can).

See `examples/native-viz` for a full one-source bar + line + pie + flow app across web/iOS/Android.

## Documentation

Full docs: [pyreon.dev/docs/charts](https://pyreon.dev/docs/charts) (or `docs/src/content/docs/charts.md` in this repo).

## License

MIT
