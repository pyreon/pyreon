#!/usr/bin/env bun
/**
 * Cross-framework MEMORY benchmark — krausest's memory metric family.
 *
 * Our published suite reported exactly ONE memory figure ("retained JS heap
 * after suite", in `bench-fair.ts`), which is not any of krausest's. This
 * closes that gap by implementing krausest's definitions and its measurement
 * recipe rather than inventing our own.
 *
 * ## The metrics, verbatim from krausest master
 *
 * Fetched from `webdriver-ts/src/benchmarksCommon.ts` (`memBenchmarkInfosArray`)
 * and `webdriver-ts/src/benchmarksPuppeteer.ts` (the step sequences):
 *
 *   21_ready-memory       "Memory usage after page load."                           [ACTIVE]
 *   22_run-memory         "Memory usage after adding 1,000 rows."                   [ACTIVE]
 *   23_update5-memory     "…after clicking update every 10th row 5 times"           [commented out]
 *   24_run5-memory        "…after clicking create 1000 rows 5 times"                [commented out]
 *   25_run-clear-memory   "…after creating and clearing 1000 rows 5 times"          [ACTIVE]
 *   26_run-10k-memory     "Memory usage after adding 10,000 rows."                  [commented out]
 *
 * NOTE FOR ANY DOC THAT QUOTES THIS: krausest master currently reports THREE
 * memory metrics, not five. `23`, `24` and `26` are commented out upstream —
 * they are still DEFINED in the enum, so implementing all six is a superset,
 * and each is tagged with its upstream status in the output. Our own
 * benchmark skill claims krausest "reports five memory metrics"; that is not
 * true of master as of 2026-08-18.
 *
 * ## `25_run-clear-memory` is a LEAK DETECTOR
 *
 * Five create/clear cycles end with an empty table, so a framework that
 * releases everything should land back at roughly its `21_ready-memory`
 * figure. The `leak Δ` column in the output is exactly that subtraction, and
 * it is the single most useful number this file produces.
 *
 * ## Measurement recipe — krausest's, not ours
 *
 *   fresh page load → run the step sequence → forceGC → wait 40ms →
 *   performance.measureUserAgentSpecificMemory().bytes
 *
 * `measureUserAgentSpecificMemory()` (NOT `performance.memory.usedJSHeapSize`)
 * is what krausest uses, and the difference matters: it measures the whole
 * agent — JS heap *plus DOM nodes* plus shared memory — and performs its own
 * internal GC. `usedJSHeapSize` sees only the JS heap, so it would systematically
 * under-count whichever framework holds more of its state in DOM rather than JS
 * objects. krausest's source carries the `Performance.getMetrics`/`JSHeapUsedSize`
 * route commented out directly beneath it.
 *
 * `forceGC` uses krausest's exact incantation,
 * `gc({type:'major',execution:'sync',flavor:'last-resort'})`.
 *
 * ## Two deviations from `bench-fair.ts`, both forced, both disclosed
 *
 *  1. **`channel: 'chromium'`.** `measureUserAgentSpecificMemory()` is not
 *     implemented in Playwright's bundled headless SHELL — it throws
 *     "not available" there even when `crossOriginIsolated` is true (verified
 *     across four launch modes; it works in `channel: 'chromium'` and headed,
 *     fails in the bundled shell with and without extra flags). The op bench
 *     uses the shell. Same binary for all eight frameworks either way, so the
 *     comparison is unaffected; absolute values are not comparable to the op
 *     bench's retained-heap column.
 *  2. **Isolated per-framework builds** (see `startup-build.ts`). A whole-agent
 *     measurement in the op bench's all-eight-frameworks-in-one-page bundle
 *     would charge seven idle frameworks to the eighth.
 *
 * Usage:
 *   bun bench-memory.ts                       # 3 samples per cell
 *   bun bench-memory.ts --repeat 5            # 5 samples per cell
 *   bun bench-memory.ts --json out.json
 *   bun bench-memory.ts --frameworks Pyreon,SolidJS
 *   bun bench-memory.ts --skip-build          # reuse dist-startup/
 */
import { writeFileSync } from 'node:fs'
import * as os from 'node:os'
import { chromium, type Browser, type Page } from 'playwright'
import { auditCells, formatGuardReport, type SampleCell } from './bimodality-guard'
import { buildAll, loadAvg1, startPreview, TARGETS, verifyServedArms, type StartupTarget } from './startup-build'

const PORT = 4179

