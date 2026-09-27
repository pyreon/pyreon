/**
 * Lathe's scaling, measured in a way that can actually answer the question.
 *
 * ## Why this exists
 *
 * A first attempt at this measured one unwarmed run per size and read an
 * exponent off two endpoints. The ratios swung FORTY TIMES in both directions
 * for a 2x input — parse "0.3x" then "10.1x" for the same doubling — which is
 * JIT compilation and GC, not scaling. No claim survives that instrument, in
 * either direction, and reporting one anyway is how a made-up optimization
 * gets justified.
 *
 * So: warm up, repeat, take the MEDIAN, and report the spread alongside it. If
 * the spread is wide the number is not usable and the output says so rather
 * than printing a confident median.
 *
 * ## Why the fixture shape is a parameter
 *
 * The first attempt also chained every model to the previous one — an 800-deep
 * dependency chain no real spec has — which could manufacture superlinearity
 * in the topological sort all by itself. A fixture is a hypothesis about the
 * input; running two shapes is what distinguishes "the code is superlinear"
 * from "my fixture is".
 *
 * Run: `bun run bench` (node, V8 -- the engine the shipped bin runs on) or
 * `bun bench/scaling.ts` (JavaScriptCore). Add `--json` for machine-readable
 * output. The banner names the engine; never quote a row without it.
 */
import { ALL_PLUGINS, resolveConfig } from '../src/core/config'
import { generate } from '../src/core/generate'
import { loadOpenApi } from '../src/input/openapi'
import { cpus as benchCpus, loadavg as benchLoadavg } from 'node:os'

// Runtime banner — which ENGINE produced these numbers (bun = JavaScriptCore,
// node = V8) plus CPU and load, so a result is never quoted engine-less.
function benchRuntimeBanner(): string {
  const bunRt = (globalThis as { Bun?: { version: string } }).Bun
  const engine = bunRt ? `bun ${bunRt.version} (JavaScriptCore)` : `node ${process.version} (V8)`
  const load = benchLoadavg()
    .map((l) => l.toFixed(2))
    .join(' ')
  return `${engine} · ${process.platform}/${process.arch} · ${benchCpus()[0]?.model ?? 'unknown cpu'} · loadavg ${load}`
}

type Shape = 'chain' | 'shallow' | 'flat' | 'dense' | 'hub'

/**
 * `chain`   — each model refs the previous. A worst case for anything that
 *             walks the dependency graph, and NOT a real spec shape.
 * `shallow` — each model refs one of the first five. Wide and flat, which is
 *             what a real API looks like.
 * `flat`    — no refs at all. The floor.
 * `dense`   — each model refs THREE others chosen by a fixed hash, so the
 *             graph is full of cycles and one large strongly-connected
 *             component forms -- the shape of Stripe's `expandable` graph, and
 *             the one that made the faker plugin cubic. None of the three
 *             shapes above contains a cycle at all.
 * `hub`     — every model refs the same eight hub models, and the hubs ref
 *             each other: high fan-in plus a small cycle, the shape of a spec
 *             whose `User`/`Repository` is named everywhere (GitHub).
 */
function bigSpec(models: number, shape: Shape): string {
  const comps: string[] = []
  for (let i = 0; i < models; i++) {
    const targets = refsOf(i, models, shape)
    const ref = targets
      .map((t, k) => `\n        ref${k}:\n          $ref: '#/components/schemas/M${t}'`)
      .join('')
    comps.push(`    M${i}:
      type: object
      required: [id]
      properties:
        id: { type: string }
        name: { type: string }
        count: { type: integer }
        tags: { type: array, items: { type: string } }${ref}`)
  }
  const paths = Array.from({ length: models }, (_, i) => `  /m${i}/{id}:
    get:
      operationId: getM${i}
      tags: [m${i % 12}]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        '200': { description: ok, content: { application/json: { schema: { $ref: '#/components/schemas/M${i}' } } } }`)
  return `openapi: 3.1.0
info: { title: Big, version: '1' }
paths:
${paths.join('\n')}
components:
  schemas:
${comps.join('\n')}
`
}

/** Which models `M{i}` references, per shape. Deterministic: no `Math.random`. */
function refsOf(i: number, models: number, shape: Shape): number[] {
  switch (shape) {
    case 'chain':
      return i > 0 ? [i - 1] : []
    case 'shallow':
      return i >= 5 ? [i % 5] : []
    case 'flat':
      return []
    case 'dense':
      // Three pseudo-random targets from a fixed LCG over the index.
      return [1, 2, 3].map((k) => (i * 1103515245 + k * 12345) % models).filter((t) => t !== i)
    case 'hub':
      return i < 8 ? [(i + 1) % 8] : [0, 1, 2, 3, 4, 5, 6, 7]
  }
}

// EVERY plugin. The previous bench left out `faker`, `components`, `atlas`
// and `docs` -- and `faker` was the one plugin that was not linear.
const CONFIG = resolveConfig({ input: 'x.yaml', output: 'out', plugins: [...ALL_PLUGINS] })
const FAKER_ONLY = resolveConfig({ input: 'x.yaml', output: 'out', plugins: ['schemas', 'faker'] })

const WARMUP = 5
const TRIALS = 21

