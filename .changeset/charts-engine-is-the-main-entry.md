---
'@pyreon/charts': minor
---

**Breaking:** `@pyreon/charts` is now Pyreon's own chart engine, with `<Chart>` as the main component. The ECharts wrapper moves to `@pyreon/charts/echarts`.

| Before | After |
| --- | --- |
| `import { Chart, useChart } from '@pyreon/charts'` (ECharts) | `import { EChart, useChart } from '@pyreon/charts/echarts'` |
| `ChartProps`, `ChartTheme` (ECharts types) | `EChartProps`, `EChartTheme` from `@pyreon/charts/echarts` |
| `@pyreon/charts/manual`, `@pyreon/charts/vite` | `@pyreon/charts/echarts/manual`, `@pyreon/charts/echarts/vite` |
| `import { Plot, … } from '@pyreon/charts/plot'` | `import { Chart, … } from '@pyreon/charts'` (`Plot` is renamed `Chart`, `PlotProps` → `ChartProps`) |
| `OptionChart`, `optionToSvg` from `/plot` | `@pyreon/charts/option` |
| `chartToSvg` and the `*ToSvg` family from `/plot` | `@pyreon/charts/svg` |
| everything else from `/plot` (`PlotChart`, mark factories, layouts, hit tests) | `@pyreon/charts/engine` |

`@pyreon/charts/plot` is removed; there are no aliases. The main entry is a curated surface: `<Chart>` and its marks, the family components, formatters, theme and linking, plus the data types those take. `/engine` exports the rest and is outside the stability promise.

On native, the compiler treats the main entry, `/engine`, `/option` and `/svg` as the engine, and `<Chart>` desugars as `<Plot>` did. `/echarts` is the only web-only entry. The package's multiplatform tier moves from `web-only` to `shared`.
