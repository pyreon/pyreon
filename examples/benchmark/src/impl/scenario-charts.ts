/**
 * Scenario: **charts — `@pyreon/charts` vs ECharts 6**.
 *
 * The first cross-library TIMING measurement for the charts engine (the
 * package's own `plot-engine.bench.ts` compares spec → SVG string in bun; this
 * is real Chromium, real canvas, production build). Four ops on one line
 * chart, 800 × 400:
 *
 *  1. `mount line, 1,000 points`            — first render of a typical chart.
 *  2. `mount line, 100,000 points`          — first render of a large series.
 *  3. `update line, 100,000 points (all)`   — every value replaced.
 *  4. `update line, 1,000 points (one)`     — one value changed.
 *
 * ARMS
 *  - `Pyreon (PlotChart)` — the idiomatic Pyreon API: `data` accessor over a
 *    signal, one `line` mark. An update is `rows.set(next)`.
 *  - `Pyreon (OptionChart)` — the SAME ECharts option object ECharts gets,
 *    compiled by Pyreon's option facade. An update is `option.set(next)`, so
 *    this arm pays a full option recompile per update, as an app porting its
 *    ECharts options would.
 *  - `Pyreon (PlotChart, no a11y table)` — DIAGNOSTIC, not ranked: the same
 *    chart with `accessibleTable={false}`. Pyreon renders an offscreen data
 *    table (capped at 1,000 rows) by default; ECharts ships none (its `aria`
 *    is off by default). This arm prices that difference instead of hiding it.
 *  - `ECharts 6` — tree-shaken the documented way (`echarts/core` + `LineChart`
 *    + `GridComponent` + `CanvasRenderer`), `init` + `setOption`; an update is
 *    `setOption({ series: [{ data }] })` (merge), ECharts' own idiom.
 *
 * FAIRNESS
 *  - Animation off on every arm (`animate` / `updateAnimation` false; ECharts
 *    `animation: false`), so each op times one synchronous render.
 *  - ECharts draws a symbol per point by default on small series; the option
 *    sets `showSymbol: false` so both libraries draw the same thing — a line.
 *  - No decimation on any arm: Pyreon's `maxPoints` is opt-in and ECharts'
 *    `sampling` is off by default, so all three stroke every point.
 *  - Both libraries render SYNCHRONOUSLY (Pyreon paints in an effect when the
 *    canvas ref lands; ECharts' `setOption` ends in `zr.flush()`). The timed
 *    region still ends with a 1×1 `getImageData`, which forces Chromium to
 *    RASTERIZE the queued canvas commands — without it a library that
 *    enqueues a 100k-segment path would look free.
 *  - DPR is the page's (1 in headless Chromium) on every arm.
 *
 * VERIFY asserts the effect, in pixels, outside the timed region: the canvas
 * carries at least N pixels of the line colour, and an update changes the
 * image's fingerprint. A library that no-ops fails the run.
 *
 * AUTHOR-JUDGE: written and judged by the Pyreon authors. ECharts is used
 * through its documented public API with its own defaults except the two
 * switches above, each of which REMOVES work from ECharts, not from Pyreon.
 */
import { h as ph } from '@pyreon/core'
import { OptionChart } from '@pyreon/charts/option'
import { line, PlotChart } from '@pyreon/charts/engine'
import { signal } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { LineChart } from 'echarts/charts'
import { GridComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'

echarts.use([LineChart, GridComponent, CanvasRenderer])

export const CHARTS_FRAMEWORKS = ['Pyreon (PlotChart)', 'Pyreon (OptionChart)', 'ECharts 6', 'Pyreon (PlotChart, no a11y table)'] as const

const W = 800
const H = 400
const COLOR = '#2f6fdb'
const SMALL = 1_000
const LARGE = 100_000

/** A seeded random walk — the same series on every arm and every run. */
function walk(n: number, seed: number): number[] {
  let s = seed >>> 0
  const rnd = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff)
  const out: number[] = []
  let v = 50
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.5) * 4
    out.push(Math.round(v * 100) / 100)
  }
  return out
}

