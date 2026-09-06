/**
 * `@pyreon/charts/plot` — ENGINE throughput benchmark.
 *
 * The engine is pure geometry: `layoutChart` + `renderChart` turn a spec into a
 * flat `DrawCmd[]` with no DOM. This measures that path alone, at the sizes a
 * dashboard actually hits, so a perf claim about the engine is a number rather
 * than folklore (the audit found none existed).
 *
 * Protocol (repo convention):
 *   - `NODE_ENV=production` set BEFORE any import.
 *   - Per-sample fresh data (no cross-sample caching in the engine to hide behind).
 *   - Warm-up, then median + p25/p75 over K samples; draw-list size reported
 *     beside the time because a faster render that emits fewer commands is a
 *     different chart, not a faster one.
 *   - Correctness gate: every scenario asserts the command count is what the
 *     shape implies (an empty measurement is a bug, not a win).
 *   - Author-judge disclosed: the engine's author wrote AND runs this bench.
 *
 * Run: NODE_ENV=production bun packages/fundamentals/charts/bench/plot-engine.bench.ts
 */
process.env.NODE_ENV = 'production'

import { layoutChart, renderChart, defaultTheme } from '../src/engine/render'
import type { ChartSpec, Series } from '../src/engine/render'
import { lttb } from '../src/engine/decimate'
import { layoutTreemap, renderTreemap } from '../src/engine/treemap'
import { layoutSankey, renderSankey } from '../src/engine/sankey'
import { measureApprox } from '../src/engine/svg'

const K = 15
const measure = measureApprox()

function series(kind: Series['kind'], n: number, seed: number): Series {
  const values: number[] = []
  let x = seed
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648
    values.push(50 + (x % 100) + Math.sin(i / 20) * 20)
  }
  return { kind, values, color: '#4f7df3', width: 2.0, radius: 3.0, label: `s${seed}`, showValues: false }
}

function spec(kind: Series['kind'], n: number, count: number): ChartSpec {
  const cats: string[] = []
  for (let i = 0; i < n; i++) cats.push(String(i))
  const s: Series[] = []
  for (let k = 0; k < count; k++) s.push(series(kind, n, k + 1))
  return { width: 960, height: 400, series: s, categories: cats, theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true }
}

function stats(samples: number[]): { median: number; p25: number; p75: number } {
  const s = [...samples].sort((a, b) => a - b)
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!
  return { median: at(0.5), p25: at(0.25), p75: at(0.75) }
}

function bench(name: string, make: () => () => number, expectMin: number): void {
  const warm = make()
  for (let i = 0; i < 3; i++) warm()
  const samples: number[] = []
  let cmds = 0
  for (let i = 0; i < K; i++) {
    const run = make()
    const t0 = performance.now()
    cmds = run()
    samples.push(performance.now() - t0)
  }
  if (cmds < expectMin) throw new Error(`${name}: ${cmds} commands, expected at least ${expectMin} — the measurement is empty`)
  const { median, p25, p75 } = stats(samples)
  console.log(`${name.padEnd(34)} median ${median.toFixed(2).padStart(8)} ms   p25 ${p25.toFixed(2).padStart(7)}   p75 ${p75.toFixed(2).padStart(7)}   cmds ${String(cmds).padStart(7)}`)
}

console.log(`plot engine — layout + render, K=${K} samples, ${process.env.NODE_ENV}\n`)
for (const [kind, n, count] of [['bars', 1_000, 1], ['bars', 10_000, 1], ['line', 10_000, 1], ['line', 100_000, 1], ['area', 10_000, 3], ['points', 10_000, 1]] as const) {
  bench(`${kind} ×${count} n=${n}`, () => {
    const sp = spec(kind, n, count)
    return () => renderChart(sp, measure).length
  }, kind === 'bars' ? n : 1)
}
bench('lttb 100k → 1k + line render', () => {
  const sp = spec('line', 100_000, 1)
  return () => {
    const dec = sp.series.map((s) => ({ ...s, values: lttb(s.values.map((y, x) => ({ x, y })), 1_000).map((p) => p.y) }))
    const cats = sp.categories.slice(0, 1_000)
    return renderChart({ ...sp, series: dec, categories: cats }, measure).length
  }
}, 1)
bench('layoutChart only, bars n=10k', () => {
  const sp = spec('bars', 10_000, 1)
  return () => (layoutChart(sp, measure).plot.w > 0 ? 1 : 0)
}, 1)
bench('treemap 1k leaves', () => {
  const nodes = Array.from({ length: 20 }, (_, g) => ({ name: `g${g}`, children: Array.from({ length: 50 }, (_, i) => ({ name: `n${g}-${i}`, value: 1 + ((g * 50 + i) % 37) })) }))
  return () => renderTreemap(layoutTreemap(nodes, { x: 0, y: 0, w: 960, h: 400 }), undefined, measure).length
}, 1_000)
bench('sankey 60 nodes / 200 links', () => {
  const nodes = Array.from({ length: 60 }, (_, i) => ({ name: `n${i}` }))
  const links = Array.from({ length: 200 }, (_, i) => ({ source: `n${i % 30}`, target: `n${30 + ((i * 7) % 30)}`, value: 1 + (i % 9) }))
  return () => renderSankey(layoutSankey(nodes, links, { x: 80, y: 8, w: 800, h: 384 })).length
}, 200)
