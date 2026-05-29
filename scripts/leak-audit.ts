#!/usr/bin/env bun
/**
 * Heap-growth leak detector.
 *
 *   bun run scripts/leak-audit.ts --app perf-dashboard --journey toggleTheme --cycles 50
 *
 * Methodology (the verification step the 0.23.0 heap-snapshot analysis
 * asked for, now permanent infrastructure):
 *   1. Build + launch the example via `scripts/perf/server.ts` (preview
 *      mode by default — measures production-shaped behavior, not dev
 *      with sourcemaps inlined).
 *   2. Launch Chromium with `--js-flags=--expose-gc` so we can call
 *      `globalThis.gc()` between samples — removes the dominant source
 *      of `usedJSHeapSize` noise (asynchronous V8 collection cycles
 *      running mid-sample).
 *   3. Boot + warmup (5 cycles, discarded).
 *   4. Run `cycles` iterations:
 *      - Run the journey
 *      - Force GC (twice — the first run frees, the second compacts)
 *      - Sample `performance.memory.usedJSHeapSize`
 *   5. Compute the linear-regression slope of heap size over cycle
 *      number (least-squares).
 *   6. Assert `slope < threshold` (bytes per cycle).
 *
 * Exit codes mean something distinct so CI / nightly runs classify
 * failures cleanly:
 *   0 — slope within threshold (no leak detected)
 *   1 — argv / config problem
 *   2 — server didn't start
 *   3 — browser navigation or journey threw
 *   4 — `performance.memory` unavailable (need Chrome / Chromium with the API)
 *   5 — `globalThis.gc` unavailable (need --js-flags=--expose-gc; should be auto-set)
 *   6 — slope EXCEEDS threshold — LEAK DETECTED
 *
 * This is intentionally NOT wired into CI required checks. Heap-growth
 * is environmentally noisy (background GC, JIT warmup, allocator
 * fragmentation), and false positives would erode the gate's
 * credibility. Use it for:
 *   - Local diagnostics when you suspect a leak ("does heap stay flat
 *     across N route navigations?")
 *   - Nightly job on a known-clean baseline
 *   - Pre/post comparison around a specific PR ("did this change
 *     introduce per-cycle heap growth?")
 *
 * Companion to the unit-test regression locks in `context.test.ts`
 * (the structural bug shape — context-snapshot frame counts — that
 * was the original heap-analysis finding). Those tests catch the
 * structural fingerprint deterministically; this harness catches
 * heap-growth patterns the unit tests can't see.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'
import { startServer as startViteServer } from './perf/server'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

interface Args {
  app: string
  journey: string
  cycles: number
  warmup: number
  mode: 'dev' | 'preview'
  thresholdBytesPerCycle: number
  jsonOut: string | undefined
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {
    cycles: 50,
    warmup: 5,
    mode: 'preview',
    thresholdBytesPerCycle: 50_000, // 50 KB per cycle — conservative default
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const v = argv[i + 1]
    if (a === '--app' && v) {
      args.app = v
      i++
    } else if (a === '--journey' && v) {
      args.journey = v
      i++
    } else if (a === '--cycles' && v) {
      args.cycles = Number(v)
      i++
    } else if (a === '--warmup' && v) {
      args.warmup = Number(v)
      i++
    } else if (a === '--mode' && (v === 'dev' || v === 'preview')) {
      args.mode = v
      i++
    } else if (a === '--threshold' && v) {
      args.thresholdBytesPerCycle = Number(v)
      i++
    } else if (a === '--json' && v) {
      args.jsonOut = v
      i++
    } else if (a === '--help' || a === '-h') {
      printUsage()
      process.exit(0)
    }
  }
  if (!args.app || !args.journey) {
    printUsage()
    process.exit(1)
  }
  return args as Args
}

function printUsage(): void {
  console.log(`
Usage: bun run scripts/leak-audit.ts --app <name> --journey <name> [options]

Required:
  --app <name>              Example app (e.g. perf-dashboard)
  --journey <name>          Journey to repeat (e.g. toggleTheme)

Options:
  --cycles <N>              Number of timed cycles (default: 50)
  --warmup <N>              Warmup cycles, discarded (default: 5)
  --mode dev|preview        Server mode (default: preview — production-shape)
  --threshold <bytes>       Max acceptable slope, bytes/cycle (default: 50_000)
  --json <path>             Write JSON summary to <path>
  --help                    Print this help

Exit codes:
  0 = no leak; 6 = leak (slope > threshold); 1-5 = setup errors
`)
}

/**
 * Least-squares linear regression on (x, y) samples — exported pure
 * function so unit tests can validate the math without spawning a
 * browser. x is the sample index (0..n-1); y is the value.
 *
 * Returns `{ slope, intercept, rSquared }`:
 *   - `slope` — value change per unit x (bytes per cycle in the
 *     leak-audit use case)
 *   - `intercept` — predicted y at x=0
 *   - `rSquared` — coefficient of determination ∈ [0, 1]. 1.0 means
 *     perfect line; 0 means the line explains no variance. NaN-safe:
 *     returns 0 when total variance is 0 (constant samples).
 */
