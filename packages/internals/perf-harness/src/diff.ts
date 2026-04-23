import type { CounterName } from './counters'

export interface CounterDiffEntry {
  name: CounterName
  before: number
  after: number
  delta: number
  /** Percentage change; `null` when `before === 0` (division by zero). */
  pct: number | null
}

export interface CounterDiff {
  entries: CounterDiffEntry[]
  /** Names present in `after` but not `before`. */
  added: CounterName[]
  /** Names present in `before` but not `after`. */
  removed: CounterName[]
}

/**
 * Diff two counter snapshots. Entries are sorted by `|delta|` descending so
 * the largest movers come first — useful when eyeballing a result set.
 *
 * `null` pct means the before value was zero; consumers should render that
 * as "new" or dash.
 */
export function diffSnapshots(
  before: Record<CounterName, number>,
  after: Record<CounterName, number>,
): CounterDiff {
  const keys = new Set<CounterName>()
  for (const k of Object.keys(before)) keys.add(k)
  for (const k of Object.keys(after)) keys.add(k)

  const entries: CounterDiffEntry[] = []
  const added: CounterName[] = []
  const removed: CounterName[] = []

  for (const name of keys) {
    const b = before[name] ?? 0
    const a = after[name] ?? 0
    if (!(name in before)) added.push(name)
    else if (!(name in after)) removed.push(name)
    const delta = a - b
    const pct = b === 0 ? null : (delta / b) * 100
    entries.push({ name, before: b, after: a, delta, pct })
  }

  entries.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
  added.sort()
  removed.sort()

  return { entries, added, removed }
}

/**
 * Render a diff as a fixed-width ASCII table. Used by the dev overlay and by
 * `scripts/perf/diff.ts`.
 */
export function formatDiff(diff: CounterDiff): string {
  if (diff.entries.length === 0) return '(no counters recorded)'

  const headers = ['metric', 'before', 'after', 'delta', 'pct']
  const rows = diff.entries.map((e) => [
    e.name,
    String(e.before),
    String(e.after),
    (e.delta >= 0 ? '+' : '') + e.delta,
    e.pct === null ? '—' : `${e.pct >= 0 ? '+' : ''}${e.pct.toFixed(1)}%`,
  ])

  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)))
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length))
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i] ?? 0)).join('  ')

  return [line(headers), line(widths.map((w) => '─'.repeat(w))), ...rows.map(line)].join('\n')
}
