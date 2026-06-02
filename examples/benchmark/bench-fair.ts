#!/usr/bin/env bun
/**
 * Playwright-driven fair benchmark runner.
 *
 * Methodology — designed for objectivity:
 *
 *   1. `vite preview` serves the production-built benchmark HTML.
 *   2. **Per-framework page isolation**: each framework runs in its
 *      OWN fresh page-load (`page.goto('?framework=<name>')`) so no
 *      cross-suite memory pressure, no heap-bias on later frameworks,
 *      no JIT cache poisoning from earlier suites. The legacy
 *      single-page `?auto=1` flow is retained for the in-browser
 *      button UI but is NOT what this runner uses.
 *   3. Chromium launches with `--js-flags=--expose-gc` so the runner
 *      can `globalThis.gc()` between iterations — removes the
 *      dominant source of inter-run variance.
 *   4. Adaptive warmup (`runner.ts` `STABILIZE_TOLERANCE = 10%`)
 *      keeps warming until the JS engine reaches steady state. Bounded
 *      by `WARMUP_MAX = 15`. Strictly more objective than fixed-5
 *      warmup which over-warms stable frameworks and under-warms
 *      jittery ones.
 *   5. After warmup, 20 timed runs are collected. Median + p90 are
 *      reported with a **95% bootstrap CI** on the median (1000
 *      resamples) and a **coefficient of variation** so the reader
 *      can tell a 5% delta apart from noise.
 *   6. DOM verification at every iteration (`expectRows`/
 *      `expectRowsWithSelected`) — frameworks that fail to commit
 *      before the bench timer ends throw and surface as a console
 *      error rather than producing deceptively-fast numbers.
 *   7. Optional CPU throttling via CDP (`--throttle 4` for 4×
 *      slowdown — mimics mid-tier devices). Off by default; the
 *      uncongested numbers are the reference.
 *
 * vs `bench-cli.ts` (happy-dom + Bun) — that runner is fundamentally
 * unfair because:
 *   - happy-dom has no real layout/paint;
 *   - it doesn't verify React/Vue/Preact/Solid/Svelte actually rendered;
 *   - sub-millisecond numbers are below performance.now() resolution.
 *
 * This runner is real Chromium, real DOM, with DOM verification at every
 * step. Numbers are median + p90 + CI95 + CV across 20 timed runs (5-15
 * adaptive warmup discarded).
 *
 * Usage:
 *   bun bench-fair.ts                                # human-readable
 *   bun bench-fair.ts --json out.json                # JSON dump too
 *   bun bench-fair.ts --baseline <path>              # compare to baseline JSON
 *   bun bench-fair.ts --throttle 4                   # 4× CPU slowdown via CDP
 *   bun bench-fair.ts --frameworks Pyreon,Solid      # restrict to subset
 *   bun bench-fair.ts --repeat 4                     # 4 full passes; pools 20×4=80 samples per test for tighter CI95
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const PORT = 4178

const ALL_FRAMEWORKS = [
  'Vanilla JS',
  'Preact',
  'React 19',
  'Vue 3',
  'SolidJS',
  'Svelte 5',
  'Pyreon',
  'Pyreon (compiled)',
] as const

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
  /** Raw samples — surfaced by `src/runner.ts` for sample-pooling across --repeat N runs. */
  samples: number[]
}
interface SuiteResult {
  framework: string
  results: BenchResult[]
}

