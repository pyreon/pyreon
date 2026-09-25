/**
 * Scenario: **charts-libs — `@pyreon/charts` vs uPlot, Chart.js and Recharts**.
 *
 * Seven ops, same data for every library (a seeded random walk, x = index):
 *
 *  1–4. `mount line, N points` for N = 1k / 10k / 100k / 1M, 800 × 300.
 *  5–6. `update line, N points (every value)` for N = 10k / 100k — the whole
 *       y column replaced by another series of the same length.
 *  7.   `mount bars, 1,000 bars` — category axis, one bar per datum.
 *
 * ── THE TIMING WINDOW (identical for every arm) ─────────────────────────────
 *
 * The goal is "mount call → first painted frame". A synchronous
 * `getBoundingClientRect()` does NOT get there: it forces style + layout but
 * not paint, and for an SVG library (Recharts) paint is where a 100k-segment
 * path gets recorded. So every sample:
 *
 *  1. waits for a `requestAnimationFrame` callback, OUTSIDE the window;
 *  2. starts the clock INSIDE that callback and runs the op synchronously
 *     (React arms use `flushSync`; uPlot's deferred commit is a microtask, and
 *     microtasks drain before the frame's rendering step);
 *  3. lets the browser run that frame's rendering step (style, layout, paint —
 *     it runs right after rAF callbacks), and closes the window in the FIRST
 *     task after it (a `MessageChannel` message posted from step 2);
 *  4. in that task, calls `getImageData(0, 0, 1, 1)` on every canvas in the
 *     host — a forced readback that makes Chromium finish rasterizing queued
 *     2D commands — then reads the clock.
 *
 * Starting inside rAF removes frame-alignment wait (0–16.7ms of vsync jitter)
 * from the window.
 *
 * HONEST ASYMMETRY that remains: step 4 forces canvas RASTER onto the clock,
 * but SVG raster happens on Chromium's raster threads after main-thread paint,
 * and nothing in the page can wait for it synchronously. The Recharts arm
 * therefore excludes its raster cost; this FAVOURS Recharts.
 *
 * The host is a VISIBLE, in-viewport element — not the suite's shared
 * container, which is `visibility:hidden` at `left:-9999px`. Chromium skips
 * painting hidden / off-viewport content, which would silently delete paint
 * from the SVG arm.
 *
 * ── CORRECTNESS GATE (asserts the effect, at the instant the clock stops) ───
 *
 * The gate runs SYNCHRONOUSLY in the same task that read the end time, so no
 * library code can run between "clock stopped" and "picture checked". A
 * library that defers its draw past the window fails the run instead of
 * posting a fast number.
 *  - canvas arms: count pixels of the series colour over the whole canvas
 *    (≥ a per-op minimum); an update must also change the image fingerprint;
 *  - Recharts: the line's `<path d>` must carry at least N-ish segments, the
 *    bar chart must carry 1,000 bar rectangles; an update must change `d`.
 *
 * ── PIXEL REDUCTION (who draws fewer segments than points) ──────────────────
 *  - Pyreon: M4 (commit 52a1168fc) — first/min/max/last per HALF-pixel column
 *    (≤ 8 points per CSS px) once a line has more points than ~4× its span in
 *    half-pixels. DEFAULT ON. Every point is still PLACED (one `Pt` each)
 *    before the reduction runs.
 *  - uPlot 1.6.32: in/min/max/out per whole device pixel once
 *    `n ≥ 4 × plotWidth` (`linear()` path builder). DEFAULT ON, and it works
 *    off the value arrays without allocating per point.
 *  - Chart.js 4.5.1: `min-max` decimation plugin, first/min/max/last per whole
 *    pixel. OFF by default; requires `parsing: false` and a linear/time x
 *    axis. The RANKED Chart.js arm turns it on with the documented large-data
 *    configuration; the `(defaults)` arm is a diagnostic without it.
 *  - Recharts 3.10.1: none. Every point becomes a path segment.
 *
 * ── FAIRNESS SWITCHES ───────────────────────────────────────────────────────
 *  - Animation off everywhere (Pyreon `animate`/`updateAnimation` false,
 *    Chart.js `animation: false`, Recharts `isAnimationActive={false}`; uPlot
 *    does not animate).
 *  - No point symbols anywhere (uPlot `points.show: false`, Chart.js
 *    `pointRadius: 0`, Recharts `dot={false}`; Pyreon draws none by default).
 *  - uPlot legend off (it is a DOM table the others do not render); Chart.js
 *    legend/tooltip plugins not registered; Recharts gets `<CartesianGrid>`
 *    because the other three draw a grid by default.
 *  - Pyreon ships an offscreen accessible data table (≤ 1,000 rows) BY DEFAULT;
 *    nobody else does. The ranked Pyreon arm keeps it (that is the product);
 *    the `(no a11y table)` arm prices it.
 *  - Input is each library's idiomatic shape, built OUTSIDE the window: row
 *    objects for Pyreon/Recharts, `{x, y}` for Chart.js, columns for uPlot.
 *  - DPR is the page's (1 in headless Chromium) on every arm.
 *
 * ── IN-RUN CONTROL ──────────────────────────────────────────────────────────
 * `Vanilla canvas (control)` strokes every point with raw 2D calls and no
 * axes. It is not a floor (it does NOT reduce, so at 1M it strokes 1M
 * segments); it exists so pass-to-pass drift is visible on an arm no library
 * change can touch.
 *
 * AUTHOR-JUDGE: written and judged by the Pyreon authors.
 */
