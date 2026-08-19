#!/usr/bin/env bun
/**
 * Playwright-driven ROW-COUNT SWEEP — does the Pyreon/Octane tie at 1,000 rows
 * hide a difference in SLOPE?
 *
 * The published suite measures one row count. At that size Pyreon and Octane
 * tie on `select row` and `partial update` (CI95 overlap). A tie at one point
 * is compatible with two very different claims — equal cost, or different
 * slopes crossing near that point — and `octane.tsrx`'s own header predicts the
 * second: a `useState` write dirties the whole component, so every item body
 * re-evaluates and selection is O(n) by construction, while `createSelector`
 * is O(1). This runner sweeps N to find out which it is.
 *
 * It inherits the fair-bench protocol wholesale — production `vite build`,
 * real Chromium, per-cell page isolation, `--expose-gc`, adaptive warmup,
 * median + bootstrap CI95 + CV, sample pooling across `--repeat` passes,
 * reshuffled execution order per pass — and adds three things the sweep needs:
 *
 *   1. A CELL is a (framework, rows) pair, and the shuffle is over CELLS, not
 *      frameworks. Shuffling only frameworks would leave every framework's
 *      20,000-row cell pinned to the same position in the sweep, so thermal
 *      drift across a long run would bias the largest sizes — the exact end of
 *      the range the conclusion rests on.
 *   2. Ordinary-least-squares fit of median against N per (framework, op), so
 *      the report shows the LINE, not just point medians. The claim under test
 *      is about slope; point medians cannot support or refute it.
 *   3. Machine load stamped around every pass. Anything above load 8 is called
 *      out in the output so a contaminated run cannot be quietly published.
 *
 * Usage:
 *   bun bench-crossover.ts                              # default sweep
 *   bun bench-crossover.ts --repeat 3                   # pool 3 passes
 *   bun bench-crossover.ts --rows 1000,10000            # subset of sizes
 *   bun bench-crossover.ts --frameworks Pyreon,Octane   # subset of arms
 *   bun bench-crossover.ts --target-ms 80               # sweep batch K (soundness check)
 *   bun bench-crossover.ts --json out.json
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import * as os from 'node:os'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const PORT = 4179

const ALL_FRAMEWORKS = ['Pyreon', 'Octane', 'SolidJS'] as const
const ALL_ROWS = [100, 1_000, 5_000, 10_000, 20_000]

/**
 * Resolution floor — MEASURED on the real page at startup, not assumed.
 *
 * `bench-fair.ts` hardcodes 0.1ms for Chromium's documented 100µs clamp. That
 * is the right number for a NON-ISOLATED page and the wrong one here:
 * `vite.config.ts` serves COOP `same-origin` + COEP `require-corp`, so the
 * benchmark page is cross-origin ISOLATED and the clamp is 5µs — verified with
 * `scripts/probe-clock.ts`, which reads 100µs on `about:blank` and 5µs on the
 * bench page in the same browser.
 *
 * The difference is not academic for this sweep: a 100µs floor would declare
 * every `swap` and `partial` direct median in the small-N cells unmeasurable
 * and throw away the cross-check that licenses the batch instrument. So the
 * floor is measured at startup and the measurement is printed, which also means
 * a Chromium version that changes the clamp cannot silently invalidate the
 * verdicts.
 */
let resolutionFloorMs = 0.1

/** Load average above which a run is considered contaminated. */
const LOAD_CEILING = 8

/**
 * How many clock quanta a DIRECT median must span before it is treated as a
 * measurement rather than a quantization artifact.
 *
 * "Above the floor" is too weak a test. A median of exactly one quantum is not
 * a measured duration — it is the statement "at least one tick elapsed", and
 * its relative error is 100%. Ten quanta caps the quantization error at ~10%,
 * which is the same order as the CV the suite already reports, so a direct
 * reading admitted by this rule is comparable to a batch reading rather than
 * silently an order of magnitude cruder.
 */
