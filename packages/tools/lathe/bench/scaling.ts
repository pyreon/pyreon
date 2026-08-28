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
 * Run: `bun bench/scaling.ts` (add `--json` for machine-readable output).
 */
import { resolveConfig } from '../src/core/config'
import { generate } from '../src/core/generate'
import { loadOpenApi } from '../src/input/openapi'

type Shape = 'chain' | 'shallow' | 'flat'

/**
 * `chain`   — each model refs the previous. A worst case for anything that
 *             walks the dependency graph, and NOT a real spec shape.
 * `shallow` — each model refs one of the first five. Wide and flat, which is
 *             what a real API looks like.
 * `flat`    — no refs at all. The floor.
 */
function bigSpec(models: number, shape: Shape): string {
  const comps: string[] = []
  for (let i = 0; i < models; i++) {
    const target = shape === 'chain' ? (i > 0 ? i - 1 : -1) : shape === 'shallow' ? (i >= 5 ? i % 5 : -1) : -1
    const ref = target >= 0 ? `\n        parent:\n          $ref: '#/components/schemas/M${target}'` : ''
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

const CONFIG = resolveConfig({
  input: 'x.yaml',
  output: 'out',
  plugins: ['types', 'schemas', 'client', 'queries', 'mocks'],
} as never)

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
}

const SIZES = [100, 200, 400, 800]
const rows: Row[] = []

for (const shape of ['chain', 'shallow', 'flat'] as const) {
  for (const models of SIZES) {
    const src = bigSpec(models, shape)
    rows.push({
      shape,
      models,
      parse: measure(() => void loadOpenApi(src)),
      gen: measure(() => void generate(src, CONFIG)),
    })
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ warmup: WARMUP, trials: TRIALS, rows }, null, 2))
} else {
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
    console.log(`${String(r.models).padStart(4)} models | parse ${fmt(r.parse)} | generate ${fmt(r.gen)}`)
  }
  // The scaling read, from a least-squares fit over ALL sizes rather than a
  // ratio of two endpoints. An endpoint ratio inherits the noise of exactly two
  // samples and is unfalsifiable when either is bad; a fit uses every point and
  // reports how well the line actually holds, which is the difference between
  // a measurement and a number.
  console.log('\nscaling (least-squares fit over all sizes):')
  for (const s of ['chain', 'shallow', 'flat'] as const) {
    const mine = rows.filter((r) => r.shape === s)
    for (const [label, pick] of [
      ['parse', (r: Row) => r.parse],
      ['generate', (r: Row) => r.gen],
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