import { h as ph } from '@pyreon/core'
import { bars as pbars, line as pline, PlotChart } from '@pyreon/charts/engine'
import { signal } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Decimation,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
} from 'chart.js'
import { createElement as rh } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { BenchResult, BenchSuite } from '../runner'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, BarController, BarElement, Decimation)

export const CHARTS_LIBS_FRAMEWORKS = [
  'Pyreon (PlotChart)',
  'uPlot 1.6',
  'Chart.js 4 (min-max decimation)',
  'Recharts 3',
  'Chart.js 4 (defaults, no decimation)',
  'Pyreon (PlotChart, no a11y table)',
  'Vanilla canvas (control)',
] as const

const W = 800
const H = 300
const COLOR = '#2f6fdb'
const TR = 0x2f
const TG = 0x6f
const TB = 0xdb

/** A seeded random walk — the same series on every arm and every run. */
function walk(n: number, seed: number): Float64Array {
  let s = seed >>> 0
  const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff
  const out = new Float64Array(n)
  let v = 50
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.5) * 4
    out[i] = Math.round(v * 100) / 100
  }
  return out
}

/** Positive bar heights, seeded. */
function heights(n: number, seed: number): Float64Array {
  let s = seed >>> 0
  const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.round((10 + rnd() * 90) * 100) / 100
  return out
}

// ─── Per-library input shapes (built once, outside every window) ────────────

interface Row {
  v: number
}
interface XY {
  x: number
  y: number
}
interface BarRow {
  label: string
  v: number
}

const memo = new WeakMap<Float64Array, unknown>()
function cached<T>(ys: Float64Array, tag: string, build: () => T): T {
  let m = memo.get(ys) as Map<string, unknown> | undefined
  if (m === undefined) {
    m = new Map()
    memo.set(ys, m)
  }
  if (!m.has(tag)) m.set(tag, build())
  return m.get(tag) as T
}
const asRows = (ys: Float64Array): Row[] =>
  cached(ys, 'rows', () => Array.from(ys, (v) => ({ v })))
const asXY = (ys: Float64Array): XY[] =>
  cached(ys, 'xy', () => Array.from(ys, (y, x) => ({ x, y })))
const asCols = (ys: Float64Array): [number[], number[]] =>
  cached(ys, 'cols', () => [Array.from(ys, (_, i) => i), Array.from(ys)])
const asBarRows = (ys: Float64Array): BarRow[] =>
  cached(ys, 'bars', () => Array.from(ys, (v, i) => ({ label: String(i), v })))

/** Build the arm's own input shape OUTSIDE every window (an app holds its data). */
function prebuild(fw: string, ys: Float64Array, kind: 'line' | 'bars'): void {
  if (fw.startsWith('Pyreon')) void (kind === 'line' ? asRows(ys) : asBarRows(ys))
  else if (fw.startsWith('uPlot')) void asCols(ys)
  else if (fw.startsWith('Chart.js')) void (kind === 'line' ? asXY(ys) : asBarRows(ys))
  else if (fw.startsWith('Recharts')) void (kind === 'line' ? asXY(ys) : asBarRows(ys))
}