const DIRECT_MIN_QUANTA = 10

/** Ops measured on BOTH instruments. Batch names are the direct name + suffix. */
const OPS = ['select row', 'partial update (every 10th)', 'swap rows'] as const
const BATCH_SUFFIX = ' (batch cycle)'

interface BenchResult {
  name: string
  median: number
  p90: number
  min: number
  max: number
  runs: number
  ci95: [number, number]
  cv: number
  warmupUsed: number
  samples: number[]
}
interface SuiteResult {
  framework: string
  results: BenchResult[]
}
interface CrossoverMeta {
  framework: string
  rows: number
  targetMs: number
  k: Record<string, number>
}
interface Cell {
  framework: string
  rows: number
  results: BenchResult[]
  meta: CrossoverMeta | null
}

interface CliArgs {
  jsonOut: string | undefined
  frameworks: string[]
  rows: number[]
  repeat: number
  targetMs: number | undefined
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    jsonOut: undefined,
    frameworks: [...ALL_FRAMEWORKS],
    rows: [...ALL_ROWS],
    repeat: 1,
    targetMs: undefined,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json' && argv[i + 1]) args.jsonOut = argv[++i]
    else if (a === '--repeat' && argv[i + 1]) {
      const v = Number(argv[++i])
      if (Number.isInteger(v) && v >= 1 && v <= 20) args.repeat = v
    } else if (a === '--target-ms' && argv[i + 1]) {
      const v = Number(argv[++i])
      if (Number.isFinite(v) && v > 0) args.targetMs = v
    } else if (a === '--rows' && argv[i + 1]) {
      const parsed = (argv[++i] ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
      if (parsed.length > 0) args.rows = parsed
    } else if (a === '--frameworks' && argv[i + 1]) {
      const requested = (argv[++i] ?? '').split(',').map((s) => s.trim())
      const filtered = ALL_FRAMEWORKS.filter((f) => requested.includes(f))
      if (filtered.length > 0) args.frameworks = [...filtered]
    }
  }
  return args
}

function shuffled<T>(input: readonly T[]): T[] {
  const out = [...input]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = out[i]
    const b = out[j]
    if (a === undefined || b === undefined) continue
    out[i] = b
    out[j] = a
  }
  return out
}

function loadAvg1(): number {
  return os.loadavg()[0] ?? 0
}

function stampLoad(label: string): number {
  const l = loadAvg1()
  const flag = l > LOAD_CEILING ? '  ⚠ ABOVE CEILING — run is contaminated' : ''
  console.log(`[crossover] ${label}: load1=${l.toFixed(2)}${flag}`)
  return l
}

/**
 * Block until the machine is quiet, or give up loudly.
 *
 * This exists because the runner's OWN first step contaminates it: `bun run
 * build` compiles the whole benchmark and drives load into the 30s, and the
 * 1-minute load average decays slowly, so the first cells of pass 1 would be
 * measured on a machine still recovering from the build. That is not a
 * hypothetical — it was observed at load 31.5 on a sweep whose build had just
 * finished, i.e. every early cell was contaminated by the harness itself.
 *
 * Waiting is the fix rather than merely stamping, because a stamp only tells
 * you afterwards that the numbers should be thrown away.
 */
async function waitForQuietMachine(ceiling: number, maxWaitMs: number): Promise<void> {
  const started = Date.now()
  let l = loadAvg1()
  if (l <= ceiling) {
    console.log(`[crossover] machine already quiet (load1=${l.toFixed(2)} ≤ ${ceiling})`)
    return
  }
  console.log(`[crossover] waiting for machine to settle (load1=${l.toFixed(2)} > ${ceiling})…`)
  while (Date.now() - started < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 5_000))
    l = loadAvg1()
    process.stdout.write(`\r[crossover]   load1=${l.toFixed(2)}          `)
    if (l <= ceiling) {
      console.log(`\n[crossover] settled after ${Math.round((Date.now() - started) / 1000)}s`)
      return
    }
  }
  console.log(
    `\n[crossover] ⚠ still load1=${l.toFixed(2)} after ${Math.round(maxWaitMs / 1000)}s — ` +
      `PROCEEDING, but every verdict from this run is suspect`,
  )
}