/** A krausest memory benchmark: its id, its step sequence, and its gate. */
interface MemMetric {
  id: string
  label: string
  /** Whether this metric is ACTIVE in krausest master or commented out there. */
  upstream: 'active' | 'commented-out'
  /**
   * The step sequence, run in the page. Mirrors the corresponding
   * `MemBenchmarkPuppeteer.run()` body from `benchmarksPuppeteer.ts`.
   */
  steps: string
  /**
   * Correctness gate, run in the page immediately before the GC + read.
   *
   * Asserts the EFFECT the metric's name claims, not a proxy: a metric called
   * "after adding 1,000 rows" must have 1,000 rows in the DOM at the moment
   * memory is sampled. A cell whose fixture silently did nothing would
   * otherwise report a small, plausible, entirely meaningless number — and
   * "small" reads as "good" for a memory metric, so this class of harness bug
   * flatters whoever hits it.
   */
  gate: string
}

const ROWS = `document.querySelectorAll('#app tbody tr').length`
const LABEL0 = `(document.querySelector('#app tbody tr td:nth-child(2)')?.textContent ?? '')`

const METRICS: readonly MemMetric[] = [
  {
    id: '21_ready-memory',
    label: 'ready memory',
    upstream: 'active',
    steps: `/* no-op — krausest's benchReadyMemory.run() returns null */`,
    // The app must be MOUNTED (empty table present) and hold no rows.
    gate: `if (${ROWS} !== 0) throw new Error('ready: expected 0 rows, got ' + ${ROWS});
           if (!document.querySelector('#app table')) throw new Error('ready: app never mounted');`,
  },
  {
    id: '22_run-memory',
    label: 'run memory (1k rows)',
    upstream: 'active',
    steps: `await app.create(1000)`,
    gate: `if (${ROWS} !== 1000) throw new Error('run: expected 1000 rows, got ' + ${ROWS});`,
  },
  {
    id: '23_update5-memory',
    label: 'update every 10th ×5',
    upstream: 'commented-out',
    steps: `await app.create(1000); for (let i = 0; i < 5; i++) await app.update()`,
    // krausest asserts the first cell contains ' !!!'.repeat(i) — i.e. that the
    // updates actually landed. Five updates on row 0 (index 0 is a multiple of
    // 10) must leave exactly five suffixes.
    gate: `if (${ROWS} !== 1000) throw new Error('update5: expected 1000 rows, got ' + ${ROWS});
           const s = ${LABEL0}; const n = s.split(' !!!').length - 1;
           if (n !== 5) throw new Error('update5: expected 5 suffixes on row 0, got ' + n + ' (' + s + ')');`,
  },
  {
    id: '24_run5-memory',
    label: 'replace 1k ×5',
    upstream: 'commented-out',
    steps: `for (let i = 0; i < 5; i++) await app.create(1000)`,
    gate: `if (${ROWS} !== 1000) throw new Error('run5: expected 1000 rows, got ' + ${ROWS});`,
  },
  {
    id: '25_run-clear-memory',
    label: 'create+clear 1k ×5  [LEAK]',
    upstream: 'active',
    steps: `for (let i = 0; i < 5; i++) { await app.create(1000); await app.clear() }`,
    // Both halves matter: ending at 0 rows proves the clear ran, and the
    // mid-cycle check below proves the creates were not no-ops. Without the
    // latter, an impl whose create silently failed would "pass" a 0-row gate
    // and report a beautifully small leak figure.
    gate: `if (${ROWS} !== 0) throw new Error('run-clear: expected 0 rows, got ' + ${ROWS});`,
  },
  {
    id: '26_run-10k-memory',
    label: 'run memory (10k rows)',
    upstream: 'commented-out',
    steps: `await app.create(10000)`,
    gate: `if (${ROWS} !== 10000) throw new Error('run10k: expected 10000 rows, got ' + ${ROWS});`,
  },
]

interface CliArgs {
  repeat: number
  jsonOut: string | undefined
  frameworks: readonly string[]
  skipBuild: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    repeat: 3,
    jsonOut: undefined,
    frameworks: TARGETS.map((t) => t.name),
    skipBuild: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repeat' && argv[i + 1]) {
      const v = Number(argv[++i])
      if (Number.isInteger(v) && v >= 1 && v <= 20) args.repeat = v
    } else if (a === '--json' && argv[i + 1]) {
      args.jsonOut = argv[++i]
    } else if (a === '--skip-build') {
      args.skipBuild = true
    } else if (a === '--frameworks' && argv[i + 1]) {
      const next = argv[++i]
      if (next) {
        const requested = next.split(',').map((s) => s.trim())
        const filtered = TARGETS.map((t) => t.name).filter((f) => requested.includes(f))
        if (filtered.length > 0) args.frameworks = filtered
      }
    }
  }
  return args
}

/** Fisher-Yates — same rationale as `bench-fair.ts`: kill position bias. */
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

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) * 0.5)] ?? 0
}