// ─── Targets ────────────────────────────────────────────────────────────────

interface Target {
  mountLine(host: HTMLElement, ys: Float64Array): void
  updateLine(ys: Float64Array): void
  mountBars(host: HTMLElement, ys: Float64Array): void
  dispose(): void
}

function pyreonTarget(accessibleTable: boolean): Target {
  let rows: ReturnType<typeof signal<Row[]>> | null = null
  let unmount: (() => void) | null = null
  return {
    mountLine(host, ys) {
      const r = signal<Row[]>(asRows(ys))
      rows = r
      unmount = pyreonMount(
        ph(PlotChart<Row>, {
          data: () => r(),
          marks: [pline((d: Row) => d.v, { color: COLOR, width: 1 })],
          width: W,
          height: H,
          animate: false,
          updateAnimation: false,
          accessibleTable,
        }),
        host,
      )
    },
    updateLine(ys) {
      rows?.set(asRows(ys))
    },
    mountBars(host, ys) {
      unmount = pyreonMount(
        ph(PlotChart<BarRow>, {
          data: asBarRows(ys),
          x: (d: BarRow) => d.label,
          marks: [pbars((d: BarRow) => d.v, { color: COLOR })],
          width: W,
          height: H,
          animate: false,
          updateAnimation: false,
          accessibleTable,
        }),
        host,
      )
    },
    dispose() {
      unmount?.()
      unmount = null
      rows = null
    },
  }
}

function uplotTarget(): Target {
  let u: uPlot | null = null
  const base = (series: uPlot.Series): uPlot.Options => ({
    width: W,
    height: H,
    legend: { show: false },
    scales: { x: { time: false } },
    series: [{}, series],
  })
  return {
    mountLine(host, ys) {
      u = new uPlot(base({ stroke: COLOR, width: 1, points: { show: false } }), asCols(ys), host)
    },
    updateLine(ys) {
      u?.setData(asCols(ys))
    },
    mountBars(host, ys) {
      const [xs, vs] = asCols(ys)
      u = new uPlot(
        base({ fill: COLOR, stroke: COLOR, width: 0, points: { show: false }, paths: uPlot.paths.bars!({ size: [0.6, 100] }) }),
        [xs, vs],
        host,
      )
    },
    dispose() {
      u?.destroy()
      u = null
    },
  }
}

function chartjsTarget(decimate: boolean): Target {
  let c: Chart | null = null
  const canvasIn = (host: HTMLElement): HTMLCanvasElement => {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    cv.style.width = `${W}px`
    cv.style.height = `${H}px`
    host.appendChild(cv)
    return cv
  }
  return {
    mountLine(host, ys) {
      c = new Chart(canvasIn(host), {
        type: 'line',
        data: { datasets: [{ data: asXY(ys), borderColor: COLOR, borderWidth: 1, pointRadius: 0, ...(decimate ? { spanGaps: true } : {}) }] },
        options: {
          responsive: false,
          animation: false,
          ...(decimate ? { parsing: false as const, normalized: true } : {}),
          scales: { x: { type: 'linear' } },
          plugins: { decimation: { enabled: decimate, algorithm: 'min-max' } },
        },
      })
    },
    updateLine(ys) {
      if (c === null) return
      const ds = c.data.datasets[0]!
      ds.data = asXY(ys)
      c.update('none')
    },
    mountBars(host, ys) {
      const rows = asBarRows(ys)
      c = new Chart(canvasIn(host), {
        type: 'bar',
        data: { labels: rows.map((r) => r.label), datasets: [{ data: Array.from(ys), backgroundColor: COLOR }] },
        options: { responsive: false, animation: false, scales: { x: { type: 'category' } } },
      })
    },
    dispose() {
      c?.destroy()
      c = null
    },
  }
}