/** Re-compute median + p90 + CI95 + CV from pooled samples (see bench-fair). */
function recomputeStats(name: string, pooled: number[], warmupMax: number): BenchResult {
  const sorted = [...pooled].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.floor((sorted.length - 1) * q)] ?? 0
  const mean = pooled.reduce((s, x) => s + x, 0) / pooled.length
  const stddev = Math.sqrt(
    pooled.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(pooled.length - 1, 1),
  )
  const RESAMPLES = 1000
  const medians: number[] = []
  for (let b = 0; b < RESAMPLES; b++) {
    const rs: number[] = []
    for (let i = 0; i < pooled.length; i++) {
      rs.push(pooled[Math.floor(Math.random() * pooled.length)] ?? 0)
    }
    rs.sort((x, y) => x - y)
    medians.push(rs[Math.floor((rs.length - 1) * 0.5)] ?? 0)
  }
  medians.sort((a, b) => a - b)
  return {
    name,
    median: at(0.5),
    p90: at(0.9),
    min: at(0),
    max: sorted[sorted.length - 1] ?? 0,
    runs: pooled.length,
    ci95: [
      medians[Math.floor((medians.length - 1) * 0.025)] ?? 0,
      medians[Math.floor((medians.length - 1) * 0.975)] ?? 0,
    ],
    cv: mean > 0 ? stddev / mean : 0,
    warmupUsed: warmupMax,
  samples: pooled,
  }
}

