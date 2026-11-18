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
 *   2. Launch Chromium with precise heap counters and force collection via
 *      the browser protocol between samples, including detached navigation
 *      contexts. Default heap counters are rounded and cached.
 *   3. Boot + warmup (5 cycles, discarded).
 *   4. Run `cycles` iterations:
 *      - Run the journey
 *      - Force GC (twice — the first run frees, the second compacts)
 *      - Sample `performance.memory.usedJSHeapSize`
 *   5. Compute the linear-regression slope of heap size over cycle
 *      number (least-squares).
 *   6. Assert `slope < threshold` (bytes per cycle). A window over the
 *      threshold runs confirmation cycles first: one allocation step is not
 *      a leak (see `perf/leak-verdict.ts` for the rule and its derivation).
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
import { forceGcTwice, HEAP_AUDIT_CHROMIUM_ARGS } from './perf/heap'
import {
  DEFAULT_MAX_CONFIRM_CYCLES,
  type HeapGrowthVerdict,
  judgeHeapGrowth,
  linearRegression,
} from './perf/leak-verdict'

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

// The regression and the verdict live in `perf/leak-verdict.ts`; re-exported for existing importers.
export { linearRegression }

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
      // locator().waitFor(), not waitForSelector(): the latter returns an ElementHandle that pins DOM for the whole
      // session and reads as a leak (see scripts/perf/page-like.ts).
      await page.locator('[data-testid="toggle-theme"]').first().waitFor({ state: 'attached' })
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

async function sampleHeap(page: Page): Promise<number> {
  return page.evaluate(() => {
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number } }
    return perf.memory?.usedJSHeapSize ?? 0
  })
}

function describeVerdict(v: HeapGrowthVerdict, threshold: number): string {
  const kb = (bytes: number): string => `${(bytes / 1024).toFixed(2)} KB/cycle`
  if (v.reason === 'within-threshold') return `✓ No leak detected — slope ${kb(v.slope)} ≤ threshold`
  const over = `slope ${kb(v.slope)} > threshold ${kb(threshold)}`
  if (v.confirmation === undefined) return `❌ LEAK DETECTED — ${over}; growth too large to confirm`
  const after = `${kb(v.confirmation.slope)} over ${v.confirmation.cycles} further cycles`
  return v.leak
    ? `❌ LEAK DETECTED — ${over}, and still ${after}`
    : `✓ No leak detected — ${over} once, then ${after}: a one-time allocation`
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
    args: HEAP_AUDIT_CHROMIUM_ARGS,
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

    // Analysis: linear regression on (cycle, heap size). A window over the
    // threshold is confirmed on further cycles before it counts as a leak —
    // one allocation step reads as a slope otherwise (perf/leak-verdict.ts).
    const judged = await judgeHeapGrowth(
      samples,
      args.thresholdBytesPerCycle,
      DEFAULT_MAX_CONFIRM_CYCLES,
      async (cycles) => {
        console.log(`[leak-audit] slope over threshold — confirming on ${cycles} further cycles…`)
        const more: number[] = []
        for (let i = 0; i < cycles; i++) {
          await runOneCycle(page, args.journey)
          await forceGcTwice(page)
          more.push(await sampleHeap(page))
        }
        return more
      },
    )
    const { slope, intercept, rSquared } = judged

    await browser.close()
    await server.stop()

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

    const leakDetected = judged.leak
    console.log(`  ${describeVerdict(judged, args.thresholdBytesPerCycle)}`)
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
            reason: judged.reason,
            confirmation: judged.confirmation,
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