function indexLabels(n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(String(i))
  return out
}

function echartsOption(values: number[], labels: string[]) {
  return {
    animation: false,
    grid: { left: 48, right: 16, top: 16, bottom: 32 },
    xAxis: { type: 'category' as const, data: labels },
    yAxis: { type: 'value' as const, scale: true },
    series: [{ type: 'line' as const, data: values, showSymbol: false, lineStyle: { color: COLOR, width: 1 }, itemStyle: { color: COLOR } }],
  }
}

interface ChartTarget {
  mount(host: HTMLElement, values: number[], labels: string[]): () => void
  /** Replace every value. */
  update(values: number[]): void
}

interface Row {
  i: string
  v: number
}

function pyreonPlot(accessibleTable = true): ChartTarget {
  let rows: ReturnType<typeof signal<Row[]>> | null = null
  let labels: string[] = []
  // Rows are built once per value array, outside the timed region's steady
  // state: an app holds its rows, it does not re-map them per update — and the
  // ECharts arm gets its value array handed over as-is.
  const built = new WeakMap<number[], Row[]>()
  const toRows = (values: number[]): Row[] => {
    const cached = built.get(values)
    if (cached !== undefined) return cached
    const out: Row[] = []
    for (let i = 0; i < values.length; i++) out.push({ i: labels[i] ?? String(i), v: values[i] as number })
    built.set(values, out)
    return out
  }
  return {
    mount(host, values, ls) {
      labels = ls
      const r = signal<Row[]>(toRows(values))
      rows = r
      return pyreonMount(
        ph(PlotChart<Row>, {
          data: () => r(),
          x: (d: Row) => d.i,
          marks: [line((d: Row) => d.v, { color: COLOR, width: 1 })],
          width: W,
          height: H,
          animate: false,
          updateAnimation: false,
          accessibleTable,
        }),
        host,
      )
    },
    update(values) {
      rows?.set(toRows(values))
    },
  }
}

function pyreonOption(): ChartTarget {
  let opt: ReturnType<typeof signal<ReturnType<typeof echartsOption>>> | null = null
  let labels: string[] = []
  return {
    mount(host, values, ls) {
      labels = ls
      const o = signal(echartsOption(values, ls))
      opt = o
      return pyreonMount(ph(OptionChart, { option: () => o(), width: W, height: H }), host)
    },
    update(values) {
      opt?.set(echartsOption(values, labels))
    },
  }
}

function echartsTarget(): ChartTarget {
  let chart: echarts.ECharts | null = null
  return {
    mount(host, values, labels) {
      const c = echarts.init(host, null, { width: W, height: H, renderer: 'canvas' })
      chart = c
      c.setOption(echartsOption(values, labels))
      return () => {
        c.dispose()
        if (chart === c) chart = null
      }
    },
    update(values) {
      chart?.setOption({ series: [{ data: values }] })
    },
  }
}

function canvasOf(host: HTMLElement): HTMLCanvasElement {
  const c = host.querySelector('canvas')
  if (c === null) throw new Error('[charts] no canvas mounted')
  return c
}

/** Forces rasterization of whatever the library queued — inside the timed region. */
function rasterize(host: HTMLElement): void {
  canvasOf(host).getContext('2d')?.getImageData(0, 0, 1, 1)
}

/** Pixels of the line colour, and a coarse fingerprint of the whole image. */
function inspect(host: HTMLElement): { linePixels: number; print: number } {
  const c = canvasOf(host)
  const ctx = c.getContext('2d')
  if (ctx === null) throw new Error('[charts] no 2d context')
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  const tr = 0x2f
  const tg = 0x6f
  const tb = 0xdb
  let linePixels = 0
  let print = 0
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p] as number
    const g = data[p + 1] as number
    const b = data[p + 2] as number
    // Antialiased strokes blend toward the background; accept the colour's family.
    if (Math.abs(r - tr) < 40 && Math.abs(g - tg) < 40 && Math.abs(b - tb) < 40) linePixels++
    if ((p >> 2) % 53 === 0) print = (print * 31 + r * 3 + g * 5 + b * 7) >>> 0
  }
  return { linePixels, print }
}