interface CliArgs {
  jsonOut: string | undefined
  baseline: string | undefined
  throttle: number | undefined
  frameworks: readonly string[]
  /**
   * Repeat the entire per-framework page-isolation loop N times,
   * pooling the 20×N samples per test for a tighter CI95. N=1 (default)
   * is the current behavior (20 samples per test). N=3-5 is appropriate
   * when sub-millisecond medians live at the performance.now() floor
   * and run-to-run variance is the dominant source of noise.
   */
  repeat: number
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    jsonOut: undefined,
    baseline: undefined,
    throttle: undefined,
    frameworks: ALL_FRAMEWORKS,
    repeat: 1,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json' && argv[i + 1]) {
      args.jsonOut = argv[++i]
    } else if (a === '--baseline' && argv[i + 1]) {
      args.baseline = argv[++i]
    } else if (a === '--throttle' && argv[i + 1]) {
      const v = Number(argv[++i])
      if (Number.isFinite(v) && v > 0) args.throttle = v
    } else if (a === '--repeat' && argv[i + 1]) {
      const v = Number(argv[++i])
      // Clamp [1, 20] — beyond ~20 the cost of running the whole bench
      // outpaces the marginal CI95 tightening from more samples.
      if (Number.isInteger(v) && v >= 1 && v <= 20) args.repeat = v
    } else if (a === '--frameworks' && argv[i + 1]) {
      const next = argv[++i]
      if (next) {
        const requested = next.split(',').map((s) => s.trim())
        const filtered = ALL_FRAMEWORKS.filter((f) => requested.includes(f))
        if (filtered.length > 0) args.frameworks = filtered
      }
    }
  }
  return args
}

/**
 * Re-compute median + p90 + CI95 + CV from a pooled samples array.
 * Used by `--repeat N` to aggregate 20×N samples into a single result
 * with tighter CI95 than any individual run.
 */
function recomputeStats(name: string, pooledSamples: number[], warmupUsedMax: number): BenchResult {
  const sorted = [...pooledSamples].sort((a, b) => a - b)
  const median = sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0
  const p90 = sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 0
  const min = sorted[0] ?? 0
  const max = sorted[sorted.length - 1] ?? 0
  const mean = pooledSamples.reduce((s, x) => s + x, 0) / pooledSamples.length
  const stddev = Math.sqrt(
    pooledSamples.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(pooledSamples.length - 1, 1),
  )
  const cv = mean > 0 ? stddev / mean : 0

  // 95% bootstrap CI on the median over the pooled samples — uses the
  // same 1000-resample non-parametric bootstrap as `runner.ts`. Pooling
  // 20×N samples roughly halves the CI95 width per √N (statistical
  // power), so 4 runs ≈ half the noise of 1 run.
  const RESAMPLES = 1000
  const medians: number[] = []
  for (let b = 0; b < RESAMPLES; b++) {
    const resample: number[] = []
    for (let i = 0; i < pooledSamples.length; i++) {
      resample.push(pooledSamples[Math.floor(Math.random() * pooledSamples.length)] ?? 0)
    }
    resample.sort((a, b2) => a - b2)
    medians.push(resample[Math.floor((resample.length - 1) * 0.5)] ?? 0)
  }
  medians.sort((a, b) => a - b)
  const ci95: [number, number] = [
    medians[Math.floor((medians.length - 1) * 0.025)] ?? 0,
    medians[Math.floor((medians.length - 1) * 0.975)] ?? 0,
  ]

  return {
    name,
    median,
    p90,
    min,
    max,
    runs: pooledSamples.length,
    ci95,
    cv,
    warmupUsed: warmupUsedMax,
    samples: pooledSamples,
  }
}

/**
 * Aggregate N independent SuiteResult arrays into one — pools the
 * per-test `samples` across runs, then recomputes median + CI95 + CV
 * over the full pool.
 */
function aggregateRepeated(runs: SuiteResult[][]): SuiteResult[] {
  if (runs.length === 0) return []
  const first = runs[0]
  if (!first || first.length === 0) return []
  // For each framework × test, pool samples across runs.
  return first.map((suite, suiteIdx) => ({
    framework: suite.framework,
    results: suite.results.map((result, testIdx) => {
      // Collect samples + max warmupUsed across all runs for this (framework, test)
      const pooled: number[] = []
      let warmupMax = 0
      for (const run of runs) {
        const r = run[suiteIdx]?.results[testIdx]
        if (r?.samples) {
          for (const s of r.samples) pooled.push(s)
          if (r.warmupUsed > warmupMax) warmupMax = r.warmupUsed
        }
      }
      return recomputeStats(result.name, pooled, warmupMax)
    }),
  }))
}