function measure(fn: () => void): { median: number; spread: number } {
  for (let i = 0; i < WARMUP; i++) fn()
  const samples: number[] = []
  for (let i = 0; i < TRIALS; i++) {
    const t0 = performance.now()
    fn()
    samples.push(performance.now() - t0)
  }
  samples.sort((a, b) => a - b)
  const at = (q: number): number => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))] as number
  const median = at(0.5)
  // INTER-QUARTILE spread, not min-max. A single GC pause anywhere in the run
  // moves the max by a factor of two and would veto an otherwise clean row —
  // which is how a usable measurement gets thrown away and replaced by a guess.
  // The middle half is what the median is actually built on.
  return { median, spread: median === 0 ? 0 : (at(0.75) - at(0.25)) / median }
}

/** Least-squares slope of y on x, with the R² that says whether to believe it. */
function fit(points: readonly { x: number; y: number }[]): { slope: number; r2: number } {
  const n = points.length
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let sxy = 0
  let sxx = 0
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my)
    sxx += (p.x - mx) ** 2
  }
  const slope = sxx === 0 ? 0 : sxy / sxx
  const intercept = my - slope * mx
  let ssRes = 0
  let ssTot = 0
  for (const p of points) {
    ssRes += (p.y - (slope * p.x + intercept)) ** 2
    ssTot += (p.y - my) ** 2
  }
  return { slope, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot }
}

interface Row {
  shape: Shape
  models: number
  parse: { median: number; spread: number }
  gen: { median: number; spread: number }
  faker: { median: number; spread: number }
  /** Total bytes of every emitted file. Deterministic -- a count, not a timing. */
  outputBytes: number
  /** Process peak RSS after this row, in MB. A HIGH-WATER mark: monotonic. */
  peakRssMb: number
}

// Up to 2,000 models: past GitHub (989) and Stripe (1,537), which is where a
// super-linear pass stops being a curiosity.
const SIZES = [125, 250, 500, 1000, 2000]
const SHAPES: readonly Shape[] = ['chain', 'shallow', 'flat', 'dense', 'hub']
const rows: Row[] = []

for (const shape of SHAPES) {
  for (const models of SIZES) {
    const src = bigSpec(models, shape)
    const outputBytes = generate(src, CONFIG).files.reduce((n, f) => n + Buffer.byteLength(f.contents), 0)
    rows.push({
      shape,
      models,
      parse: measure(() => void loadOpenApi(src)),
      gen: measure(() => void generate(src, CONFIG)),
      faker: measure(() => void generate(src, FAKER_ONLY)),
      outputBytes,
      // `maxRSS` is KB in both node and bun.
      peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
    })
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ warmup: WARMUP, trials: TRIALS, rows }, null, 2))
} else {
  console.log(benchRuntimeBanner())
  const fmt = (m: { median: number; spread: number }): string => {
    const noisy = m.spread > 0.2
    return `${m.median.toFixed(1).padStart(7)}ms ${noisy ? `(±${(m.spread * 100).toFixed(0)}% NOISY)` : `(±${(m.spread * 100).toFixed(0)}%)`}`
  }
  let shape: Shape | undefined
  for (const r of rows) {
    if (r.shape !== shape) {
      shape = r.shape
      console.log(`\n--- ${shape} ---`)
    }
    console.log(
      `${String(r.models).padStart(4)} models | parse ${fmt(r.parse)} | generate(all) ${fmt(r.gen)} | schemas+faker ${fmt(r.faker)} | out ${(r.outputBytes / 1e6).toFixed(1)} MB | peak RSS ${r.peakRssMb} MB`,
    )
  }
  // The scaling read, from a least-squares fit over ALL sizes rather than a
  // ratio of two endpoints. An endpoint ratio inherits the noise of exactly two
  // samples and is unfalsifiable when either is bad; a fit uses every point and
  // reports how well the line actually holds, which is the difference between
  // a measurement and a number.
  console.log('\nscaling (least-squares fit over all sizes):')
  for (const s of SHAPES) {
    const mine = rows.filter((r) => r.shape === s)
    for (const [label, pick] of [
      ['parse', (r: Row) => r.parse],
      ['generate', (r: Row) => r.gen],
      ['faker', (r: Row) => r.faker],
    ] as const) {
      const pts = mine.map((r) => ({ x: Math.log(r.models), y: Math.log(pick(r).median) }))
      const { slope, r2 } = fit(pts)
      const worstSpread = Math.max(...mine.map((r) => pick(r).spread))
      // Both gates matter and they catch different things: a poor fit means the
      // curve is not a power law at all, while a wide spread means the points
      // themselves are unreliable however well a line happens to pass through
      // them.
      const verdict =
        r2 < 0.98
          ? `no clean power law (R²=${r2.toFixed(3)})`
          : worstSpread > 0.2
            ? `exponent ${slope.toFixed(2)} — TENTATIVE, a sample spread ±${(worstSpread * 100).toFixed(0)}%`
            : `exponent ${slope.toFixed(2)} (R²=${r2.toFixed(3)})`
      console.log(`  ${s.padEnd(8)} ${label.padEnd(9)} ${verdict}`)
    }
  }
  console.log(
    '\nAn exponent near 1.0 is linear; 2.0 is quadratic. A fit is only worth\n' +
      'reading when R² is high AND the samples behind it are tight — a line\n' +
      'through unreliable points is still a line.',
  )
}