export function linearRegression(samples: number[]): {
  slope: number
  intercept: number
  rSquared: number
} {
  const n = samples.length
  if (n < 2) return { slope: 0, intercept: samples[0] ?? 0, rSquared: 0 }
  // x is the cycle index (0..n-1); y is the heap-size sample.
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += samples[i]!
    sumXY += i * samples[i]!
    sumX2 += i * i
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  // Coefficient of determination — how well the line fits the data.
  // Low rSquared means the heap is jittery (noise > trend), which means
  // the slope estimate is uncertain even if it's small.
  const meanY = sumY / n
  let ssTotal = 0
  let ssRes = 0
  for (let i = 0; i < n; i++) {
    const yPred = intercept + slope * i
    ssTotal += (samples[i]! - meanY) ** 2
    ssRes += (samples[i]! - yPred) ** 2
  }
  const rSquared = ssTotal > 0 ? 1 - ssRes / ssTotal : 0
  return { slope, intercept, rSquared }
}

interface JourneyHandle {
  click: (selector: string) => Promise<void>
  fill: (selector: string, value: string) => Promise<void>
  waitForSelector: (selector: string) => Promise<void>
  evaluate: <T>(fn: () => T) => Promise<T>
  reload: (opts?: { waitUntil?: string }) => Promise<unknown>
}

async function runOneCycle(page: Page, journeyName: string): Promise<void> {
  // Load journeys catalog from the running app — it's already in scope.
  // We can't import the .ts module directly here (it's the app's source),
  // so we evaluate journey-by-name through a registered globalThis hook
  // OR by re-implementing the journey here. For now: drive a small
  // bridge — the dashboard exposes `window.__pyreon_perf_journey(name)`
  // for harness use. If it doesn't, fall back to dispatching DOM clicks
  // matching the journey's name (very crude — works for `toggleTheme`,
  // `boot` etc.).
  const handled = await page.evaluate((name: string) => {
    const w = window as unknown as {
      __pyreon_perf_journey?: (n: string) => Promise<void> | void
    }
    if (typeof w.__pyreon_perf_journey === 'function') {
      const r = w.__pyreon_perf_journey(name)
      return r instanceof Promise ? r.then(() => true) : true
    }
    return false
  }, journeyName)
  if (handled) return

  // Fallback: best-effort common journeys. The harness is most useful
  // when the app exposes __pyreon_perf_journey; this fallback covers
  // the perf-dashboard defaults so it's usable out of the box.
  switch (journeyName) {
    case 'toggleTheme':
      await page.click('[data-testid="toggle-theme"]')
      break
    case 'boot':
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('[data-testid="toggle-theme"]')
      break
    default:
      throw new Error(
        `[leak-audit] no fallback for journey "${journeyName}" — register window.__pyreon_perf_journey() in the app`,
      )
  }
}

