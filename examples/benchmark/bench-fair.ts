#!/usr/bin/env bun
/**
 * Playwright-driven fair benchmark runner.
 *
 * Methodology:
 *   1. `vite preview` serves the production-built benchmark HTML.
 *   2. Headless Chromium loads it with `?auto=1` — auto-runs all frameworks.
 *   3. After each framework finishes, the page exposes `window.__benchResults`.
 *   4. We poll until all 7 frameworks have published results, then dump JSON.
 *
 * vs `bench-cli.ts` (happy-dom + Bun) — that runner is fundamentally
 * unfair because:
 *   - happy-dom has no real layout/paint;
 *   - it doesn't verify React/Vue/Preact/Solid actually rendered;
 *   - sub-millisecond numbers are below performance.now() resolution.
 *
 * This runner is real Chromium, real DOM, with DOM verification at every
 * step (impl-side `expectRows`/`expectRowsWithSelected` calls). Frameworks
 * that fail to commit a render before the bench timer stops throw and
 * surface as a console error. Numbers are median + p90 across 20 timed
 * runs (5 warmup discarded).
 *
 * Usage:
 *   bun bench-fair.ts                 # human-readable markdown table
 *   bun bench-fair.ts --json out.json # also write JSON to <out.json>
 *   bun bench-fair.ts --baseline <sha-or-path>  # compare to a baseline JSON file
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const PORT = 4178

interface BenchResult {
  name: string
  median: number
  p90: number
  min: number
  max: number
  runs: number
}
interface SuiteResult {
  framework: string
  results: BenchResult[]
}

interface CliArgs {
  jsonOut: string | undefined
  baseline: string | undefined
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { jsonOut: undefined, baseline: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json' && argv[i + 1]) {
      args.jsonOut = argv[++i]
    } else if (a === '--baseline' && argv[i + 1]) {
      args.baseline = argv[++i]
    }
  }
  return args
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

  console.log('[bench-fair] launching Chromium…')
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  page.on('console', (msg) => {
    const t = msg.text()
    // Surface bench failures and our own status lines.
    if (t.includes('benchmark failed') || t.includes('[bench]')) {
      console.error('[chromium]', t)
    }
  })
  page.on('pageerror', (err) => console.error('[chromium] pageerror:', err.message))

  await page.goto(`http://localhost:${PORT}/?auto=1`, { waitUntil: 'load' })

  // Wait for status to read "Done ✓" — the page sets it after all frameworks finish.
  console.log('[bench-fair] running suite — this takes a few minutes…')
  await page.waitForFunction(
    () => document.getElementById('status')?.textContent === 'Done ✓',
    null,
    { timeout: 300_000 },
  )

  const suites: SuiteResult[] = await page.evaluate(
    () => (globalThis as { __benchResults?: SuiteResult[] }).__benchResults ?? [],
  )

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

function printMarkdownTable(suites: SuiteResult[]): void {
  const tests = suites[0]?.results.map((r) => r.name) ?? []
  if (tests.length === 0) {
    console.error('[bench-fair] suite has no tests')
    return
  }
  const COLW = 18
  console.log()
  console.log('Wall-clock median (p90 shadow)')
  console.log(`${' '.repeat(28)}${suites.map((s) => pad(s.framework, COLW)).join('')}`)
  console.log('─'.repeat(28 + suites.length * COLW))
  for (const t of tests) {
    const cells = suites.map((s) => {
      const r = s.results.find((x) => x.name === t)
      if (!r) return pad('—', COLW)
      return pad(`${fmtMs(r.median)} (${fmtMs(r.p90)})`, COLW)
    })
    console.log(`${t.padEnd(28)}${cells.join('')}`)
  }

  console.log()
  console.log('Slowdown vs best framework (excl. Vanilla)')
  const fwOnly = suites.filter((s) => s.framework !== 'Vanilla JS')
  console.log(`${' '.repeat(28)}${fwOnly.map((s) => pad(s.framework, COLW)).join('')}`)
  console.log('─'.repeat(28 + fwOnly.length * COLW))
  for (const t of tests) {
    const medians = fwOnly.map(
      (s) => s.results.find((x) => x.name === t)?.median ?? Number.POSITIVE_INFINITY,
    )
    const best = Math.min(...medians)
    const cells = medians.map((m) =>
      pad(Number.isFinite(m) ? `${(m / best).toFixed(2)}×` : '—', COLW),
    )
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