async function runCell(
  framework: string,
  rows: number,
  baseUrl: string,
  targetMs: number | undefined,
  browser: Awaited<ReturnType<typeof chromium.launch>>,
): Promise<Cell | null> {
  const ctx = await browser.newContext()
  const page: Page = await ctx.newPage()

  page.on('console', (msg) => {
    const t = msg.text()
    if (t.includes('failed') || t.includes('[bench]')) {
      console.error(`[chromium:${framework}@${rows}]`, t)
    }
  })
  page.on('pageerror', (err) =>
    console.error(`[chromium:${framework}@${rows}] pageerror:`, err.message),
  )

  try {
    const q = new URLSearchParams({
      mode: 'crossover',
      framework,
      rows: String(rows),
    })
    if (targetMs !== undefined) q.set('targetMs', String(targetMs))
    await page.goto(`${baseUrl}/?${q}`, { waitUntil: 'load' })

    await page.waitForFunction(
      () => {
        const t = document.getElementById('status')?.textContent ?? ''
        return t === 'Done ✓' || t.startsWith('FAILED')
      },
      null,
      { timeout: 600_000 },
    )

    const status = await page.evaluate(() => document.getElementById('status')?.textContent ?? '')
    if (status !== 'Done ✓') {
      console.error(`[crossover] ${framework}@${rows} did not finish: ${status}`)
      return null
    }

    const suites: SuiteResult[] = await page.evaluate(
      () => (globalThis as { __benchResults?: SuiteResult[] }).__benchResults ?? [],
    )
    const meta = await page.evaluate(
      () => (globalThis as { __crossoverMeta?: CrossoverMeta }).__crossoverMeta ?? null,
    )
    const suite = suites[0]
    if (!suite) return null
    return { framework, rows, results: suite.results, meta }
  } finally {
    await ctx.close()
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  console.log('[crossover] building benchmark…')
  execSync('bun run build', { cwd: HERE, stdio: 'inherit' })

  console.log(`[crossover] starting preview on :${PORT}`)
  const preview: ChildProcess = spawn('bun', ['x', 'vite', 'preview', '--port', String(PORT)], {
    cwd: HERE,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise<void>((res, rej) => {
    const timeout = setTimeout(() => rej(new Error('preview server start timeout')), 20_000)
    preview.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('Local:')) {
        clearTimeout(timeout)
        res()
      }
    })
    preview.on('exit', (code) => rej(new Error(`preview exited with code ${code}`)))
  })

  const browser = await chromium.launch({
    headless: true,
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  })
  const chromiumVersion = browser.version()
  const baseUrl = `http://localhost:${PORT}`

  // Measure the clock BEFORE measuring anything with it. Under a clamp every
  // observed delta is a multiple of the quantum, so the smallest non-zero
  // forward delta IS the quantum. See `scripts/probe-clock.ts`.
  const clock = await (async () => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await page.goto(baseUrl, { waitUntil: 'load' })
      return await page.evaluate(() => {
        let min = Number.POSITIVE_INFINITY
        for (let round = 0; round < 8; round++) {
          let prev = performance.now()
          for (let i = 0; i < 200_000; i++) {
            const now = performance.now()
            const d = now - prev
            if (d > 0) {
              if (d < min) min = d
              prev = now
            }
          }
        }
        return {
          isolated: globalThis.crossOriginIsolated ?? false,
          quantumMs: Number.isFinite(min) ? min : 0.1,
        }
      })
    } finally {
      await ctx.close()
    }
  })()
  resolutionFloorMs = clock.quantumMs
  console.log(
    `[crossover] clock: quantum ${(clock.quantumMs * 1000).toFixed(1)}µs ` +
      `(crossOriginIsolated=${clock.isolated}) — this is the resolution floor, measured not assumed`,
  )

  const plan: Array<{ framework: string; rows: number }> = []
  for (const f of args.frameworks) for (const r of args.rows) plan.push({ framework: f, rows: r })

  console.log(
    `[crossover] ${plan.length} cells × ${args.repeat} pass(es) — ` +
      `frameworks=${args.frameworks.join(',')} rows=${args.rows.join(',')}`,
  )

  // The build above is itself a load spike — settle before measuring anything.
  await waitForQuietMachine(LOAD_CEILING, 300_000)

  const loadSamples: number[] = []
  // pooled[framework][rows][opName] -> samples
  const pooled = new Map<string, Map<number, Map<string, number[]>>>()
  const metaByCell = new Map<string, CrossoverMeta>()
  /** Cell-passes thrown away for load — reported, never silently dropped. */
  const discarded: Array<{ cell: string; pass: number; load: number }> = []
  /** Surviving passes per cell, so an unbalanced pool is visible in the report. */
  const keptPasses = new Map<string, number>()

  for (let pass = 0; pass < args.repeat; pass++) {
    // Shuffle over CELLS, not frameworks — see the header. Reshuffled every
    // pass so slot position becomes noise the sample pool cancels rather than
    // a constant bias on the same cell.
    const order = shuffled(plan)
    console.log(`[crossover] === pass ${pass + 1}/${args.repeat} ===`)
    loadSamples.push(stampLoad(`pass ${pass + 1} start`))
    for (const { framework, rows } of order) {
      // Per-CELL load, not just per-pass. A pass-level stamp cannot tell you
      // WHICH cells were measured under load, and a sweep is long enough that
      // something else on the machine can start and stop inside one pass.
      const cellLoad = loadAvg1()
      loadSamples.push(cellLoad)
      process.stdout.write(`[crossover]   ▸ ${framework} @ ${rows} (load ${cellLoad.toFixed(2)})… `)
      const cell = await runCell(framework, rows, baseUrl, args.targetMs, browser)
      if (!cell) {
        console.log('FAILED')
        continue
      }
      // DISCARD, don't just flag. A contaminated cell that still enters the
      // pool silently drags the pooled median and widens the CI — and pooling
      // is precisely the step that makes the contamination untraceable
      // afterwards. Machine load is not uniform over a 100-cell sweep: another
      // session's build can start halfway through, so "the run was quiet at the
      // start" is not a property of the run.
      const key = `${framework}@${rows}`
      if (cellLoad > LOAD_CEILING) {
        discarded.push({ cell: key, pass: pass + 1, load: cellLoad })
        console.log(`DISCARDED — load ${cellLoad.toFixed(2)} > ${LOAD_CEILING}`)
        continue
      }
      console.log(`ok (K: ${JSON.stringify(cell.meta?.k ?? {})})`)
      if (cell.meta) metaByCell.set(key, cell.meta)
      keptPasses.set(key, (keptPasses.get(key) ?? 0) + 1)
      const byRows = pooled.get(framework) ?? new Map<number, Map<string, number[]>>()
      const byOp = byRows.get(rows) ?? new Map<string, number[]>()
      for (const r of cell.results) {
        const acc = byOp.get(r.name) ?? []
        for (const s of r.samples) acc.push(s)
        byOp.set(r.name, acc)
      }
      byRows.set(rows, byOp)
      pooled.set(framework, byRows)
    }
    loadSamples.push(stampLoad(`pass ${pass + 1} end`))
  }

  await browser.close()
  preview.kill('SIGTERM')

  // Collapse pools into stats.
  const stats = new Map<string, Map<number, Map<string, BenchResult>>>()
  for (const [framework, byRows] of pooled) {
    const outRows = new Map<number, Map<string, BenchResult>>()
    for (const [rows, byOp] of byRows) {
      const outOps = new Map<string, BenchResult>()
      for (const [name, samples] of byOp) outOps.set(name, recomputeStats(name, samples, 0))
      outRows.set(rows, outOps)
    }
    stats.set(framework, outRows)
  }

  printMachineStamp(chromiumVersion, loadSamples)
  printDiscards(args, discarded, keptPasses)
  printKTable(args, metaByCell)
  printInstrumentAgreement(args, stats)
  printPerOpTables(args, stats)
  printSlopes(args, stats)
  printCrossover(args, stats)

  if (args.jsonOut) {
    const out = {
      generatedAt: new Date().toISOString(),
      sha: currentSha(),
      chromiumVersion,
      loadSamples,
      clock,
      discarded,
      keptPasses: Object.fromEntries(keptPasses),
      methodology: {
        loadCeiling: LOAD_CEILING,
        directMinQuanta: DIRECT_MIN_QUANTA,
        repeat: args.repeat,
        rows: args.rows,
        frameworks: args.frameworks,
        targetMsOverride: args.targetMs ?? null,
        note:
          'One batch cycle = reset + op = TWO equivalent operations; per-operation = per-cycle / 2.',
      },
      k: Object.fromEntries(metaByCell),
      cells: [...stats].flatMap(([framework, byRows]) =>
        [...byRows].map(([rows, byOp]) => ({
          framework,
          rows,
          results: [...byOp.values()],
        })),
      ),
    }
    writeFileSync(args.jsonOut, JSON.stringify(out, null, 2))
    console.log(`\n[crossover] JSON written to ${args.jsonOut}`)
  }
}

