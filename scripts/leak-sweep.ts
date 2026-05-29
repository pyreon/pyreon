#!/usr/bin/env bun
/**
 * Heap-growth leak-audit SWEEP.
 *
 * Runs the leak-audit methodology across every journey in an example
 * (or a subset), aggregating results into one report. Unlike running
 * `leak-audit.ts` N times, this script boots the server + browser ONCE
 * and iterates journeys against the same page — ~10-15× faster on a
 * 43-journey perf-dashboard sweep.
 *
 *   bun run scripts/leak-sweep.ts --app perf-dashboard [--cycles 15] [--warmup 3]
 *
 * Methodology mirrors `leak-audit.ts` per journey:
 *   1. Force GC twice between samples (first frees, second compacts)
 *   2. Sample `performance.memory.usedJSHeapSize` after each cycle
 *   3. Least-squares linear regression on (cycle, heap)
 *   4. Report slope, R², CV per journey
 *   5. Flag any journey whose slope exceeds the threshold
 *
 * Output:
 *   - Markdown table sorted by slope descending (worst first)
 *   - JSON dump for archival / diff against future sweeps
 *
 * Exit codes:
 *   0 — sweep completed, all journeys clean (or none-flagged)
 *   1 — argv / config problem
 *   2 — server didn't start
 *   3 — browser navigation or sweep threw mid-flight
 *   4 — `performance.memory` / `gc` unavailable (see leak-audit.ts for context)
 *   6 — sweep completed BUT at least one journey exceeded threshold
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'
import { journeys } from '../examples/perf-dashboard/src/journeys'
import { linearRegression } from './leak-audit'
import { startServer as startViteServer } from './perf/server'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

interface Args {
  app: string
  cycles: number
  warmup: number
  thresholdBytesPerCycle: number
  jsonOut: string | undefined
  journeys: string[] | undefined
  mode: 'dev' | 'preview'
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {
    app: 'perf-dashboard',
    cycles: 15,
    warmup: 3,
    thresholdBytesPerCycle: 50_000,
    mode: 'preview',
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const v = argv[i + 1]
    if (a === '--app' && v) {
      args.app = v
      i++
    } else if (a === '--cycles' && v) {
      args.cycles = Number(v)
      i++
    } else if (a === '--warmup' && v) {
      args.warmup = Number(v)
      i++
    } else if (a === '--threshold' && v) {
      args.thresholdBytesPerCycle = Number(v)
      i++
    } else if (a === '--json' && v) {
      args.jsonOut = v
      i++
    } else if (a === '--journeys' && v) {
      args.journeys = v.split(',').map((s) => s.trim())
      i++
    } else if (a === '--mode' && (v === 'dev' || v === 'preview')) {
      args.mode = v
      i++
    }
  }
  return args as Args
}

async function runOneCycle(page: Page, name: string): Promise<void> {
  const fn = journeys[name]
  if (!fn) {
    throw new Error(
      `[leak-sweep] unknown journey "${name}" — not in perf-dashboard's journeys catalog`,
    )
  }
  // The journey functions are typed against the `PageLike` interface
  // (click / fill / waitForSelector / evaluate / reload) — a strict
  // subset of Playwright's Page. Pass our real `Page` through.
  await fn(page as unknown as Parameters<typeof fn>[0])
}

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

interface JourneyResult {
  journey: string
  cycles: number
  warmup: number
  firstSampleBytes: number
  lastSampleBytes: number
  slopeBytesPerCycle: number
  interceptBytes: number
  rSquared: number
  cv: number
  samples: number[]
  leakDetected: boolean
  failed?: string
}

async function runJourney(
  page: Page,
  journey: string,
  cycles: number,
  warmup: number,
  threshold: number,
): Promise<JourneyResult> {
  try {
    // Warmup
    for (let i = 0; i < warmup; i++) {
      await runOneCycle(page, journey)
    }
    await forceGcTwice(page)

    // Timed cycles
    const samples: number[] = []
    for (let i = 0; i < cycles; i++) {
      await runOneCycle(page, journey)
      await forceGcTwice(page)
      samples.push(await sampleHeap(page))
    }

    const { slope, intercept, rSquared } = linearRegression(samples)
    const mean = samples.reduce((s, x) => s + x, 0) / samples.length
    const stddev = Math.sqrt(
      samples.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(samples.length - 1, 1),
    )
    const cv = mean > 0 ? stddev / mean : 0
    const first = samples[0] ?? 0
    const last = samples[samples.length - 1] ?? 0

    return {
      journey,
      cycles,
      warmup,
      firstSampleBytes: first,
      lastSampleBytes: last,
      slopeBytesPerCycle: slope,
      interceptBytes: intercept,
      rSquared,
      cv,
      samples,
      leakDetected: slope > threshold,
    }
  } catch (err) {
    return {
      journey,
      cycles,
      warmup,
      firstSampleBytes: 0,
      lastSampleBytes: 0,
      slopeBytesPerCycle: 0,
      interceptBytes: 0,
      rSquared: 0,
      cv: 0,
      samples: [],
      leakDetected: false,
      failed: (err as Error).message,
    }
  }
}

function fmtKB(bytes: number): string {
  const kb = bytes / 1024
  if (Math.abs(kb) < 1) return `${bytes.toFixed(0)}B`
  if (Math.abs(kb) < 1024) return `${kb.toFixed(2)}KB`
  return `${(kb / 1024).toFixed(2)}MB`
}

function fmtMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}

function printReport(results: JourneyResult[], threshold: number): void {
  // Sort: leaks first, then by slope descending
  const sorted = [...results].sort((a, b) => {
    if (a.leakDetected && !b.leakDetected) return -1
    if (!a.leakDetected && b.leakDetected) return 1
    return b.slopeBytesPerCycle - a.slopeBytesPerCycle
  })

  console.log()
  console.log('─'.repeat(110))
  console.log(
    `  Leak-audit sweep — ${results.length} journey(s), threshold ${fmtKB(threshold)}/cycle`,
  )
  console.log('─'.repeat(110))
  console.log(
    `  ${'Journey'.padEnd(36)}${'Slope'.padStart(14)}${'R²'.padStart(8)}${'CV'.padStart(10)}${'Start MB'.padStart(12)}${'End MB'.padStart(12)}  Verdict`,
  )
  console.log('─'.repeat(110))
  for (const r of sorted) {
    if (r.failed) {
      console.log(
        `  ${r.journey.padEnd(36)}${'  ERROR'.padStart(14)}${''.padStart(8)}${''.padStart(10)}${''.padStart(12)}${''.padStart(12)}  ✗ ${r.failed.slice(0, 60)}`,
      )
      continue
    }
    const slopeStr = fmtKB(r.slopeBytesPerCycle).padStart(14)
    const r2Str = r.cv < 0.001 ? '  flat'.padStart(8) : r.rSquared.toFixed(2).padStart(8)
    const cvStr = `${(r.cv * 100).toFixed(2)}%`.padStart(10)
    const startStr = fmtMB(r.firstSampleBytes).padStart(12)
    const endStr = fmtMB(r.lastSampleBytes).padStart(12)
    const verdict = r.leakDetected
      ? `🚨 LEAK (${(r.slopeBytesPerCycle / threshold).toFixed(2)}× over)`
      : r.cv < 0.001
        ? '✓ flat'
        : '✓ ok'
    console.log(
      `  ${r.journey.padEnd(36)}${slopeStr}${r2Str}${cvStr}${startStr}${endStr}  ${verdict}`,
    )
  }
  console.log('─'.repeat(110))

  const leaks = sorted.filter((r) => r.leakDetected)
  const failures = sorted.filter((r) => r.failed)
  console.log()
  console.log(`  Total journeys: ${results.length}`)
  console.log(`  Leaks detected: ${leaks.length}${leaks.length > 0 ? ' ✗' : ' ✓'}`)
  console.log(
    `  Failed to run:  ${failures.length}${failures.length > 0 ? ' ✗ (check journey hooks)' : ' ✓'}`,
  )
  console.log()
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  console.log(`[leak-sweep] app=${args.app} mode=${args.mode}`)
  console.log(
    `[leak-sweep] cycles=${args.cycles} warmup=${args.warmup} threshold=${args.thresholdBytesPerCycle} bytes/cycle`,
  )

  let server
  try {
    server = await startViteServer({ repoRoot: REPO_ROOT, app: args.app, mode: args.mode })
  } catch (err) {
    console.error(`[leak-sweep] failed to start server: ${(err as Error).message}`)
    process.exit(2)
  }

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

    // API checks
    const checks = await page.evaluate(() => ({
      memory: typeof (performance as unknown as { memory?: unknown }).memory,
      gc: typeof (globalThis as { gc?: unknown }).gc,
      journey: typeof (window as unknown as { __pyreon_perf_journey?: unknown })
        .__pyreon_perf_journey,
    }))
    if (checks.memory !== 'object') {
      console.error('[leak-sweep] performance.memory unavailable')
      process.exit(4)
    }
    if (checks.gc !== 'function') {
      console.error('[leak-sweep] globalThis.gc unavailable')
      process.exit(4)
    }

    await page.waitForLoadState('networkidle')
    await new Promise((r) => setTimeout(r, 500))

    // Enumerate journeys — either user-supplied subset or full catalog from journeys.ts
    const allJourneyNames = Object.keys(journeys)
    const targetJourneys =
      args.journeys && args.journeys.length > 0
        ? args.journeys.filter((j) => allJourneyNames.includes(j))
        : allJourneyNames
    if (targetJourneys.length === 0) {
      console.error('[leak-sweep] no matching journeys found in catalog')
      process.exit(1)
    }
    console.log(
      `[leak-sweep] sweeping ${targetJourneys.length} journey(s) from catalog of ${allJourneyNames.length}`,
    )

    const results: JourneyResult[] = []
    for (let i = 0; i < targetJourneys.length; i++) {
      const j = targetJourneys[i]!
      process.stdout.write(
        `[leak-sweep] [${(i + 1).toString().padStart(2)}/${targetJourneys.length}] ${j.padEnd(40)} `,
      )
      const start = Date.now()
      const result = await runJourney(
        page,
        j,
        args.cycles,
        args.warmup,
        args.thresholdBytesPerCycle,
      )
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      if (result.failed) {
        process.stdout.write(`✗ ERROR (${elapsed}s): ${result.failed.slice(0, 50)}\n`)
      } else {
        const verdict = result.leakDetected
          ? `🚨 LEAK ${fmtKB(result.slopeBytesPerCycle)}/cycle`
          : `✓ ${fmtKB(result.slopeBytesPerCycle)}/cycle`
        process.stdout.write(`${verdict} (${elapsed}s)\n`)
      }
      results.push(result)
    }

    await browser.close()
    await server.stop()

    printReport(results, args.thresholdBytesPerCycle)

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
            mode: args.mode,
            cycles: args.cycles,
            warmup: args.warmup,
            thresholdBytesPerCycle: args.thresholdBytesPerCycle,
            totalJourneys: results.length,
            leaksDetected: results.filter((r) => r.leakDetected).length,
            failedJourneys: results.filter((r) => r.failed).length,
            results,
          },
          null,
          2,
        ),
      )
      console.log(`[leak-sweep] JSON written to ${args.jsonOut}`)
    }

    const leakCount = results.filter((r) => r.leakDetected).length
    if (leakCount > 0) process.exit(6)
  } catch (err) {
    console.error('[leak-sweep] error:', (err as Error).message)
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

if (import.meta.main) {
  main()
}