async function runOneFramework(
  framework: string,
  baseUrl: string,
  throttleRate: number | undefined,
  browser: Awaited<ReturnType<typeof chromium.launch>>,
): Promise<SuiteResult | null> {
  const ctx = await browser.newContext()
  const page: Page = await ctx.newPage()

  page.on('console', (msg) => {
    const t = msg.text()
    if (t.includes('benchmark failed') || t.includes('[bench]')) {
      console.error(`[chromium:${framework}]`, t)
    }
  })
  page.on('pageerror', (err) => console.error(`[chromium:${framework}] pageerror:`, err.message))

  // Apply CPU throttling via CDP if requested. 1 = no throttle, 4 =
  // 4× slowdown (typical mid-tier device target). Has to happen
  // BEFORE the navigation so the page-eval cost is throttled too.
  if (throttleRate && throttleRate > 1) {
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttleRate })
  }

  try {
    const url = `${baseUrl}/?framework=${encodeURIComponent(framework)}`
    await page.goto(url, { waitUntil: 'load' })

    await page.waitForFunction(
      () => document.getElementById('status')?.textContent === 'Done ✓',
      null,
      { timeout: 180_000 },
    )

    const suites: SuiteResult[] = await page.evaluate(
      () => (globalThis as { __benchResults?: SuiteResult[] }).__benchResults ?? [],
    )

    if (suites.length !== 1) {
      console.error(`[bench-fair] ${framework}: expected 1 suite, got ${suites.length}`)
      return null
    }
    return suites[0] ?? null
  } finally {
    await ctx.close()
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  // Build the benchmark for production — real bundler output, real minification.
  console.log('[bench-fair] building benchmark…')
  execSync('bun run build', { cwd: HERE, stdio: 'inherit' })

  console.log(`[bench-fair] starting preview on :${PORT}`)
  const preview: ChildProcess = spawn('bun', ['x', 'vite', 'preview', '--port', String(PORT)], {
    cwd: HERE,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await new Promise<void>((res, rej) => {
    const timeout = setTimeout(() => rej(new Error('preview server start timeout')), 10_000)
    preview.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('Local:')) {
        clearTimeout(timeout)
        res()
      }
    })
    preview.on('exit', (code) => rej(new Error(`preview exited with code ${code}`)))
  })

  // `--expose-gc` lets `runner.ts` call `globalThis.gc()` between
  // iterations to neutralise GC variance. The optional chain in
  // `forceGc()` short-circuits if the flag isn't honoured.
  console.log('[bench-fair] launching Chromium with --expose-gc…')
  const browser = await chromium.launch({
    headless: true,
    args: ['--js-flags=--expose-gc'],
  })

  const baseUrl = `http://localhost:${PORT}`
  if (args.throttle && args.throttle > 1) {
    console.log(`[bench-fair] CPU throttling enabled — rate ${args.throttle}×`)
  }
  console.log(
    `[bench-fair] running ${args.frameworks.length} framework(s) — each in a fresh page…`,
  )
  if (args.repeat > 1) {
    console.log(
      `[bench-fair] --repeat ${args.repeat} → pooling ${args.repeat * 20} samples per test for tighter CI95`,
    )
  }

  // Per-repeat data: each entry is one full SuiteResult[] (one full sweep).
  // Final reported numbers are the AGGREGATE — sample-pooled across all repeats.
  const allRuns: SuiteResult[][] = []
  for (let r = 0; r < args.repeat; r++) {
    if (args.repeat > 1) console.log(`[bench-fair] === repeat pass ${r + 1}/${args.repeat} ===`)
    const suites: SuiteResult[] = []
    for (const framework of args.frameworks) {
      console.log(`[bench-fair]   ▸ ${framework}`)
      const suite = await runOneFramework(framework, baseUrl, args.throttle, browser)
      if (suite) suites.push(suite)
    }
    if (suites.length === 0) {
      console.error(
        `[bench-fair] no results from repeat pass ${r + 1} — check console output above`,
      )
      await browser.close()
      preview.kill('SIGTERM')
      process.exit(1)
    }
    allRuns.push(suites)
  }

  await browser.close()
  preview.kill('SIGTERM')

  // Single pass → use the run directly (preserves exact stats from `runner.ts`).
  // Multiple passes → pool samples + recompute stats over the bigger sample set.
  const suites: SuiteResult[] =
    args.repeat === 1 && allRuns[0] ? allRuns[0] : aggregateRepeated(allRuns)

  printMarkdownTable(suites)

  // Optional JSON dump for diff / archival.
  if (args.jsonOut) {
    const sha = currentSha()
    const out = {
      generatedAt: new Date().toISOString(),
      sha,
      throttleRate: args.throttle ?? 1,
      methodology: {
        warmupMin: 5,
        warmupMax: 15,
        stabilizeTolerance: 0.10,
        runs: 20,
        bootstrapResamples: 1000,
        pageIsolation: 'per-framework',
        exposeGc: true,
        repeat: args.repeat,
        pooledSamplesPerTest: args.repeat * 20,
      },
      suites,
    }
    writeFileSync(args.jsonOut, JSON.stringify(out, null, 2))
    console.log(`\n[bench-fair] JSON written to ${args.jsonOut}`)
  }

  // Optional baseline comparison.
  if (args.baseline) {
    if (!existsSync(args.baseline)) {
      console.error(`[bench-fair] baseline file not found: ${args.baseline}`)
      process.exit(1)
    }
    const baseline = JSON.parse(readFileSync(args.baseline, 'utf-8')) as { suites: SuiteResult[] }
    printDiffTable(baseline.suites, suites)
  }
}