/** 1000-resample percentile bootstrap CI95 on the median — as `bench-fair.ts`. */
function ci95(xs: readonly number[]): [number, number] {
  if (xs.length < 2) return [xs[0] ?? 0, xs[0] ?? 0]
  const medians: number[] = []
  for (let b = 0; b < 1000; b++) {
    const rs: number[] = []
    for (let i = 0; i < xs.length; i++) rs.push(xs[Math.floor(Math.random() * xs.length)] ?? 0)
    medians.push(median(rs))
  }
  medians.sort((a, b) => a - b)
  return [
    medians[Math.floor((medians.length - 1) * 0.025)] ?? 0,
    medians[Math.floor((medians.length - 1) * 0.975)] ?? 0,
  ]
}

function cv(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  if (mean === 0) return 0
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1))
  return sd / mean
}

/**
 * Measure ONE (framework, metric) sample on a FRESH page.
 *
 * Fresh per sample is krausest's shape and it is load-bearing: reusing a page
 * would let the previous metric's garbage, JIT state and detached DOM ride
 * into the next reading.
 */
async function measureOne(
  browser: Browser,
  baseUrl: string,
  target: StartupTarget,
  metric: MemMetric,
): Promise<number> {
  const ctx = await browser.newContext()
  const page: Page = await ctx.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  try {
    await page.goto(`${baseUrl}/${target.slug}/index.html`, { waitUntil: 'networkidle' })

    // Wait for the MOUNT to have committed, not merely for the load event.
    // React/Octane/Preact publish from a post-commit callback, so without this
    // `21_ready-memory` would mean something different per framework.
    await page.waitForFunction(() => (globalThis as { __benchReady?: boolean }).__benchReady === true, null, {
      timeout: 30_000,
    })

    // Evaluated as a STRING (an async IIFE), the same shape krausest uses.
    // The step sequence and its gate are interpolated per metric so the two
    // can never drift apart — a gate defined next to steps it does not guard
    // is how a bench cell ends up measuring nothing and reporting a number.
    const bytes: number = await page.evaluate(`(async () => {
      const g = globalThis;
      if (!g.crossOriginIsolated) throw new Error('page is NOT crossOriginIsolated — measureUserAgentSpecificMemory would be unavailable, and any fallback would silently be a different metric');
      const app = g.__benchApp;
      if (!app) throw new Error('__benchApp missing');
      ${metric.steps};
      ${metric.gate}
      if (typeof g.gc !== 'function') throw new Error('gc() unavailable — launch with --js-flags=--expose-gc');
      g.gc({ type: 'major', execution: 'sync', flavor: 'last-resort' });
      await new Promise((r) => setTimeout(r, 40));
      const res = await performance.measureUserAgentSpecificMemory();
      return res.bytes;
    })()`)

    if (pageErrors.length > 0) {
      throw new Error(`page errors during ${metric.id}: ${pageErrors.join(' | ')}`)
    }
    return bytes
  } finally {
    await ctx.close()
  }
}