function rechartsTarget(): Target {
  let root: ReturnType<typeof createRoot> | null = null
  const lineEl = (ys: Float64Array) =>
    rh(
      LineChart,
      { width: W, height: H, data: asXY(ys) },
      rh(CartesianGrid, { strokeDasharray: '' }),
      rh(XAxis, { dataKey: 'x', type: 'number', domain: ['dataMin', 'dataMax'] }),
      rh(YAxis, { domain: ['auto', 'auto'] }),
      rh(Line, { dataKey: 'y', dot: false, activeDot: false, isAnimationActive: false, stroke: COLOR, strokeWidth: 1 }),
    )
  return {
    mountLine(host, ys) {
      const r = createRoot(host)
      root = r
      flushSync(() => r.render(lineEl(ys)))
    },
    updateLine(ys) {
      const r = root
      if (r) flushSync(() => r.render(lineEl(ys)))
    },
    mountBars(host, ys) {
      const r = createRoot(host)
      root = r
      flushSync(() =>
        r.render(
          rh(
            BarChart,
            { width: W, height: H, data: asBarRows(ys) },
            rh(CartesianGrid, { strokeDasharray: '' }),
            rh(XAxis, { dataKey: 'label' }),
            rh(YAxis, null),
            rh(Bar, { dataKey: 'v', fill: COLOR, isAnimationActive: false }),
          ),
        ),
      )
    },
    dispose() {
      root?.unmount()
      root = null
    },
  }
}

/** Raw 2D calls, no axes, no reduction — the drift control. */
function vanillaTarget(): Target {
  let cv: HTMLCanvasElement | null = null
  const drawLine = (ys: Float64Array): void => {
    const ctx = cv!.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < ys.length; i++) {
      const v = ys[i]!
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    const sx = W / Math.max(1, ys.length - 1)
    const sy = H / (hi - lo || 1)
    ctx.beginPath()
    ctx.moveTo(0, H - (ys[0]! - lo) * sy)
    for (let i = 1; i < ys.length; i++) ctx.lineTo(i * sx, H - (ys[i]! - lo) * sy)
    ctx.strokeStyle = COLOR
    ctx.lineWidth = 1
    ctx.stroke()
  }
  const make = (host: HTMLElement): void => {
    cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    host.appendChild(cv)
  }
  return {
    mountLine(host, ys) {
      make(host)
      drawLine(ys)
    },
    updateLine(ys) {
      drawLine(ys)
    },
    mountBars(host, ys) {
      make(host)
      const ctx = cv!.getContext('2d')!
      let hi = 0
      for (let i = 0; i < ys.length; i++) if (ys[i]! > hi) hi = ys[i]!
      const bw = W / ys.length
      ctx.fillStyle = COLOR
      for (let i = 0; i < ys.length; i++) {
        const bh = (ys[i]! / hi) * H
        ctx.fillRect(i * bw + bw * 0.2, H - bh, bw * 0.6, bh)
      }
    },
    dispose() {
      cv?.remove()
      cv = null
    },
  }
}

function makeTarget(fw: string): Target {
  switch (fw) {
    case 'Pyreon (PlotChart)':
      return pyreonTarget(true)
    case 'Pyreon (PlotChart, no a11y table)':
      return pyreonTarget(false)
    case 'uPlot 1.6':
      return uplotTarget()
    case 'Chart.js 4 (min-max decimation)':
      return chartjsTarget(true)
    case 'Chart.js 4 (defaults, no decimation)':
      return chartjsTarget(false)
    case 'Recharts 3':
      return rechartsTarget()
    case 'Vanilla canvas (control)':
      return vanillaTarget()
    default:
      throw new Error(`[charts-libs] unknown framework: ${fw}`)
  }
}

// ─── Picture inspection (outside the clock, same task as the end read) ──────

interface Picture {
  /** Series-colour pixels (canvas) or path segments / bar rects (SVG). */
  mass: number
  /** Coarse fingerprint of what is on screen. */
  print: number
}

