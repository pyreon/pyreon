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

function loadReport(path: string): BudgetReport {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as BudgetReport
  } catch (err) {
    console.error(`Failed to load ${path}: ${(err as Error).message}`)
    process.exit(2)
  }
}

/** Generic `--flag value` parser. Kept out of module scope so importing the
 * file (for tests) never touches `process.argv` or exits. */
function parseArgs(argv: string[]): { positionals: string[]; flags: Record<string, string> } {
  const flags: Record<string, string> = {}
  const positionals: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a.startsWith('--')) {
      flags[a.slice(2)] = argv[i + 1] ?? ''
      i++
    } else {
      positionals.push(a)
    }
  }
  return { positionals, flags }
}

interface DiffRow {
  name: string
  baseGzip: number | null
  prGzip: number | null
  delta: number
  pct: number
}

export interface RenderOptions {
  /** Human label for the comparison base, shown in the footer. */
  baseLabel?: string | undefined
  /** Optional context line rendered under the heading (e.g. release PR count). */
  note?: string | undefined
}

function fmt(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(2)} KB`
}

function fmtDelta(r: DiffRow): string {
  if (r.delta === 0) return '—'
  // A package with no base (or no PR) side has no meaningful percentage — the
  // old code printed a bogus "(+0.0%)" for every newly-added package. Name it.
  if (r.baseGzip === null) return `🆕 new (${fmt(r.prGzip)})`
  if (r.prGzip === null) return `🗑️ removed (was ${fmt(r.baseGzip)})`
  const sign = r.delta > 0 ? '+' : ''
  const pctStr = Number.isFinite(r.pct) ? ` (${sign}${r.pct.toFixed(1)}%)` : ''
  const arrow = r.delta > 0 ? '🔴' : '🟢'
  return `${arrow} ${sign}${fmt(r.delta)}${pctStr}`
}

/**
 * Pure diff renderer: two budget reports → the markdown comment body + the
 * regression count. Exported so it can be unit-tested without spawning the CLI.
 */
export function renderDiff(
  baseReport: BudgetReport,
  prReport: BudgetReport,
  opts: RenderOptions = {},
): { summary: string; regressions: number } {
  const baseMap = new Map(baseReport.measured.map((m) => [m.name, m]))
  const prMap = new Map(prReport.measured.map((m) => [m.name, m]))

  const rows: DiffRow[] = []
  const allNames = new Set([...baseMap.keys(), ...prMap.keys()])
  for (const name of [...allNames].sort()) {
    const baseGzip = baseMap.get(name)?.gzip ?? null
    const prGzip = prMap.get(name)?.gzip ?? null
    if (baseGzip === null && prGzip === null) continue
    const delta = (prGzip ?? 0) - (baseGzip ?? 0)
    const pct = baseGzip ? (delta / baseGzip) * 100 : 0
    rows.push({ name, baseGzip, prGzip, delta, pct })
  }

  // Only show rows with a non-zero delta — keep the comment short. Sort by
  // abs delta descending so the biggest movers surface first.
  const movers = rows.filter((r) => r.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  // Regression threshold: 5% AND > 100 bytes (absolute floor keeps tiny
  // packages from tripping the gate on noise). Match the perf:diff approach:
  // never flag rounding-noise as a real regression. A new package (baseGzip
  // null → pct 0) is not a regression of anything, so it's excluded here.
  const regressions = movers.filter((r) => r.pct > 5 && r.delta > 100)

  const baseLabel = opts.baseLabel || 'the base'
  const lines: string[] = ['<!-- bundle-size-diff -->', '## 📦 Bundle size diff', '']

  if (opts.note) {
    lines.push(`_${opts.note}_`, '')
  }

  if (movers.length === 0) {
    lines.push('_No packages changed size._')
  } else {
    if (regressions.length > 0) {
      lines.push(`**${regressions.length} package(s) regressed past threshold (>5% AND >100 bytes).** 🔴`, '')
    } else {
      lines.push('_All deltas within noise threshold._ ✅', '')
    }
    lines.push('| Package | Base (gzip) | PR (gzip) | Δ |', '| --- | ---: | ---: | ---: |')
    for (const r of movers) {
      lines.push(`| \`${r.name}\` | ${fmt(r.baseGzip)} | ${fmt(r.prGzip)} | ${fmtDelta(r)} |`)
    }
  }

  lines.push('', `<sub>${rows.length} packages measured · diff against ${baseLabel}.</sub>`)
  return { summary: lines.join('\n'), regressions: regressions.length }
}

if (import.meta.main) {
  const { positionals, flags } = parseArgs(process.argv.slice(2))
  if (positionals.length < 2) {
    console.error(
      'usage: bun run scripts/bundle-size-diff.ts <base.json> <pr.json> [--output <md>] [--base-label <text>] [--note <text>]',
    )
    process.exit(2)
  }
  const [basePath, prPath] = positionals as [string, string]
  const { summary, regressions } = renderDiff(loadReport(basePath), loadReport(prPath), {
    // Fall back to the file path so a bare local invocation still says something.
    baseLabel: flags['base-label'] || `base \`${basePath}\``,
    note: flags.note,
  })
  if (flags.output) {
    writeFileSync(flags.output, `${summary}\n`)
    console.log(`[bundle-size-diff] wrote ${flags.output}`)
  } else {
    console.log(summary)
  }
  process.exit(regressions > 0 ? 1 : 0)
}
