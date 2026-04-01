/**
 * Benchmark comparison tool — reads two JSON benchmark result files (baseline
 * and current) and outputs a markdown table with delta and status indicators.
 *
 * Thresholds:
 *   - >5% regression  = warning
 *   - >20% regression = failure
 *   - <=5% delta      = pass
 *   - improvements    = pass (with arrow)
 *
 * Usage: bun scripts/bench/compare.ts baseline.json current.json
 * Output: Markdown table to stdout
 */

import { readFileSync } from 'node:fs'

interface BenchMetric {
  mean: number
  unit: string
}

interface BenchOutput {
  timestamp: string
  commit: string
  results: Record<string, BenchMetric>
}

// ─── Args ───────────────────────────────────────────────────────────────────

const [baselinePath, currentPath] = process.argv.slice(2)

if (!baselinePath || !currentPath) {
  console.error('Usage: bun scripts/bench/compare.ts <baseline.json> <current.json>')
  process.exit(1)
}

function loadResults(path: string): BenchOutput {
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as BenchOutput
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Failed to load ${path}: ${msg}`)
    process.exit(1)
  }
}

const baseline = loadResults(baselinePath)
const current = loadResults(currentPath)

// ─── Comparison ─────────────────────────────────────────────────────────────

const WARN_THRESHOLD = 0.05 // 5%
const FAIL_THRESHOLD = 0.20 // 20%

interface ComparisonRow {
  name: string
  baselineValue: string
  currentValue: string
  delta: string
  status: string
}

function formatValue(metric: BenchMetric): string {
  if (metric.mean < 0.001) return `${(metric.mean * 1_000_000).toFixed(0)}ns`
  if (metric.mean < 1) return `${(metric.mean * 1000).toFixed(1)}us`
  return `${metric.mean.toFixed(3)}${metric.unit}`
}

function computeDelta(baselineVal: number, currentVal: number): { pct: number; label: string; status: string } {
  if (baselineVal === 0) return { pct: 0, label: 'N/A', status: 'pass' }

  const pct = (currentVal - baselineVal) / baselineVal

  let label: string
  if (Math.abs(pct) < 0.001) {
    label = '0%'
  } else if (pct > 0) {
    label = `+${(pct * 100).toFixed(1)}%`
  } else {
    label = `${(pct * 100).toFixed(1)}%`
  }

  // For timing metrics, higher = slower = regression
  let status: string
  if (pct > FAIL_THRESHOLD) {
    status = 'fail'
  } else if (pct > WARN_THRESHOLD) {
    status = 'warn'
  } else {
    status = 'pass'
  }

  return { pct, label, status }
}

function statusIcon(status: string): string {
  switch (status) {
    case 'pass':
      return 'ok'
    case 'warn':
      return 'WARN'
    case 'fail':
      return 'FAIL'
    default:
      return '?'
  }
}

// ─── Build rows ─────────────────────────────────────────────────────────────

const allKeys = new Set([...Object.keys(baseline.results), ...Object.keys(current.results)])
const sortedKeys = [...allKeys].sort()

const rows: ComparisonRow[] = []
let hasWarning = false
let hasFailure = false

for (const key of sortedKeys) {
  const base = baseline.results[key]
  const curr = current.results[key]

  if (!base && curr) {
    rows.push({
      name: key,
      baselineValue: '-',
      currentValue: formatValue(curr),
      delta: 'new',
      status: 'ok',
    })
    continue
  }

  if (base && !curr) {
    rows.push({
      name: key,
      baselineValue: formatValue(base),
      currentValue: '-',
      delta: 'removed',
      status: 'ok',
    })
    continue
  }

  if (base && curr) {
    const { label, status } = computeDelta(base.mean, curr.mean)
    if (status === 'warn') hasWarning = true
    if (status === 'fail') hasFailure = true

    rows.push({
      name: key,
      baselineValue: formatValue(base),
      currentValue: formatValue(curr),
      delta: label,
      status: statusIcon(status),
    })
  }
}

// ─── Output markdown ────────────────────────────────────────────────────────

const lines: string[] = []

lines.push(`Comparing: \`${baseline.commit}\` (baseline) vs \`${current.commit}\` (current)`)
lines.push('')
lines.push('| Benchmark | Baseline | Current | Delta | Status |')
lines.push('|-----------|----------|---------|-------|--------|')

for (const row of rows) {
  lines.push(`| ${row.name} | ${row.baselineValue} | ${row.currentValue} | ${row.delta} | ${row.status} |`)
}

lines.push('')

if (hasFailure) {
  lines.push('**Result: FAIL** — one or more benchmarks regressed by >20%')
} else if (hasWarning) {
  lines.push('**Result: WARNING** — one or more benchmarks regressed by >5%')
} else {
  lines.push('**Result: PASS** — no significant regressions detected')
}

const report = lines.join('\n')
console.log(report)

// Exit with non-zero if there are failures (for CI gating)
if (hasFailure) {
  process.exit(1)
}