function inspect(host: HTMLElement): Picture {
  const svg = host.querySelector('svg.recharts-surface')
  if (svg !== null) {
    const bars = svg.querySelectorAll('.recharts-bar-rectangle path, .recharts-bar-rectangle rect').length
    if (bars > 0) return { mass: bars, print: bars }
    const d = svg.querySelector('.recharts-line-curve')?.getAttribute('d') ?? ''
    let segs = 0
    let print = 0
    for (let i = 0; i < d.length; i++) {
      const ch = d.charCodeAt(i)
      if (ch === 76 /* L */) segs++
      if (i % 97 === 0) print = (print * 31 + ch) >>> 0
    }
    return { mass: segs, print: (print + d.length) >>> 0 }
  }
  let mass = 0
  let print = 0
  for (const c of host.querySelectorAll('canvas')) {
    const ctx = c.getContext('2d')
    if (ctx === null || c.width === 0 || c.height === 0) continue
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    for (let p = 0; p < data.length; p += 4) {
      const r = data[p]!
      const g = data[p + 1]!
      const b = data[p + 2]!
      // Antialiased strokes blend toward the background; accept the colour's family.
      if (Math.abs(r - TR) < 40 && Math.abs(g - TG) < 40 && Math.abs(b - TB) < 40) mass++
      if ((p >> 2) % 53 === 0) print = (print * 31 + r * 3 + g * 5 + b * 7) >>> 0
    }
  }
  return { mass, print }
}

// ─── The frame-bounded timer ────────────────────────────────────────────────

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))
const settle = async (): Promise<void> => {
  await nextFrame()
  await new Promise((r) => setTimeout(r, 0))
}
function forceGc(): void {
  ;(globalThis as { gc?: () => void }).gc?.()
}

/** One sample: rAF → [op → rendering step → first task → canvas readback] → clock. */
function frameSample(host: HTMLElement, op: () => void, check: (p: Picture) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    requestAnimationFrame(() => {
      const ch = new MessageChannel()
      let t0 = 0
      ch.port1.onmessage = () => {
        try {
          for (const c of host.querySelectorAll('canvas')) c.getContext('2d')?.getImageData(0, 0, 1, 1)
          const elapsed = performance.now() - t0
          ch.port1.close()
          // Same task as the end read: nothing can draw between the clock and the gate.
          check(inspect(host))
          resolve(elapsed)
        } catch (err) {
          reject(err)
        }
      }
      try {
        t0 = performance.now()
        op()
        ch.port2.postMessage(0)
      } catch (err) {
        reject(err)
      }
    })
  })
}

/**
 * Verifies the window's premise instead of assuming it: a task posted from
 * inside a rAF callback runs AFTER that frame's rendering step. A
 * ResizeObserver callback runs inside the rendering step (after layout), so
 * the posted task must see it already fired. Runs once per page, outside any
 * timed region; a Chromium that ordered these differently fails the run.
 */
async function assertRenderingStepPrecedesPostedTask(): Promise<void> {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;left:0;top:320px;width:10px;height:10px'
  document.body.appendChild(probe)
  await settle()
  let roFired = false
  let armed = false
  const ro = new ResizeObserver(() => {
    if (armed) roFired = true
  })
  ro.observe(probe)
  await settle()
  const seen = await new Promise<boolean>((resolve) => {
    requestAnimationFrame(() => {
      armed = true
      probe.style.width = '20px'
      const ch = new MessageChannel()
      ch.port1.onmessage = () => {
        ch.port1.close()
        resolve(roFired)
      }
      ch.port2.postMessage(0)
    })
  })
  ro.disconnect()
  probe.remove()
  if (!seen) throw new Error('[charts-libs] timing premise violated: the posted task ran before the frame\'s rendering step')
}

/**
 * Adaptive warmup + fixed timed runs, with a WALL BUDGET per cell: an op whose
 * first sample is slow gets fewer samples (never fewer than MIN_RUNS), and one
 * whose first sample exceeds ABORT_MS is not measured at all (reported, never
 * silently dropped).
 */
const WARMUP_MIN = 3
const WARMUP_MAX = 10
const RUNS = 20
const MIN_RUNS = 5
const CELL_BUDGET_MS = 60_000
const ABORT_MS = 30_000

async function benchFrame(
  name: string,
  suite: BenchSuite,
  prepare: () => void,
  op: () => void,
  check: (p: Picture) => void,
  teardown: () => void,
): Promise<void> {
  const one = async (): Promise<number> => {
    prepare()
    await settle()
    forceGc()
    await settle()
    const t = await frameSample(host, op, check)
    teardown()
    await settle()
    return t
  }

  const first = await one()
  if (first > ABORT_MS) {
    suite.results.push(unmeasured(name, first))
    return
  }
  const perSample = first + 60 // + settle frames and GC
  const runs = Math.max(MIN_RUNS, Math.min(RUNS, Math.floor(CELL_BUDGET_MS / perSample) - WARMUP_MIN))
  const warm: number[] = [first]
  while (warm.length < (runs < RUNS ? 2 : WARMUP_MAX)) {
    warm.push(await one())
    if (warm.length >= WARMUP_MIN) {
      const a = warm.at(-1)!
      const b = warm.at(-2)!
      if (Math.abs(a - b) / Math.max(b, 1e-9) < 0.1) break
    }
  }
  const samples: number[] = []
  for (let i = 0; i < runs; i++) samples.push(await one())
  suite.results.push(summarize(name, samples, warm.length))
}

