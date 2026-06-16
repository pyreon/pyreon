# @pyreon/charts

Reactive ECharts bridge — lazy module loading, signal-driven `setOption`, Canvas by default.

`@pyreon/charts` wraps Apache ECharts in a Pyreon-native shape: `<Chart options={() => ({...})}>` reads signals inside the options function, and the chart's `setOption` is called whenever the tracked dependencies change. Zero ECharts bytes ship until a chart actually renders — the bridge inspects your config, detects which chart types + components are needed (BarChart, GridComponent, TooltipComponent, …), and dynamically imports only those. ECharts is ~300KB+ if you import it whole; a typical bar-with-tooltip chart loads ~35KB gzipped. Ships three entries: main (auto-detection), `/manual` (explicit `use(...)` for absolute tree-shake control), and `/vite` (a `chartsViteAlias()` helper for the recurring tslib bundler bug).

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
| `lazyUpdate?`  | `boolean`                     | Batch updates (default `true`)                     |
| `onInit?`      | `(instance: ECharts) => void` | Called once when chart is created                  |
| `style?`       | `string`                      | CSS for the container                              |
| `class?`       | `string`                      | CSS class                                          |
| `onClick?`     | `(params) => void`            | Click event                                        |
| `onMouseover?` | `(params) => void`            | Mouseover                                          |
| `onMouseout?`  | `(params) => void`            | Mouseout                                           |

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

## Documentation

Full docs: [pyreon.dev/docs/charts](https://pyreon.dev/docs/charts) (or `docs/src/content/docs/charts.md` in this repo).

## License

MIT