// ─── Reporting ───────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.padStart(n)
}
function fmtMs(ms: number): string {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(1)}ns`
  return ms < 1 ? `${(ms * 1000).toFixed(1)}µs` : `${ms.toFixed(2)}ms`
}

function get(
  stats: Map<string, Map<number, Map<string, BenchResult>>>,
  f: string,
  rows: number,
  op: string,
): BenchResult | undefined {
  return stats.get(f)?.get(rows)?.get(op)
}

/**
 * Per-OPERATION cost from a batch cycle. Every cycle in this suite is
 * `reset(); fn()` where reset is the op's own inverse and costs the same, so
 * one cycle is two operations. Halving is done here, once, and the raw
 * per-cycle number stays in the JSON so the division is auditable.
 */
function perOp(cycleMs: number): number {
  return cycleMs / 2
}

function printMachineStamp(chromiumVersion: string, loadSamples: number[]): void {
  const cpus = os.cpus()
  console.log()
  console.log('Machine')
  console.log('─'.repeat(78))
  console.log(`  CPU:      ${cpus[0]?.model ?? 'unknown'} (${cpus.length} logical cores)`)
  console.log(`  RAM:      ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`)
  console.log(`  OS:       ${os.platform()} ${os.release()}`)
  console.log(`  Chromium: ${chromiumVersion}`)
  const max = Math.max(...loadSamples, 0)
  console.log(
    `  Load1:    ${loadSamples.map((l) => l.toFixed(2)).join(' → ')}  (max ${max.toFixed(2)}` +
      `${max > LOAD_CEILING ? ' ⚠ CONTAMINATED' : ' ✓ within ceiling'})`,
  )
}

/**
 * Report what was thrown away and how balanced the surviving pool is.
 *
 * A discard is only honest if it is VISIBLE: silently dropping cell-passes
 * turns "the machine was busy" into an invisible selection effect on the data.
 * Printing the surviving pass count per cell also exposes the case that
 * actually invalidates a comparison — one arm measured over 5 passes and
 * another over 1, which makes their CI widths incomparable even though both
 * look like clean numbers.
 */
function printDiscards(
  args: CliArgs,
  discarded: Array<{ cell: string; pass: number; load: number }>,
  keptPasses: Map<string, number>,
): void {
  console.log()
  console.log('Contaminated cell-passes DISCARDED (load > ceiling, excluded from every pool)')
  console.log('─'.repeat(78))
  if (discarded.length === 0) {
    console.log('  none — every cell-pass was measured at or below the load ceiling')
  } else {
    for (const d of discarded) {
      console.log(`  ${d.cell.padEnd(24)} pass ${d.pass}   load ${d.load.toFixed(2)}`)
    }
  }
  const counts: number[] = []
  const thin: string[] = []
  for (const f of args.frameworks) {
    for (const r of args.rows) {
      const key = `${f}@${r}`
      const kept = keptPasses.get(key) ?? 0
      counts.push(kept)
      if (kept < args.repeat) thin.push(`${key}=${kept}/${args.repeat}`)
    }
  }
  const min = counts.length ? Math.min(...counts) : 0
  console.log(
    `  surviving passes per cell: min ${min}/${args.repeat}` +
      (thin.length ? ` — below full: ${thin.join(', ')}` : ' — all cells at full depth'),
  )
  if (min === 0) {
    console.log('  ⚠ at least one cell has NO clean data — its column is not a measurement')
  }
}

function printKTable(
  args: CliArgs,
  metaByCell: Map<string, CrossoverMeta>,
): void {
  console.log()
  console.log('Calibrated batch K per cell (cycles inside one timed region)')
  console.log(
    '(K is chosen so every region lands near the same wall-clock duration, so a fast arm and a',
  )
  console.log(' slow arm get the SAME dilution of the 100µs clock quantum — see crossover-shared.ts)')
  console.log('─'.repeat(78))
  console.log(`${'cell'.padEnd(22)}${pad('select', 14)}${pad('partial', 14)}${pad('swap', 14)}`)
  for (const f of args.frameworks) {
    for (const r of args.rows) {
      const m = metaByCell.get(`${f}@${r}`)
      if (!m) continue
      console.log(
        `${`${f} @ ${r}`.padEnd(22)}${pad(String(m.k.select ?? '—'), 14)}` +
          `${pad(String(m.k.partial ?? '—'), 14)}${pad(String(m.k.swap ?? '—'), 14)}`,
      )
    }
  }
}

/**
 * The batch instrument's licence to be believed.
 *
 * Where the DIRECT median is above the clock floor, the two instruments are
 * measuring the same quantity by different means and must agree. Cells where
 * direct is below the floor are the ones the batch instrument exists for, and
 * are marked as such rather than silently compared.
 */
function printInstrumentAgreement(
  args: CliArgs,
  stats: Map<string, Map<number, Map<string, BenchResult>>>,
): void {
  console.log()
  console.log('Instrument agreement — direct (per-op) vs batch (per-cycle ÷ 2)')
  console.log('(a cell above the clock floor must agree; a cell below it is why batch exists)')
  console.log('─'.repeat(78))
  console.log(
    `${'op / cell'.padEnd(40)}${pad('direct', 12)}${pad('batch', 12)}${pad('ratio', 18)}`,
  )
  const trustworthy = (m: number) => m >= resolutionFloorMs * DIRECT_MIN_QUANTA
  for (const op of OPS) {
    for (const f of args.frameworks) {
      for (const r of args.rows) {
        const d = get(stats, f, r, op)
        const b = get(stats, f, r, op + BATCH_SUFFIX)
        if (!d || !b) continue
        const bo = perOp(b.median)
        // NOTE the two instruments are not measuring the same thing for the
        // direct arm of `select`/`partial`: the direct timed region also
        // contains the forced layout flush for a fresh state, which at large N
        // is real browser work. The comparison is a sanity check on ORDER OF
        // MAGNITUDE and on the sign of the framework gap, not a claim that the
        // ratio should be exactly 1.00.
        const verdict = trustworthy(d.median)
          ? `${(d.median / bo).toFixed(2)}×`
          : `< ${DIRECT_MIN_QUANTA} quanta`
        console.log(
          `${`${op} · ${f}@${r}`.padEnd(40)}${pad(fmtMs(d.median), 12)}` +
            `${pad(fmtMs(bo), 12)}${pad(verdict, 18)}`,
        )
      }
    }
  }
}

function printPerOpTables(
  args: CliArgs,
  stats: Map<string, Map<number, Map<string, BenchResult>>>,
): void {
  for (const op of OPS) {
    console.log()
    console.log(`${op} — per-operation cost by row count (batch instrument, cycle ÷ 2)`)
    console.log('median [CI95] cv%')
    console.log('─'.repeat(30 + args.frameworks.length * 30))
    console.log(`${'rows'.padEnd(10)}${args.frameworks.map((f) => pad(f, 30)).join('')}`)
    for (const r of args.rows) {
      const cells = args.frameworks.map((f) => {
        const b = get(stats, f, r, op + BATCH_SUFFIX)
        if (!b) return pad('—', 30)
        return pad(
          `${fmtMs(perOp(b.median))} [${fmtMs(perOp(b.ci95[0]))}–${fmtMs(perOp(b.ci95[1]))}] cv${(b.cv * 100).toFixed(0)}%`,
          30,
        )
      })
      console.log(`${String(r).padEnd(10)}${cells.join('')}`)
    }
  }
}

interface Fit {
  slope: number
  intercept: number
  r2: number
  n: number
}

/** Ordinary least squares of y on x. */
function fit(points: Array<[number, number]>): Fit | null {
  const n = points.length
  if (n < 2) return null
  const mx = points.reduce((s, p) => s + p[0], 0) / n
  const my = points.reduce((s, p) => s + p[1], 0) / n
  let sxy = 0
  let sxx = 0
  for (const [x, y] of points) {
    sxy += (x - mx) * (y - my)
    sxx += (x - mx) ** 2
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  const intercept = my - slope * mx
  let ssRes = 0
  let ssTot = 0
  for (const [x, y] of points) {
    ssRes += (y - (slope * x + intercept)) ** 2
    ssTot += (y - my) ** 2
  }
  return { slope, intercept, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot, n }
}

function fitFor(
  args: CliArgs,
  stats: Map<string, Map<number, Map<string, BenchResult>>>,
  f: string,
  op: string,
): Fit | null {
  const pts: Array<[number, number]> = []
  for (const r of args.rows) {
    const b = get(stats, f, r, op + BATCH_SUFFIX)
    if (b) pts.push([r, perOp(b.median)])
  }
  return fit(pts)
}

/**
 * The claim under test is about SLOPE, so the slope is the headline, not the
 * point medians. A flat line and a rising line are a different result from two
 * equal points, and only the fit can tell them apart.
 */
function printSlopes(
  args: CliArgs,
  stats: Map<string, Map<number, Map<string, BenchResult>>>,
): void {
  console.log()
  console.log('PER-ROW SLOPE — OLS fit of per-operation cost against row count')
  console.log('(slope in ns per row; a flat line is O(1) in list length, a rising line is O(n))')
  console.log('─'.repeat(96))
  console.log(
    `${'op'.padEnd(30)}${'framework'.padEnd(12)}${pad('slope ns/row', 16)}` +
      `${pad('intercept', 14)}${pad('R²', 10)}${pad('cost@20k from slope', 22)}`,
  )
  for (const op of OPS) {
    for (const f of args.frameworks) {
      const ft = fitFor(args, stats, f, op)
      if (!ft) continue
      console.log(
        `${op.padEnd(30)}${f.padEnd(12)}${pad((ft.slope * 1_000_000).toFixed(3), 16)}` +
          `${pad(fmtMs(ft.intercept), 14)}${pad(ft.r2.toFixed(4), 10)}` +
          `${pad(fmtMs(ft.slope * 20_000 + ft.intercept), 22)}`,
      )
    }
  }
}

/**
 * Empirical crossover — the smallest measured N at which one framework is
 * faster AND the CI95 intervals no longer overlap.
 *
 * Deliberately NOT a model extrapolation. A fitted line can be solved for a
 * crossing at any N, including sizes nobody ever measured; that number would
 * be a property of the regression, not of the frameworks. The honest answer to
 * "where do they separate" is the smallest size at which the separation was
 * actually observed with non-overlapping intervals, so that is what is
 * reported. The fitted lines above are for the SHAPE (flat vs rising); this
 * table is for the CLAIM.
 */
function printCrossover(
  args: CliArgs,
  stats: Map<string, Map<number, Map<string, BenchResult>>>,
): void {
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < args.frameworks.length; i++) {
    for (let j = i + 1; j < args.frameworks.length; j++) {
      const a = args.frameworks[i]
      const b = args.frameworks[j]
      if (a && b) pairs.push([a, b])
    }
  }

  console.log()
  console.log('SEPARATION BY ROW COUNT (batch instrument, per-operation)')
  console.log('🤝 = CI95 overlap (tie within noise) · a name = that framework faster, intervals disjoint')
  console.log('─'.repeat(96))
  for (const op of OPS) {
    console.log(`\n  ${op}`)
    console.log(`  ${'pair'.padEnd(24)}${args.rows.map((r) => pad(String(r), 22)).join('')}`)
    for (const [x, y] of pairs) {
      const cells = args.rows.map((r) => {
        const bx = get(stats, x, r, op + BATCH_SUFFIX)
        const by = get(stats, y, r, op + BATCH_SUFFIX)
        if (!bx || !by) return pad('—', 22)
        const mx = perOp(bx.median)
        const my = perOp(by.median)
        const [lox, hix] = [perOp(bx.ci95[0]), perOp(bx.ci95[1])]
        const [loy, hiy] = [perOp(by.ci95[0]), perOp(by.ci95[1])]
        const overlap = lox <= hiy && loy <= hix
        if (overlap) return pad('🤝 tie', 22)
        const winner = mx < my ? x : y
        const ratio = mx < my ? my / mx : mx / my
        return pad(`${winner} ${ratio.toFixed(2)}×`, 22)
      })
      console.log(`  ${`${x} vs ${y}`.padEnd(24)}${cells.join('')}`)
    }
  }
}

function currentSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8', cwd: HERE }).trim()
  } catch {
    return 'unknown'
  }
}

main().catch((err: Error) => {
  console.error('[crossover]', err.message)
  process.exit(1)
})
