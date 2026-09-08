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
  /** Where the recording ran (`local` / `ci:Linux`). Absent on pre-2026-09 files. */
  host?: string
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

/**
 * SUCCESS counters count a cheap path WINNING, so a DROP is the regression
 * and a rise is the improvement. Everything else counts work done, where the
 * signs are the other way round. Two naming conventions mark them, and the
 * name is the whole classification — there is no catalog metadata:
 *
 *   - `.hit` suffix — a cache answered instead of recomputing.
 *   - `Fast` suffix — a reconciler fast path handled an update instead of
 *     falling through to the general algorithm (`runtime.mountFor.insertFast`
 *     and its `removeFast` / `clearFast` / `replaceFast` siblings).
 *
 * The `Fast` family predates this function and was silently read as WORK, so
 * a fast path that started firing was reported as a regression (measured: a
 * chat journey's `insertFast` 0 → 10 after #2669 landed the contiguous-
 * insertion path, flagged 🔴) while a fast path that STOPPED firing — the
 * genuine regression, and the reason those counters exist — was invisible.
 */
function isSuccessCounter(name: string): boolean {
  return name.endsWith('.hit') || name.endsWith('Fast')
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
    // A regression is a MEANINGFUL movement in the BAD direction:
    //   - work counters (default): UP is bad
    //   - success counters (.hit / Fast): DOWN is bad (the cheap path stopped
    //     winning — a cache went cold, or a reconciler fast path stopped
    //     firing and every update now takes the general algorithm)
    //
    // Tiny absolute movements are filtered by requiring the ABSOLUTE delta
    // exceed max(3, before * threshold). Prevents 0 → 1 or 2 → 3 from
    // tripping the gate on rarely-hit counters.
    const absoluteFloor = Math.max(3, before * threshold)
    const badMove = isSuccessCounter(name) ? -delta : delta
    const regressed = badMove > absoluteFloor
    entries.push({ name, before, after, delta, pct, regressed })
  }
  // Sort by "bad move" magnitude descending so the worst regressions bubble
  // up regardless of whether they're hit-drops or work-spikes.
  entries.sort((a, b) => {
    const badA = isSuccessCounter(a.name) ? -a.delta : a.delta
    const badB = isSuccessCounter(b.name) ? -b.delta : b.delta
    return badB - badA
  })

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
  // Only the COUNTER table is gated; wall-clock and heap are informational.
  // Say so when the two recordings come from different machine classes,
  // because that is exactly when the percentages look alarming and mean
  // nothing — a laptop baseline against a CI runner reads as +570%.
  const hostNote =
    baseline.host !== undefined && current.host !== undefined && baseline.host !== current.host
      ? `\n> ⚠️ Recorded on different hosts (baseline \`${baseline.host}\`, current \`${current.host}\`).\n> Wall-clock and heap below are NOT comparable; only the counter table is meaningful.\n`
      : ''

  const header = `# perf diff — ${current.app} / ${current.journey}

**baseline** \`${baseline.sha}\` @ ${baseline.timestamp} — ${baseline.runs} run(s) median
**current** \`${current.sha}\` @ ${current.timestamp} — ${current.runs} run(s) median
${hostNote}
| metric | baseline | current | Δ | % |
| --- | ---: | ---: | ---: | ---: |
| wall-clock (ms) | ${baseline.medianWallMs} | ${current.medianWallMs} | ${signed(diff.wallMsDelta)} | ${pctOf(baseline.medianWallMs, diff.wallMsDelta)} |
| heap (MB) | ${mb(baseline.medianHeapBytes)} | ${mb(current.medianHeapBytes)} | ${signed(Math.round((diff.heapBytesDelta / 1024 / 1024) * 10) / 10)} | ${pctOf(baseline.medianHeapBytes, diff.heapBytesDelta)} |
`

  const counterRows = diff.entries
    .filter((e) => e.delta !== 0)
    .map(
      (e) =>
        `| ${e.regressed ? '🔴 ' : ''}${e.name} | ${e.before} | ${e.after} | ${signed(e.delta)} | ${
          e.pct === null ? '—' : `${signed(Math.round(e.pct * 1000) / 10)}%`
        } |`,
    )

  const counters =
    counterRows.length > 0
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
    console.error(
      'usage: bun run perf:diff <baseline.json> <current.json> [--threshold 0.10] [--output summary.md]',
    )
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