/**
 * Force GC twice. First call frees garbage; second call compacts the
 * old-generation space (V8's collector runs in passes — one pass
 * frees, subsequent passes compact). Sampling `usedJSHeapSize` after
 * just one pass shows post-free-but-pre-compact size, which is
 * spuriously higher than the true retained-set size.
 */
async function forceGcTwice(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = globalThis as { gc?: () => void }
    g.gc?.()
    g.gc?.()
  })
}

async function sampleHeap(page: Page): Promise<number> {
  return page.evaluate(() => {
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number } }
    return perf.memory?.usedJSHeapSize ?? 0
  })
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  console.log(`[leak-audit] app=${args.app} journey=${args.journey} mode=${args.mode}`)
  console.log(
    `[leak-audit] cycles=${args.cycles} warmup=${args.warmup} threshold=${args.thresholdBytesPerCycle} bytes/cycle`,
  )

  let server
  try {
    server = await startViteServer({ repoRoot: REPO_ROOT, app: args.app, mode: args.mode })
  } catch (err) {
    console.error(`[leak-audit] failed to start server: ${(err as Error).message}`)
    process.exit(2)
  }

  console.log(`[leak-audit] launching Chromium with --js-flags=--expose-gc…`)
  const browser = await chromium.launch({
    headless: true,
    args: ['--js-flags=--expose-gc'],
  })

  try {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[chromium]', msg.text())
    })
    page.on('pageerror', (err) => console.error('[chromium] pageerror:', err.message))

    await page.goto(server.url, { waitUntil: 'load' })

    // Sanity check — performance.memory and globalThis.gc both available?
    const checks = await page.evaluate(() => ({
      memory: typeof (performance as unknown as { memory?: unknown }).memory,
      gc: typeof (globalThis as { gc?: unknown }).gc,
    }))
    if (checks.memory !== 'object') {
      console.error('[leak-audit] performance.memory unavailable (need Chrome / Chromium)')
      process.exit(4)
    }
    if (checks.gc !== 'function') {
      console.error('[leak-audit] globalThis.gc unavailable — flag may not be honored')
      process.exit(5)
    }

    // Wait for the app to settle (perf-dashboard takes a moment for
    // counters to install + first paint).
    await page.waitForLoadState('networkidle')
    await new Promise((r) => setTimeout(r, 500))

    // Warmup — JIT, allocator fragmentation, network caches.
    console.log(`[leak-audit] warmup (${args.warmup} cycles)…`)
    for (let i = 0; i < args.warmup; i++) {
      await runOneCycle(page, args.journey)
    }
    await forceGcTwice(page)

    // Timed cycles — sample heap after each cycle's GC.
    console.log(`[leak-audit] timing (${args.cycles} cycles)…`)
    const samples: number[] = []
    for (let i = 0; i < args.cycles; i++) {
      await runOneCycle(page, args.journey)
      await forceGcTwice(page)
      const used = await sampleHeap(page)
      samples.push(used)
      if (i === 0 || i === args.cycles - 1 || (i + 1) % 10 === 0) {
        console.log(
          `[leak-audit]   cycle ${i + 1}/${args.cycles}: ${(used / 1024 / 1024).toFixed(2)} MB`,
        )
      }
    }

    await browser.close()
    await server.stop()

    // Analysis: linear regression on (cycle, heap size).
    const { slope, intercept, rSquared } = linearRegression(samples)
    const first = samples[0] ?? 0
    const last = samples[samples.length - 1] ?? 0
    const total = last - first

    console.log()
    console.log('─'.repeat(72))
    console.log('  Heap-growth analysis')
    console.log('─'.repeat(72))
    console.log(`  First sample:        ${(first / 1024 / 1024).toFixed(2)} MB`)
    console.log(`  Last sample:         ${(last / 1024 / 1024).toFixed(2)} MB`)
    console.log(
      `  Total growth:        ${(total / 1024 / 1024).toFixed(2)} MB over ${args.cycles} cycles`,
    )
    console.log(`  Slope (regression):  ${(slope / 1024).toFixed(2)} KB/cycle`)
    console.log(`  Intercept:           ${(intercept / 1024 / 1024).toFixed(2)} MB`)
    console.log(`  R² (fit quality):    ${rSquared.toFixed(3)}  (1.0 = perfect line; <0.3 = noisy)`)
    console.log(
      `  Threshold:           ${(args.thresholdBytesPerCycle / 1024).toFixed(2)} KB/cycle`,
    )
    console.log('─'.repeat(72))

    const leakDetected = slope > args.thresholdBytesPerCycle
    const verdict = leakDetected
      ? `❌ LEAK DETECTED — slope ${(slope / 1024).toFixed(2)} KB/cycle > threshold ${(args.thresholdBytesPerCycle / 1024).toFixed(2)} KB/cycle`
      : `✓ No leak detected — slope ${(slope / 1024).toFixed(2)} KB/cycle ≤ threshold`
    console.log(`  ${verdict}`)
    console.log('─'.repeat(72))

    // Honesty note: distinguish "constant heap" (best outcome — R²
    // undefined because there's no variance) from "noisy heap"
    // (samples scatter, slope estimate uncertain). Both produce low
    // R² but mean opposite things. Use the coefficient of variation
    // (CV = stddev / mean) to tell them apart.
    const meanSample = samples.reduce((s, x) => s + x, 0) / samples.length
    const stddev = Math.sqrt(
      samples.reduce((s, x) => s + (x - meanSample) ** 2, 0) / Math.max(samples.length - 1, 1),
    )
    const cv = meanSample > 0 ? stddev / meanSample : 0
    if (cv < 0.001) {
      console.log()
      console.log(`  Heap was perfectly flat across all samples (CV < 0.1%). The R² metric is`)
      console.log(`  meaningless here because there's no variance to explain — but that's the`)
      console.log(`  cleanest possible outcome. (Chrome's performance.memory.usedJSHeapSize is`)
      console.log(`  bucketed to ~100KB for privacy; identical readings just mean true heap`)
      console.log(`  movement is below the bucket size.)`)
    } else if (rSquared < 0.3 && Math.abs(slope) < args.thresholdBytesPerCycle * 2) {
      console.log()
      console.log(
        `  Note: R² = ${rSquared.toFixed(3)} with CV ${(cv * 100).toFixed(2)}% — heap samples`,
      )
      console.log(`  are jittery, the slope estimate is uncertain. Consider more cycles for a`)
      console.log(`  tighter signal.`)
    }

    if (args.jsonOut) {
      mkdirSync(dirname(args.jsonOut), { recursive: true })
      const sha = currentSha()
      writeFileSync(
        args.jsonOut,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            sha,
            app: args.app,
            journey: args.journey,
            mode: args.mode,
            cycles: args.cycles,
            warmup: args.warmup,
            thresholdBytesPerCycle: args.thresholdBytesPerCycle,
            slopeBytesPerCycle: slope,
            interceptBytes: intercept,
            rSquared,
            firstSampleBytes: first,
            lastSampleBytes: last,
            totalGrowthBytes: total,
            samples,
            leakDetected,
          },
          null,
          2,
        ),
      )
      console.log(`[leak-audit] JSON written to ${args.jsonOut}`)
    }

    if (leakDetected) process.exit(6)
  } catch (err) {
    console.error('[leak-audit] error:', (err as Error).message)
    await browser.close().catch(() => {})
    await server.stop().catch(() => {})
    process.exit(3)
  }
}

function currentSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

// Gate on `import.meta.main` so unit tests can import `linearRegression`
// without spawning Chromium. Matches the `scripts/audit-leak-classes.ts`
// pattern.
if (import.meta.main) {
  main()
}
