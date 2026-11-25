#!/usr/bin/env bun
/**
 * Analyzer for `scripts/bench/ab/run.ts` results — one implementation of the
 * guide's A/B verdict rule (`.agents/guides/benchmarks/README.md`,
 * "Interleaved A/B runner").
 *
 *   bun scripts/bench/ab/analyze.ts <results-dir> [--base A] [--rows TEXT] [--json FILE]
 *
 * Reads `manifest.json` and every attempt record, keeps only VALID attempts,
 * pools each run's passes per row (op × framework, or section × library for
 * the micro harness) and prints, for every non-base arm against the base:
 *   both runs' medians with cluster-bootstrap CI95 (page loads or processes as
 *   clusters), CV, clock-quanta count, the per-run direction, and the final
 *   verdict: WIN / LOSS only when the CIs are disjoint in the same direction
 *   in every run (at least two), NO VERDICT under 10 clock quanta or with one
 *   run, otherwise TIE.
 * The data file format is detected per file (bench-scenarios --raw-out,
 * bench-fair --json, reactivity --json).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type Cell,
  cellOf,
  extractClusters,
  finalVerdict,
  type JobsFile,
  runVerdict,
  type ScheduledJob,
} from './lib.ts'

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}
const dir = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1]?.startsWith('--')))
if (!dir) {
  console.error(
    'usage: bun scripts/bench/ab/analyze.ts <results-dir> [--base ARM] [--rows TEXT] [--json FILE]',
  )
  process.exit(2)
}
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
  jobs: JobsFile
  schedule: ScheduledJob[]
  hashes: Record<string, string>
}
const arms = Object.keys(manifest.jobs.arms)
const base = flag('--base') ?? (arms[0] as string)
if (!arms.includes(base)) {
  console.error(`[bench-ab] --base ${base} is not an arm (${arms.join(', ')})`)
  process.exit(2)
}
/** `--rows TEXT`: keep rows whose name contains TEXT (a literal substring, not a pattern). */
const rowFilter = flag('--rows') ?? ''

interface Attempt extends ScheduledJob {
  attempt: number
  status: 'VALID' | 'INVALID'
  reasons: string[]
  data: string | null
  peakLoad1: number
}
const attempts: Attempt[] = readdirSync(dir)
  .filter((f) => /\.a\d+\.json$/.test(f) && !f.endsWith('.data.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Attempt)

// ── Validity summary ────────────────────────────────────────────────────────
const validById = new Map<string, Attempt>()
for (const a of attempts) if (a.status === 'VALID') validById.set(a.id, a)
const invalid = attempts.filter((a) => a.status === 'INVALID')
const missing = manifest.schedule.filter((s) => !validById.has(s.id))
console.log(
  `A/B ${manifest.jobs.name}: base ${base} (${manifest.hashes[base]}) vs ${arms
    .filter((a) => a !== base)
    .map((a) => `${a} (${manifest.hashes[a]})`)
    .join(', ')}`,
)
console.log(
  `  ${validById.size}/${manifest.schedule.length} scheduled jobs VALID; ${invalid.length} invalid attempt(s); ${missing.length} job(s) without a valid attempt`,
)
for (const a of invalid) console.log(`  invalid ${a.id}.a${a.attempt}: ${a.reasons.join(', ')}`)
for (const m of missing) console.log(`  MISSING ${m.id} — not counted`)

// ── Pool: job → run → arm → row → clusters ─────────────────────────────────
type Pool = Map<string, number[][]>
const pools = new Map<string, Map<number, Map<string, Pool>>>()
const windowAveraged = new Map<string, boolean>()
for (const a of validById.values()) {
  if (!a.data) continue
  const { rows, windowAveraged: wa } = extractClusters(JSON.parse(readFileSync(a.data, 'utf8')))
  windowAveraged.set(a.job, wa)
  const byRun = pools.get(a.job) ?? new Map<number, Map<string, Pool>>()
  pools.set(a.job, byRun)
  const byArm = byRun.get(a.run) ?? new Map<string, Pool>()
  byRun.set(a.run, byArm)
  const pool = byArm.get(a.arm) ?? new Map<string, number[][]>()
  byArm.set(a.arm, pool)
  for (const [row, clusters] of rows) pool.set(row, [...(pool.get(row) ?? []), ...clusters])
}

const fmt = (x: number, micro: boolean): string =>
  micro ? `${x.toFixed(1)}ns` : x < 1 ? `${(x * 1000).toFixed(1)}µs` : `${x.toFixed(3)}ms`
const cellStr = (c: Cell, micro: boolean): string =>
  `${fmt(c.median, micro)} [${fmt(c.ci[0], micro)}–${fmt(c.ci[1], micro)}] CV ${(c.cv * 100).toFixed(1)}% ` +
  `q ${Number.isFinite(c.quanta) ? c.quanta.toFixed(0) : 'n/a'} (${c.clusters} cl)`

const report: unknown[] = []
for (const [job, byRun] of pools) {
  const micro = windowAveraged.get(job) === true
  const runs = [...byRun.keys()].sort((x, y) => x - y)
  const rowNames = new Set<string>()
  for (const r of runs) {
    for (const pool of byRun.get(r)!.values()) for (const k of pool.keys()) rowNames.add(k)
  }
  console.log(`\n══ ${job} ${'═'.repeat(Math.max(0, 70 - job.length))}`)
  for (const cand of arms.filter((a) => a !== base)) {
    for (const row of [...rowNames].filter((r) => r.includes(rowFilter))) {
      const perRun: { run: number; a: Cell; b: Cell }[] = []
      const lines: string[] = []
      for (const r of runs) {
        const ca = byRun.get(r)?.get(base)?.get(row)
        const cb = byRun.get(r)?.get(cand)?.get(row)
        if (!ca || !cb) {
          lines.push(`    run ${r}: missing (${!ca ? base : cand})`)
          continue
        }
        const a = cellOf(ca, micro)
        const b = cellOf(cb, micro)
        perRun.push({ run: r, a, b })
        lines.push(
          `    run ${r}: ${base} ${cellStr(a, micro)} | ${cand} ${cellStr(b, micro)} | ${cand}/${base} ${(b.median / a.median).toFixed(3)} | ${runVerdict(a, b).replace('B', cand)}`,
        )
      }
      const v = finalVerdict(perRun)
      console.log(`  ${row} — ${cand} vs ${base}: ${v.verdict} (${v.why})`)
      for (const l of lines) console.log(l)
      report.push({ job, row, base, candidate: cand, verdict: v.verdict, why: v.why, runs: perRun })
    }
  }
}
const jsonOut = flag('--json')
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2))
if (missing.length > 0) {
  console.log(
    `\n⚠ ${missing.length} scheduled job(s) have no valid attempt — their passes are absent from the pools above.`,
  )
}