let host: HTMLElement

function summarize(name: string, samples: number[], warmupUsed: number): BenchResult {
  const s = [...samples].sort((a, b) => a - b)
  const q = (p: number): number => {
    const pos = (s.length - 1) * p
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo)
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, samples.length - 1))
  return {
    name,
    median: q(0.5),
    p90: q(0.9),
    min: s[0]!,
    max: s.at(-1)!,
    runs: samples.length,
    ci95: [q(0.025), q(0.975)],
    cv: mean > 0 ? sd / mean : 0,
    warmupUsed,
    samples,
  }
}

function unmeasured(name: string, first: number): BenchResult {
  return { name: `${name} [NOT MEASURED: first sample ${first.toFixed(0)}ms > ${ABORT_MS}ms]`, median: first, p90: first, min: first, max: first, runs: 0, ci95: [first, first], cv: 0, warmupUsed: 1, samples: [first] }
}

// ─── The scenario ───────────────────────────────────────────────────────────

const LINE_SIZES = [1_000, 10_000, 100_000, 1_000_000] as const
const UPDATE_SIZES = [10_000, 100_000] as const
const BARS = 1_000

/** Minimum series "mass" a correct picture must carry. */
function minMass(fw: string, n: number, kind: 'line' | 'bars'): number {
  if (fw === 'Recharts 3') return kind === 'bars' ? BARS : Math.floor(n * 0.9)
  return kind === 'bars' ? 20_000 : 400
}

export async function runChartsLibs(fw: string, _container: HTMLElement): Promise<BenchSuite> {
  host = document.createElement('div')
  // Visible and inside the viewport: hidden/off-screen content is not painted.
  host.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;background:#fff;z-index:10;overflow:hidden`
  document.body.appendChild(host)
  const suite: BenchSuite = { framework: fw, container: host, results: [] }
  const fmt = (n: number): string => n.toLocaleString('en')

  try {
    await assertRenderingStepPrecedesPostedTask()
    // ── mount line ──
    for (const n of LINE_SIZES) {
      const ys = walk(n, n)
      prebuild(fw, ys, 'line')
      let t = makeTarget(fw)
      await benchFrame(
        `mount line, ${fmt(n)} points`,
        suite,
        () => {
          t = makeTarget(fw)
        },
        () => t.mountLine(host, ys),
        (p) => {
          const min = minMass(fw, n, 'line')
          if (p.mass < min) throw new Error(`[charts-libs] ${fw} mount ${n}: series mass ${p.mass} < ${min} — nothing (or too little) drawn when the clock stopped`)
        },
        () => {
          t.dispose()
          host.replaceChildren()
        },
      )
    }

    // ── update line ──
    for (const n of UPDATE_SIZES) {
      const a = walk(n, n + 7)
      const b = walk(n, n + 13)
      prebuild(fw, a, 'line')
      prebuild(fw, b, 'line')
      const t = makeTarget(fw)
      t.mountLine(host, a)
      await settle()
      let flip = false
      let before = 0
      await benchFrame(
        `update line, ${fmt(n)} points (every value)`,
        suite,
        () => {
          before = inspect(host).print
          flip = !flip
        },
        () => t.updateLine(flip ? b : a),
        (p) => {
          if (p.print === before) throw new Error(`[charts-libs] ${fw} update ${n}: picture unchanged when the clock stopped`)
          const min = minMass(fw, n, 'line')
          if (p.mass < min) throw new Error(`[charts-libs] ${fw} update ${n}: series mass ${p.mass} < ${min}`)
        },
        () => {},
      )
      t.dispose()
      host.replaceChildren()
      await settle()
    }

    // ── mount bars ──
    {
      const ys = heights(BARS, 99)
      prebuild(fw, ys, 'bars')
      let t = makeTarget(fw)
      await benchFrame(
        `mount bars, ${fmt(BARS)} bars`,
        suite,
        () => {
          t = makeTarget(fw)
        },
        () => t.mountBars(host, ys),
        (p) => {
          const min = minMass(fw, BARS, 'bars')
          if (p.mass < min) throw new Error(`[charts-libs] ${fw} bars: mass ${p.mass} < ${min}`)
        },
        () => {
          t.dispose()
          host.replaceChildren()
        },
      )
    }
  } finally {
    host.remove()
  }
  return suite
}

