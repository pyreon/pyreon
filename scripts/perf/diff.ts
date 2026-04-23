#!/usr/bin/env bun
/**
 * Diff two perf-harness record results.
 *
 *   bun run perf:diff <baseline.json> <current.json> [--threshold 0.10] [--output summary.md]
 *
 * Exit code:
 *   0 if no counter regressed beyond the threshold
 *   1 if one or more counters regressed (counter went UP — "more work done")
 *
 * Note: only UPWARD movement counts as a regression. Counters going DOWN
 * (less work) are always an improvement, no matter how large the delta.
 *
 * --output writes a markdown table suitable for posting as a PR comment.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface RecordFile {
  sha: string
  app: string
  journey: string
  mode: string
  runs: number
  timestamp: string
  medianWallMs: number
  medianHeapBytes: number
  counters: Record<string, number>
}

export interface DiffEntry {
  name: string
  before: number
  after: number
  delta: number
  pct: number | null
  regressed: boolean
}

export interface DiffResult {
  entries: DiffEntry[]
  regressions: DiffEntry[]
  wallMsDelta: number
  heapBytesDelta: number
  regressed: boolean
}

export function diffRecords(
  baseline: RecordFile,
  current: RecordFile,
  threshold: number,
): DiffResult {
  const names = new Set<string>([
    ...Object.keys(baseline.counters),
    ...Object.keys(current.counters),
  ])
  const entries: DiffEntry[] = []
  for (const name of names) {
    const before = baseline.counters[name] ?? 0
    const after = current.counters[name] ?? 0
    const delta = after - before
    const pct = before === 0 ? null : delta / before
    // A regression is an upward move greater than the threshold fraction.
    // Tiny absolute increases (e.g. 2 → 3 on a rarely-hit counter) are
    // filtered by requiring the ABSOLUTE delta exceed max(3, before * threshold).
    // This prevents 0 → 1 or 2 → 3 from tripping the gate when the threshold
    // ratio would otherwise be infinite or massive.
    const absoluteFloor = Math.max(3, before * threshold)
    const regressed = delta > absoluteFloor
    entries.push({ name, before, after, delta, pct, regressed })
  }
  entries.sort((a, b) => b.delta - a.delta)

  return {
    entries,
    regressions: entries.filter((e) => e.regressed),
    wallMsDelta: current.medianWallMs - baseline.medianWallMs,
    heapBytesDelta: current.medianHeapBytes - baseline.medianHeapBytes,
    regressed: entries.some((e) => e.regressed),
  }
}

export function formatMarkdown(
  baseline: RecordFile,
  current: RecordFile,
  diff: DiffResult,
): string {
  const header = `# perf diff — ${current.app} / ${current.journey}

**baseline** \`${baseline.sha}\` @ ${baseline.timestamp} — ${baseline.runs} run(s) median
**current** \`${current.sha}\` @ ${current.timestamp} — ${current.runs} run(s) median

| metric | baseline | current | Δ | % |
| --- | ---: | ---: | ---: | ---: |
| wall-clock (ms) | ${baseline.medianWallMs} | ${current.medianWallMs} | ${signed(diff.wallMsDelta)} | ${pctOf(baseline.medianWallMs, diff.wallMsDelta)} |
| heap (MB) | ${mb(baseline.medianHeapBytes)} | ${mb(current.medianHeapBytes)} | ${signed(Math.round(diff.heapBytesDelta / 1024 / 1024 * 10) / 10)} | ${pctOf(baseline.medianHeapBytes, diff.heapBytesDelta)} |
`

  const counterRows = diff.entries
    .filter((e) => e.delta !== 0)
    .map(
      (e) =>
        `| ${e.regressed ? '🔴 ' : ''}${e.name} | ${e.before} | ${e.after} | ${signed(e.delta)} | ${
          e.pct === null ? '—' : `${signed(Math.round(e.pct * 1000) / 10)}%`
        } |`,
    )

  const counters = counterRows.length > 0
    ? `
## counters

| metric | baseline | current | Δ | % |
| --- | ---: | ---: | ---: | ---: |
${counterRows.join('\n')}
`
    : '\n_(no counter deltas)_\n'

  const verdict = diff.regressed
    ? `\n**${diff.regressions.length} counter(s) regressed past threshold.** 🔴\n`
    : '\n_No regressions._ ✅\n'

  return header + counters + verdict
}

function signed(n: number): string {
  if (n === 0) return '0'
  return n > 0 ? `+${n}` : `${n}`
}

function pctOf(base: number, delta: number): string {
  if (base === 0) return '—'
  return `${signed(Math.round((delta / base) * 1000) / 10)}%`
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  baseline: string
  current: string
  threshold: number
  output: string | undefined
} {
  const positional: string[] = []
  let threshold = 0.1
  let output: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const v = argv[i + 1]
    if (a === '--threshold' && v) {
      threshold = Number(v)
      i++
    } else if (a === '--output' && v) {
      output = v
      i++
    } else if (a && !a.startsWith('--')) {
      positional.push(a)
    }
  }
  if (positional.length < 2) {
    console.error('usage: bun run perf:diff <baseline.json> <current.json> [--threshold 0.10] [--output summary.md]')
    process.exit(1)
  }
  return {
    baseline: positional[0] as string,
    current: positional[1] as string,
    threshold,
    output,
  }
}

function readRecord(path: string): RecordFile {
  const full = resolve(path)
  if (!existsSync(full)) {
    console.error(`[diff] file not found: ${path}`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(full, 'utf8')) as RecordFile
}

// `import.meta.main` is a Bun extension — see `bun-types`. Script entry point
// check so this file is also importable as a library from unit tests.
interface BunMeta {
  main?: boolean
}
if ((import.meta as BunMeta).main) {
  const args = parseArgs(process.argv.slice(2))
  const baseline = readRecord(args.baseline)
  const current = readRecord(args.current)
  const diff = diffRecords(baseline, current, args.threshold)
  const md = formatMarkdown(baseline, current, diff)

  process.stdout.write(`${md}\n`)
  if (args.output) {
    writeFileSync(resolve(args.output), md)
    process.stderr.write(`[diff] wrote ${args.output}\n`)
  }
  process.exit(diff.regressed ? 1 : 0)
}
