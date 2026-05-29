#!/usr/bin/env bun
/**
 * Compare two `bun run check-bundle-budgets --json` outputs and emit a
 * markdown summary. Used by the `bundle-size-diff.yml` PR-comment workflow.
 *
 *   bun run scripts/bundle-size-diff.ts <base.json> <pr.json> [--output <md>]
 *
 * Exit codes:
 *   0 — diff produced, no regressions
 *   1 — diff produced, at least one regression beyond threshold
 *   2 — input shape problem (missing files, malformed JSON)
 */

import { readFileSync, writeFileSync } from 'node:fs'

interface Measured {
  name: string
  raw: number
  gzip: number
}

interface BudgetReport {
  measured: Measured[]
  violations?: unknown[]
  missing?: unknown[]
  failures?: unknown[]
}

const args = process.argv.slice(2)
const outputIdx = args.indexOf('--output')
const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : undefined
const positionals = args.filter((a, i) => {
  if (a === '--output') return false
  if (i > 0 && args[i - 1] === '--output') return false
  return !a.startsWith('--')
})

if (positionals.length < 2) {
  console.error('usage: bun run scripts/bundle-size-diff.ts <base.json> <pr.json> [--output <md>]')
  process.exit(2)
}

const [basePath, prPath] = positionals as [string, string]

function loadReport(path: string): BudgetReport {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as BudgetReport
  } catch (err) {
    console.error(`Failed to load ${path}: ${(err as Error).message}`)
    process.exit(2)
  }
}

const base = loadReport(basePath)
const pr = loadReport(prPath)

const baseMap = new Map(base.measured.map((m) => [m.name, m]))
const prMap = new Map(pr.measured.map((m) => [m.name, m]))

interface DiffRow {
  name: string
  baseGzip: number | null
  prGzip: number | null
  delta: number
  pct: number
}

const rows: DiffRow[] = []
const allNames = new Set([...baseMap.keys(), ...prMap.keys()])
for (const name of [...allNames].sort()) {
  const b = baseMap.get(name)
  const p = prMap.get(name)
  const baseGzip = b?.gzip ?? null
  const prGzip = p?.gzip ?? null
  if (baseGzip === null && prGzip === null) continue
  const delta = (prGzip ?? 0) - (baseGzip ?? 0)
  const pct = baseGzip ? (delta / baseGzip) * 100 : 0
  rows.push({ name, baseGzip, prGzip, delta, pct })
}

// Only show rows with non-zero delta — keep the comment short. Sort by
// abs delta descending so the biggest movers surface first.
const movers = rows
  .filter((r) => r.delta !== 0)
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

// Regression threshold: 5% AND > 100 bytes (absolute floor keeps tiny
// packages from tripping the gate on noise). Match the perf:diff
// approach: never flag rounding-noise as a real regression.
const REGRESSIONS = movers.filter((r) => r.pct > 5 && r.delta > 100)

function fmt(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(2)} KB`
}

function fmtDelta(d: number, pct: number): string {
  if (d === 0) return '—'
  const sign = d > 0 ? '+' : ''
  const pctStr = Number.isFinite(pct) ? ` (${sign}${pct.toFixed(1)}%)` : ''
  const arrow = d > 0 ? '🔴' : '🟢'
  return `${arrow} ${sign}${fmt(d)}${pctStr}`
}

const lines: string[] = []
lines.push('<!-- bundle-size-diff -->')
lines.push('## 📦 Bundle size diff')
lines.push('')

if (movers.length === 0) {
  lines.push('_No packages changed size._')
} else {
  if (REGRESSIONS.length > 0) {
    lines.push(
      `**${REGRESSIONS.length} package(s) regressed past threshold (>5% AND >100 bytes).** 🔴`,
    )
    lines.push('')
  } else {
    lines.push('_All deltas within noise threshold._ ✅')
    lines.push('')
  }
  lines.push('| Package | Base (gzip) | PR (gzip) | Δ |')
  lines.push('| --- | ---: | ---: | ---: |')
  for (const r of movers) {
    lines.push(
      `| \`${r.name}\` | ${fmt(r.baseGzip)} | ${fmt(r.prGzip)} | ${fmtDelta(r.delta, r.pct)} |`,
    )
  }
}

lines.push('')
lines.push(`<sub>${rows.length} packages measured · diff against base \`${basePath}\`.</sub>`)

const summary = lines.join('\n')

if (outputPath) {
  writeFileSync(outputPath, `${summary}\n`)
  console.log(`[bundle-size-diff] wrote ${outputPath}`)
} else {
  console.log(summary)
}

process.exit(REGRESSIONS.length > 0 ? 1 : 0)
