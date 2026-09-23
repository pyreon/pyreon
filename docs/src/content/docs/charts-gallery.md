---
title: Chart Gallery
description: Live charts on Pyreon's own engine — idiomatic PlotChart examples and ECharts options pasted as-is, no ECharts in the bundle.
---

Every chart on this page is live: it runs on `@pyreon/charts/plot`, Pyreon's own
engine, in this page. The examples marked **ECharts option** are ordinary ECharts
option objects handed to `<OptionChart>` — they compile onto the same engine, so
they ship none of ECharts itself. Charts follow the page's scheme: the
`color-scheme` the page declares on `<html>` (this site sets it with its theme
toggle), else the OS preference. A bare option chart keeps ECharts' own light
look, exactly as ECharts does, so the option examples here sit in a
`<ChartThemeProvider mode={systemChartMode()}>`. Each example's source is one click away.

<PackageBadge name="@pyreon/charts" href="/docs/charts-plot" />

## A trend

An area under a smoothed line, its points and a dashed target. One `currency`
formatter feeds the axis, the tooltip and the accessible table at once.

<Example file="./examples/charts/gallery-trend" title="Revenue against target" />

## Stacked or grouped

The same three series, switched between a stack and side-by-side bars. The mark
list is reactive, so the switch repaints the same canvas.

<Example file="./examples/charts/gallery-bars" title="Orders by channel" />

## A ranking — ECharts option

A horizontal bar chart: a category y axis over a value x axis, laid out the way
ECharts lays it out, rows bottom-up.

<Example file="./examples/charts/gallery-horizontal" title="Horizontal bars from an ECharts option" />

## A donut — ECharts option

An inner radius, outside labels on leader lines, and a legend whose entries
toggle their slices.

<Example file="./examples/charts/gallery-donut" title="Donut from an ECharts option" />

## A radar — ECharts option

<Example file="./examples/charts/gallery-radar" title="Radar from an ECharts option" />

## Candlesticks — ECharts option

A 120-day price series opening on its latest 60 days through `dataZoom`'s
`start` / `end`; the day labels thin to what fits. (A candlestick draws the
opening window; the zoom slider and gestures are drawn on cartesian charts, not
yet on a candlestick.)

<Example file="./examples/charts/gallery-candlestick" title="Candlesticks opening on the latest 60 days" />

## A heatmap — ECharts option

Activity by weekday and hour, coloured through a continuous `visualMap`.

<Example file="./examples/charts/gallery-heatmap" title="Heatmap with visualMap" />

## A gauge driven by a signal — ECharts option

The option is an accessor; writing the signal repaints the dial.

<Example file="./examples/charts/gallery-gauge" title="Gauge" />

## 100,000 points

Every point drawn, no decimation. "Regenerate" replaces all of them and reports
how long the redraw took on your machine. (`maxPoints` decimates to the plot's
pixel width when you want the same picture for a fraction of the work.)

<Example file="./examples/charts/gallery-100k" title="100,000 points, redrawn" />

## A live stream

A new sample every 250ms into a 60-point window. Each write repaints the canvas
and nothing else: the chart is one effect over one signal.

<Example file="./examples/charts/gallery-stream" title="Streaming" />

## Against ECharts

The same charts, measured in `examples/benchmark` (`bun run bench:charts` for
speed, `bun run bench:charts-bundle` for size). Size, gzipped, beyond a bare
Pyreon app's runtime:

| Chart                       | `@pyreon/charts/plot` | ECharts 6, tree-shaken | ECharts 6, whole package |
| --------------------------- | --------------------- | ---------------------- | ------------------------ |
| Line                        | 40.9 KB               | 155.9 KB               | 361.1 KB                 |
| Bar + line, tooltip, legend | 40.9 KB               | 176.8 KB               | —                        |
| Pie                         | 18.1 KB               | 117.3 KB               | —                        |

An ECharts option through `<OptionChart>` costs 128.9 KB: the facade compiles
every series type it supports, so it is the larger Pyreon entry, and still
smaller than the ECharts it replaces.

Speed, one line chart on an 800×400 canvas. The figures are medians in
milliseconds from real Chromium with animation off on both sides; absolute
numbers depend on the machine, so read them for their ratios:

| Operation                    | `PlotChart` | `OptionChart` | ECharts 6 |
| ---------------------------- | ----------- | ------------- | --------- |
| First render, 100,000 points | **28.3**    | 55.5          | 44.8      |
| Update all 100,000 points    | 19.1        | **16.2**      | 31.5      |
| Update one of 1,000 points   | 1.6         | **1.5**       | 2.0       |
| First render, 1,000 points   | 11.6        | 11.9          | **4.3**   |

The last row is a loss, and it comes from one feature. Pyreon renders an
offscreen data table (up to 1,000 rows) for screen readers by default; ECharts
renders none. Without it (`accessibleTable={false}`) the same chart's first
render is 1.3 ms. Building and laying out the table is the cost of the chart
being readable without sight, and Pyreon keeps it on by default.
