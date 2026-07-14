/**
 * Unified benchmark runner — runs all core benchmarks (excluding dom.ts which
 * needs Playwright/browser) and outputs structured JSON.
 *
 * Each benchmark file is executed as a subprocess. Pyreon-only results are
 * extracted from stdout. The runner captures representative metrics for each
 * benchmark category and normalizes them into a consistent format.
 *
 * Usage: bun scripts/bench/run-all.ts
 * Output: JSON to stdout (pipe to file for CI)
 */

import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '../..')

interface BenchMetric {
  mean: number
  unit: string
}

interface BenchOutput {
  timestamp: string
  commit: string
  results: Record<string, BenchMetric>
}

function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Run a benchmark script and return its stdout.
 */
function runBench(scriptPath: string): string {
  const fullPath = resolve(ROOT, scriptPath)
  try {
    return execSync(`bun ${fullPath}`, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 120_000,
      env: { ...process.env, NODE_ENV: 'production' },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[bench] Failed to run ${scriptPath}: ${msg}`)
    return ''
  }
}

// ─── Parsers ────────────────────────────────────────────────────────────────

/**
 * Parse ops/sec from a line like:
 *   "Pyreon signal create+read+write     2,500,000         400"
 * Returns { label, opsPerSec, avgNs }
 */
function parseOpsLine(line: string): { label: string; opsPerSec: number; avgNs: number } | null {
  // Match lines with at least two number columns (ops/sec and avg ns/op)
  const match = line.match(/^(.+?)\s{2,}([\d,]+)\s+([\d,]+)\s*$/)
  if (!match) return null
  const [, labelRaw, opsRaw, avgRaw] = match
  if (!labelRaw || !opsRaw || !avgRaw) return null
  const opsPerSec = Number(opsRaw.replace(/,/g, ''))
  const avgNs = Number(avgRaw.replace(/,/g, ''))
  if (Number.isNaN(opsPerSec) || Number.isNaN(avgNs)) return null
  return { label: labelRaw.trim(), opsPerSec, avgNs }
}

/**
 * Parse renders/sec lines from SSR benchmark:
 *   "empty                        12,000       0.083         2,500"
 */
function parseSSRLine(
  line: string,
): { label: string; rendersPerSec: number; avgMs: number } | null {
  const match = line.match(/^(.+?)\s{2,}([\d,]+)\s+([\d.]+)\s+([\d,]+)\s*$/)
  if (!match) return null
  const [, labelRaw, rendersRaw, avgRaw] = match
  if (!labelRaw || !rendersRaw || !avgRaw) return null
  const rendersPerSec = Number(rendersRaw.replace(/,/g, ''))
  const avgMs = Number(avgRaw)
  if (Number.isNaN(rendersPerSec) || Number.isNaN(avgMs)) return null
  return { label: labelRaw.trim(), rendersPerSec, avgMs }
}

// ─── Extractors ─────────────────────────────────────────────────────────────

function extractReactivity(output: string, results: Record<string, BenchMetric>): void {
  const lines = output.split('\n')
  for (const line of lines) {
    const parsed = parseOpsLine(line)
    if (!parsed || !parsed.label.startsWith('Pyreon')) continue

    const key = parsed.label
      .replace(/^Pyreon\s+/, '')
      .toLowerCase()
      .replace(/\s+/g, '-')

    results[`reactivity/${key}`] = {
      mean: parsed.avgNs / 1_000_000, // ns to ms
      unit: 'ms',
    }
  }
}

function extractCompiler(output: string, results: Record<string, BenchMetric>): void {
  const lines = output.split('\n')
  for (const line of lines) {
    const parsed = parseOpsLine(line)
    if (!parsed) continue

    // Only extract Pyreon pipeline results (not alternatives)
    if (
      parsed.label.includes('Pyreon + OXC') ||
      parsed.label.includes('Pyreon reactive pass only')
    ) {
      // Find which size section we're in by looking at previous lines
      const key = parsed.label
        .replace(/\s*└─\s*/, '')
        .toLowerCase()
        .replace(/[()]/g, '')
        .replace(/\s+/g, '-')

      results[`compiler/${key}`] = {
        mean: parsed.avgNs / 1_000_000,
        unit: 'ms',
      }
    }
  }
}

function extractRouter(output: string, results: Record<string, BenchMetric>): void {
  // Router outputs a table per route-table size. Extract Pyreon column averages.
  const lines = output.split('\n')
  let currentSize = ''

  for (const line of lines) {
    const sizeMatch = line.match(/Route table: (\d+) routes/)
    if (sizeMatch) {
      const [, size] = sizeMatch
      if (!size) continue
      currentSize = size
      continue
    }

    // Average line: "  average           1,234,567  ..."
    if (line.trim().startsWith('average') && currentSize) {
      // The first number after "average" is Pyreon's ops/sec
      const nums = line.match(/[\d,]+/g)
      if (nums?.[0]) {
        const pyreonOps = Number(nums[0].replace(/,/g, ''))
        results[`router/match-${currentSize}-routes`] = {
          mean: pyreonOps > 0 ? 1_000_000 / pyreonOps : 0, // convert ops/sec to us per op, store as ms
          unit: 'ms',
        }
      }
    }
  }
}

function extractSSR(output: string, results: Record<string, BenchMetric>): void {
  const lines = output.split('\n')
  for (const line of lines) {
    const parsed = parseSSRLine(line)
    if (!parsed) continue

    const key = parsed.label.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, '-')

    results[`ssr/${key}`] = {
      mean: parsed.avgMs,
      unit: 'ms',
    }
  }
}

function extractHead(output: string, results: Record<string, BenchMetric>): void {
  const lines = output.split('\n')
  for (const line of lines) {
    const parsed = parseOpsLine(line)
    if (!parsed || !parsed.label.startsWith('Pyreon')) continue

    const key = parsed.label
      .replace(/^Pyreon\s+/, '')
      .toLowerCase()
      .replace(/[()]/g, '')
      .replace(/\s+/g, '-')

    results[`head/${key}`] = {
      mean: parsed.avgNs / 1_000_000,
      unit: 'ms',
    }
  }
}

function extractServer(output: string, results: Record<string, BenchMetric>): void {
  const lines = output.split('\n')
  for (const line of lines) {
    // Sync benchmarks (template, scripts)
    const syncParsed = parseOpsLine(line)
    if (syncParsed) {
      const key = syncParsed.label.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, '-')
      results[`server/${key}`] = {
        mean: syncParsed.avgNs / 1_000_000,
        unit: 'ms',
      }
      continue
    }

    // Handler throughput lines: "simple (1 route)       5,000         0.200"
    const handlerMatch = line.match(/^(.+?)\s{2,}([\d,]+)\s+([\d.]+)\s*$/)
    if (handlerMatch) {
      const [, labelRaw, , avgRaw] = handlerMatch
      if (!labelRaw || !avgRaw) continue
      const label = labelRaw.trim()
      const avgMs = Number(avgRaw)
      if (!Number.isNaN(avgMs) && (label.includes('route') || label.includes('deep'))) {
        const key = label.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, '-')
        results[`server/handler-${key}`] = {
          mean: avgMs,
          unit: 'ms',
        }
      }
    }
  }
}

/** Parse a `375.0K` / `36.39M` / `3.9K` ops value into a plain number. */
function parseOpsValue(raw: string): number {
  const m = raw.match(/^([\d.]+)([KM]?)$/)
  if (!m) return NaN
  const n = Number(m[1])
  if (Number.isNaN(n)) return NaN
  return m[2] === 'M' ? n * 1_000_000 : m[2] === 'K' ? n * 1_000 : n
}

function extractStyler(output: string, results: Record<string, BenchMetric>): void {
  // The styler CSS-in-JS engine bench prints one `report()` block per operation
  // with a title line, then per-library rows. Extract the Pyreon row's ops/sec.
  const lines = output.split('\n')
  let section = ''
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('Cold insert')) section = 'cold-insert'
    else if (t.startsWith('Warm dedup')) section = 'warm-dedup'
    else if (t.startsWith('Dynamic resolve')) section = 'dynamic-resolve'
    else if (t.startsWith('SSR collect')) section = 'ssr-collect'
    if (!section) continue
    const row = line.match(/^\s*@pyreon\/styler\s+([\d.]+[KM]?)\s+ops\/s/)
    if (!row) continue
    const ops = parseOpsValue(row[1]!)
    if (Number.isNaN(ops)) continue
    results[`styler/${section}`] = { mean: ops, unit: 'ops/s' }
  }
}

function extractUnistyle(output: string, results: Record<string, BenchMetric>): void {
  // The unistyle responsive-resolution bench prints `    <label>  <ops> ops/s`
  // rows. Capture the headline hot-path rows by label.
  const labels: Record<string, string> = {
    'styles() flat': 'styles-flat',
    scalar: 'resolve-scalar',
    'mobile-first array': 'resolve-array',
    'breakpoint object': 'resolve-object',
    'cache hit': 'cache-hit',
    'delta pass': 'delta-optimize',
  }
  for (const line of output.split('\n')) {
    const row = line.match(/^\s+(.+?)\s{2,}([\d.]+[KM]?)\s+ops\/s/)
    if (!row) continue
    const key = labels[row[1]!.trim()]
    if (!key) continue
    const ops = parseOpsValue(row[2]!)
    if (Number.isNaN(ops)) continue
    results[`unistyle/${key}`] = { mean: ops, unit: 'ops/s' }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

const results: Record<string, BenchMetric> = {}

const benchmarks = [
  { script: 'scripts/bench/core/reactivity.ts', extractor: extractReactivity, name: 'reactivity' },
  { script: 'scripts/bench/core/compiler.ts', extractor: extractCompiler, name: 'compiler' },
  { script: 'scripts/bench/core/router.ts', extractor: extractRouter, name: 'router' },
  {
    script: 'scripts/bench/core/runtime-server.ts',
    extractor: extractSSR,
    name: 'runtime-server',
  },
  { script: 'scripts/bench/core/head.ts', extractor: extractHead, name: 'head' },
  { script: 'scripts/bench/core/server.ts', extractor: extractServer, name: 'server' },
  { script: 'scripts/bench/core/styler.ts', extractor: extractStyler, name: 'styler' },
  { script: 'scripts/bench/core/unistyle.ts', extractor: extractUnistyle, name: 'unistyle' },
]

for (const { script, extractor, name } of benchmarks) {
  console.error(`[bench] Running ${name}...`)
  const output = runBench(script)
  if (output) {
    extractor(output, results)
    console.error(`[bench] ${name} done — ${Object.keys(results).length} metrics total`)
  }
}

const output: BenchOutput = {
  timestamp: new Date().toISOString(),
  commit: getCommitHash(),
  results,
}

// Output JSON to stdout (stderr was used for progress)
console.log(JSON.stringify(output, null, 2))