function pad(s: string, n: number): string {
  return s.padStart(n)
}

function fmtMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`
}

/**
 * Cell rendering: `<median>ms [<lo>-<hi>] cv=<n>` so the reader sees
 * the bootstrap CI and stability indicator alongside the median.
 * Narrower CI = more reliable; lower CV = less jitter.
 */
function fmtCell(r: BenchResult): string {
  return `${fmtMs(r.median)} [${fmtMs(r.ci95[0])}–${fmtMs(r.ci95[1])}] cv${(r.cv * 100).toFixed(0)}%`
}

function printMarkdownTable(suites: SuiteResult[]): void {
  const tests = suites[0]?.results.map((r) => r.name) ?? []
  if (tests.length === 0) {
    console.error('[bench-fair] suite has no tests')
    return
  }
  const COLW = 32
  console.log()
  console.log('Median with 95% bootstrap CI and coefficient-of-variation')
  console.log(`${' '.repeat(28)}${suites.map((s) => pad(s.framework, COLW)).join('')}`)
  console.log('─'.repeat(28 + suites.length * COLW))
  for (const t of tests) {
    const cells = suites.map((s) => {
      const r = s.results.find((x) => x.name === t)
      if (!r) return pad('—', COLW)
      return pad(fmtCell(r), COLW)
    })
    console.log(`${t.padEnd(28)}${cells.join('')}`)
  }

  console.log()
  console.log('Slowdown vs best framework (excl. Vanilla)')
  const fwOnly = suites.filter((s) => s.framework !== 'Vanilla JS')
  const FCOL = 16
  console.log(`${' '.repeat(28)}${fwOnly.map((s) => pad(s.framework, FCOL)).join('')}`)
  console.log('─'.repeat(28 + fwOnly.length * FCOL))
  for (const t of tests) {
    const medians = fwOnly.map(
      (s) => s.results.find((x) => x.name === t)?.median ?? Number.POSITIVE_INFINITY,
    )
    const best = Math.min(...medians)
    const cells = medians.map((m) =>
      pad(Number.isFinite(m) ? `${(m / best).toFixed(2)}×` : '—', FCOL),
    )
    console.log(`${t.padEnd(28)}${cells.join('')}`)
  }

  // Warmup-used + worst-CV summary — diagnostic indicators.
  console.log()
  console.log('Adaptive-warmup iterations used (lower = stabilised faster)')
  console.log(`${' '.repeat(28)}${suites.map((s) => pad(s.framework, FCOL)).join('')}`)
  console.log('─'.repeat(28 + suites.length * FCOL))
  for (const t of tests) {
    const cells = suites.map((s) => {
      const r = s.results.find((x) => x.name === t)
      return pad(r ? String(r.warmupUsed) : '—', FCOL)
    })
    console.log(`${t.padEnd(28)}${cells.join('')}`)
  }

  // Statistically-honest verdict per test — list every framework
  // whose CI95 overlaps with the leader's. Removes the "is a 5%
  // difference real?" judgement call from the reader; the bench
  // itself reports "🤝 tied within noise" when intervals overlap
  // and "🥇 outright" when the leader's CI95 lo > runner-up's CI95 hi.
  console.log()
  console.log('Statistically-honest verdict per test (CI95-overlap = tied within noise)')
  console.log('─'.repeat(120))
  const fwOnlyForVerdict = suites.filter((s) => s.framework !== 'Vanilla JS')
  for (const t of tests) {
    type Row = { framework: string; median: number; ci95: [number, number] }
    const rows: Row[] = fwOnlyForVerdict
      .map((s) => {
        const r = s.results.find((x) => x.name === t)
        if (!r) return null
        return { framework: s.framework, median: r.median, ci95: r.ci95 }
      })
      .filter((x): x is Row => x !== null)
    rows.sort((a, b) => a.median - b.median)
    if (rows.length === 0) {
      console.log(`  ${t}: no data`)
      continue
    }
    const leader = rows[0]
    if (!leader) continue
    const tied: string[] = [leader.framework]
    // Walk down the sorted list; include any framework whose lower
    // CI95 bound is at or below the leader's upper CI95 bound.
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      if (!r) continue
      if (r.ci95[0] <= leader.ci95[1]) {
        tied.push(r.framework)
      } else {
        break
      }
    }
    const marker = tied.length === 1 ? '🥇 outright' : `🤝 tied (n=${tied.length})`
    console.log(`  ${t.padEnd(28)} ${marker} ${tied.join(' = ')} — leader ${fmtMs(leader.median)}`)
  }
}

function printDiffTable(baseline: SuiteResult[], current: SuiteResult[]): void {
  console.log()
  console.log('Δ vs baseline (current / baseline; <1.00 = faster, >1.00 = slower)')
  const tests = current[0]?.results.map((r) => r.name) ?? []
  const COLW = 18
  console.log(`${' '.repeat(28)}${current.map((s) => pad(s.framework, COLW)).join('')}`)
  console.log('─'.repeat(28 + current.length * COLW))
  for (const t of tests) {
    const cells = current.map((s) => {
      const cur = s.results.find((x) => x.name === t)?.median
      const base = baseline.find((b) => b.framework === s.framework)?.results.find((x) => x.name === t)
        ?.median
      if (cur === undefined || base === undefined) return pad('—', COLW)
      const ratio = cur / base
      const sign = ratio < 1 ? '✓' : ratio > 1.05 ? '✗' : '·'
      return pad(`${sign} ${ratio.toFixed(2)}×`, COLW)
    })
    console.log(`${t.padEnd(28)}${cells.join('')}`)
  }
}

function currentSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

main().catch((err: Error) => {
  console.error('[bench-fair]', err.message)
  process.exit(1)
})
