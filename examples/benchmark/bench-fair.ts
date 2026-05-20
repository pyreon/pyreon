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
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    jsonOut: undefined,
    baseline: undefined,
    throttle: undefined,
    frameworks: ALL_FRAMEWORKS,
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

  const suites: SuiteResult[] = []
  for (const framework of args.frameworks) {
    console.log(`[bench-fair]   ▸ ${framework}`)
    const suite = await runOneFramework(framework, baseUrl, args.throttle, browser)
    if (suite) suites.push(suite)
  }

  await browser.close()
  preview.kill('SIGTERM')

  if (suites.length === 0) {
    console.error('[bench-fair] no results — check console output above')
    process.exit(1)
  }

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