// ─── CPU-profiling target (`?profileChartsLibs=1`, bench-charts-libs-profile.ts)
//
// Named driver frames (`__mountOnly` / `__updateOnly` / `__teardownOnly`) so a
// CDP subtree walk attributes ONLY the op's JS — not the teardown, the data
// build, or the harness. Requires a name-preserving build (BENCH_PROFILE=1).
// JS-only: style/layout/paint/raster are not under these frames.

export function setupChartsLibsProfile(): void {
  const h = document.createElement('div')
  h.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;background:#fff;overflow:hidden`
  document.body.appendChild(h)
  let t: Target | null = null
  let fw = ''
  let a: Float64Array = new Float64Array(0)
  let b: Float64Array = new Float64Array(0)
  let flip = false
  function __mountOnly(): void {
    t = makeTarget(fw)
    t.mountLine(h, a)
  }
  function __updateOnly(): void {
    flip = !flip
    t!.updateLine(flip ? b : a)
  }
  function __teardownOnly(): void {
    t?.dispose()
    t = null
    h.replaceChildren()
  }
  ;(globalThis as { __chartsLibsProf?: unknown }).__chartsLibsProf = {
    prepare(framework: string, n: number): void {
      fw = framework
      a = walk(n, n)
      b = walk(n, n + 13)
      prebuild(fw, a, 'line')
      prebuild(fw, b, 'line')
    },
    mount: __mountOnly,
    update: __updateOnly,
    teardown: __teardownOnly,
    mass: (): number => inspect(h).mass,
    // Frame-bounded samples bracketed by User Timing marks, for the trace
    // decomposition (bench-charts-libs-trace.ts). Same window as the timed
    // scenario: rAF → op → rendering step → first task → canvas readback.
    sampleMount: async (): Promise<number> => {
      await traced(__mountOnly)
      const m = inspect(h).mass
      __teardownOnly()
      return m
    },
    sampleUpdate: async (): Promise<number> => {
      await traced(__updateOnly)
      return inspect(h).mass
    },
    // SETTLED: the same start, but the window runs through TWO more frames —
    // frame N paints the chart, a large accessible table fills in a task after
    // frame N+1's paint (rAF → setTimeout), and frame N+2 lays it out. The
    // window closes in the first task after N+2. Idle vsync time is inside the
    // window; the trace driver reports BUSY time (window − idle), which is the
    // total main-thread work a mount costs including its deferred table.
    // Returns the filled table's body-row count (0 when there is no table).
    sampleMountSettled: async (): Promise<{ mass: number; tableRows: number }> => {
      await settle()
      forceGc()
      await settle()
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          performance.mark('cl-w0')
          __mountOnly()
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const ch = new MessageChannel()
              ch.port1.onmessage = () => {
                for (const c of h.querySelectorAll('canvas')) c.getContext('2d')?.getImageData(0, 0, 1, 1)
                performance.mark('cl-w1')
                ch.port1.close()
                resolve()
              }
              ch.port2.postMessage(0)
            })
          })
        })
      })
      const out = { mass: inspect(h).mass, tableRows: h.querySelectorAll('table tbody tr').length }
      __teardownOnly()
      return out
    },
  }
  async function traced(op: () => void): Promise<void> {
    await settle()
    forceGc()
    await settle()
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        const ch = new MessageChannel()
        ch.port1.onmessage = () => {
          for (const c of h.querySelectorAll('canvas')) c.getContext('2d')?.getImageData(0, 0, 1, 1)
          performance.mark('cl-w1')
          ch.port1.close()
          resolve()
        }
        performance.mark('cl-w0')
        op()
        ch.port2.postMessage(0)
      })
    })
  }
}