const MB = 1024 * 1024

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const targets = TARGETS.filter((t) => args.frameworks.includes(t.name))

  if (!args.skipBuild) buildAll(targets)

  const loadBefore = loadAvg1()
  console.log(
    `[bench-memory] machine: ${os.cpus()[0]?.model ?? '?'} · ${os.cpus().length} threads · ` +
      `1-min load ${loadBefore.toFixed(2)}`,
  )
  if (loadBefore > 8) {
    console.log(
      `[bench-memory] WARNING: 1-min load ${loadBefore.toFixed(2)} > 8. This box has a known ` +
        `bursty background load; numbers taken here must NOT be published.`,
    )
  }

  const server = await startPreview(PORT)
  // Prove we are measuring the bytes this process built, before measuring
  // anything. Guarded so a mismatch cannot strand the preview server on its
  // port — a leaked server is exactly the stale-arm hazard this check exists
  // to catch, and it would make the NEXT run fail on --strictPort instead.
  try {
    await verifyServedArms(server.baseUrl, targets)
  } catch (err) {
    server.stop()
    throw err
  }
  // `channel: 'chromium'` — REQUIRED. See the header: the bundled headless
  // shell does not implement measureUserAgentSpecificMemory().
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  })

  // framework -> metricId -> samples (bytes)
  const samples = new Map<string, Map<string, number[]>>()
  for (const t of targets) samples.set(t.name, new Map(METRICS.map((m) => [m.id, [] as number[]])))

  try {
    for (let pass = 0; pass < args.repeat; pass++) {
      // Reshuffle EVERY pass, as `bench-fair.ts` does — a single shuffle fixes
      // one arbitrary order for the whole run rather than averaging over it.
      const order = shuffled(targets)
      console.log(`[bench-memory] pass ${pass + 1}/${args.repeat} order: ${order.map((t) => t.name).join(' → ')}`)
      for (const t of order) {
        for (const m of METRICS) {
          const bytes = await measureOne(browser, server.baseUrl, t, m)
          samples.get(t.name)?.get(m.id)?.push(bytes)
        }
      }
    }
  } finally {
    await browser.close()
    server.stop()
  }

  const loadAfter = loadAvg1()

  // ── report ────────────────────────────────────────────────────────────────
  console.log(`\nkrausest memory metrics — ${args.repeat} fresh-page samples per cell, median MB`)
  console.log(
    `(performance.measureUserAgentSpecificMemory() — whole agent: JS heap + DOM. Lower is better.)`,
  )
  console.log('─'.repeat(108))

  const nameW = 26
  console.log(
    'metric'.padEnd(nameW) + targets.map((t) => t.name.padStart(11)).join(''),
  )
  const rows: Record<string, Record<string, { medianMB: number; ci95MB: [number, number]; cv: number; samplesMB: number[] }>> = {}

  for (const m of METRICS) {
    const tag = m.upstream === 'active' ? '' : ' †'
    let line = (m.label + tag).padEnd(nameW)
    rows[m.id] = {}
    for (const t of targets) {
      const s = (samples.get(t.name)?.get(m.id) ?? []).map((b) => b / MB)
      const med = median(s)
      rows[m.id]![t.name] = { medianMB: med, ci95MB: ci95(s), cv: cv(s), samplesMB: s }
      line += med.toFixed(2).padStart(11)
    }
    console.log(line)
  }

  // Leak Δ — the point of 25_run-clear-memory.
  console.log('─'.repeat(108))
  let leakLine = 'leak Δ (25 − 21)'.padEnd(nameW)
  for (const t of targets) {
    const d = (rows['25_run-clear-memory']?.[t.name]?.medianMB ?? 0) - (rows['21_ready-memory']?.[t.name]?.medianMB ?? 0)
    leakLine += `${d >= 0 ? '+' : ''}${d.toFixed(2)}`.padStart(11)
  }
  console.log(leakLine)
  console.log(
    `\n† = DEFINED in krausest but COMMENTED OUT in master; implemented here as a superset.\n` +
      `leak Δ = memory after 5 create/clear cycles minus memory at ready. A framework that\n` +
      `releases everything lands near 0. This is krausest's leak detector and is the reason\n` +
      `25_run-clear-memory exists — read it before reading the absolute columns.`,
  )

  // Per-cell dispersion, so a reader can tell a real gap from noise.
  console.log(`\nCI95 / CV per cell`)
  console.log('─'.repeat(108))
  for (const m of METRICS) {
    for (const t of targets) {
      const c = rows[m.id]![t.name]!
      console.log(
        `  ${m.id.padEnd(22)} ${t.name.padEnd(11)} ` +
          `median ${c.medianMB.toFixed(2)}MB  CI95 [${c.ci95MB[0].toFixed(2)}, ${c.ci95MB[1].toFixed(2)}]  ` +
          `CV ${(c.cv * 100).toFixed(1)}%`,
      )
    }
  }

  // ── bimodality guard ──────────────────────────────────────────────────────
  //
  // Applied as an OBJECTIVE CHECK, with a caveat stated rather than buried:
  // the guard was calibrated on TIMING samples, where perturbation can only
  // add time, so the fastest well-separated mode is the true cost. Retained
  // memory has the same one-sided property (uncollected garbage can only make
  // a reading larger), so the statistic transfers in principle — but the
  // thresholds were tuned against a 5µs clock on millisecond ops, not against
  // megabytes. Treat a finding here as "look at this cell", not as a verdict.
  const cells: SampleCell[] = []
  for (const m of METRICS) {
    for (const t of targets) {
      cells.push({ op: m.id, framework: t.name, samples: rows[m.id]![t.name]!.samplesMB })
    }
  }
  // quantum = 0: memory readings are not clock-quantized, so no cell should be
  // skipped for being "near the timer floor".
  const report = auditCells(cells, 0)
  console.log(`\nbimodality guard (calibrated for timing; advisory here — see source comment)`)
  for (const line of formatGuardReport(report, 0)) console.log(line)

  console.log(
    `\n[bench-memory] 1-min load before ${loadBefore.toFixed(2)} → after ${loadAfter.toFixed(2)}` +
      (Math.max(loadBefore, loadAfter) > 8 ? '  ← ABOVE 8: do not publish these numbers' : ''),
  )

  if (args.jsonOut) {
    writeFileSync(
      args.jsonOut,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          machine: { cpu: os.cpus()[0]?.model, threads: os.cpus().length },
          load: { before: loadBefore, after: loadAfter },
          repeat: args.repeat,
          metric: 'performance.measureUserAgentSpecificMemory().bytes',
          metrics: METRICS.map((m) => ({ id: m.id, label: m.label, upstream: m.upstream })),
          results: rows,
        },
        null,
        2,
      ),
    )
    console.log(`[bench-memory] wrote ${args.jsonOut}`)
  }
}

await main()