export async function runCharts(frameworkName: string, container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: frameworkName, container, results: [] }
  const make = (): ChartTarget => {
    switch (frameworkName) {
      case 'Pyreon (PlotChart)':
        return pyreonPlot()
      case 'Pyreon (OptionChart)':
        return pyreonOption()
      case 'ECharts 6':
        return echartsTarget()
      case 'Pyreon (PlotChart, no a11y table)':
        return pyreonPlot(false)
      default:
        throw new Error(`[charts] unknown framework: ${frameworkName}`)
    }
  }

  const host = document.createElement('div')
  host.style.cssText = `width: ${W}px; height: ${H}px; position: relative;`
  container.appendChild(host)

  const small = walk(SMALL, 1)
  const smallLabels = indexLabels(SMALL)
  const large = walk(LARGE, 2)
  const largeAlt = walk(LARGE, 3)
  const largeLabels = indexLabels(LARGE)

  const drawn = (min: number) => (): void => {
    const got = inspect(host).linePixels
    if (got < min) throw new Error(`[charts] ${frameworkName}: expected >= ${min} line pixels, got ${got}`)
  }

  // ── Ops 1–2: mount ──────────────────────────────────────────────────────────
  for (const [label, values, labels, min] of [
    [`mount line, ${SMALL.toLocaleString('en')} points`, small, smallLabels, 400],
    [`mount line, ${LARGE.toLocaleString('en')} points`, large, largeLabels, 2000],
  ] as const) {
    let teardown: (() => void) | null = null
    const target = make()
    await bench(
      label,
      suite,
      () => {
        teardown = target.mount(host, values as number[], labels as string[])
      },
      {
        reset: () => {
          if (teardown) {
            teardown()
            teardown = null
          }
          host.innerHTML = ''
        },
        commit: () => rasterize(host),
        verify: drawn(min),
      },
    )
    if (teardown) (teardown as () => void)()
    host.innerHTML = ''
  }

  // ── Op 3: update all 100k values ────────────────────────────────────────────
  {
    const target = make()
    const teardown = target.mount(host, large, largeLabels)
    let flip = false
    let before = 0
    await bench(
      `update line, ${LARGE.toLocaleString('en')} points (every value)`,
      suite,
      () => {
        flip = !flip
        target.update(flip ? largeAlt : large)
      },
      {
        reset: () => {
          before = inspect(host).print
        },
        commit: () => rasterize(host),
        verify: () => {
          const now = inspect(host)
          if (now.print === before) throw new Error(`[charts] ${frameworkName}: update did not change the picture`)
          drawn(2000)()
        },
      },
    )
    teardown()
    host.innerHTML = ''
  }

  // ── Op 4: update one value of 1k ────────────────────────────────────────────
  {
    const target = make()
    const teardown = target.mount(host, small, smallLabels)
    const bumped = [...small]
    bumped[SMALL >> 1] = (small[SMALL >> 1] as number) + 30
    let flip = false
    let before = 0
    await bench(
      `update line, ${SMALL.toLocaleString('en')} points (one value)`,
      suite,
      () => {
        flip = !flip
        target.update(flip ? bumped : small)
      },
      {
        reset: () => {
          before = inspect(host).print
        },
        commit: () => rasterize(host),
        verify: () => {
          if (inspect(host).print === before) throw new Error(`[charts] ${frameworkName}: one-value update did not change the picture`)
        },
      },
    )
    teardown()
    host.innerHTML = ''
  }

  container.removeChild(host)
  return suite
}
