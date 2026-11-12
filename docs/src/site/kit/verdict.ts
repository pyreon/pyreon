import type { Verdict } from '../content/model'

/**
 * Benchmark verdict vocabulary (one for tables, cards and videos). The chip
 * always carries its text label; colour is never the only signal.
 */
export const VERDICT_LABEL: Readonly<Record<Verdict, string>> = {
  win: 'win',
  tie: 'tie',
  split: 'split',
  loss: 'loss',
  info: 'measured',
}

export function verdictLabel(v: string): string {
  return v in VERDICT_LABEL ? VERDICT_LABEL[v as Verdict] : 'measured'
}

/** Unknown verdicts render as `info` ("measured"), never as a win. */
export function normalizeVerdict(v: string): Verdict {
  return v in VERDICT_LABEL ? (v as Verdict) : 'info'
}

/** Format a measured value; sub-millisecond `ms` values print as µs. */
export function formatMeasure(value: number, unit: string): string {
  if (unit === 'ms' && value < 1) return `${Math.round(value * 1000).toLocaleString('en')} µs`
  const n = Number.isInteger(value) ? value.toLocaleString('en') : value.toLocaleString('en', { maximumFractionDigits: 2 })
  return unit ? `${n} ${unit}` : n
}

/** Bar widths (percent of the larger value, min 2%) for a lower-is-better pair. */
export function barWidths(pyreon: number, rival: number): { pyreon: number; rival: number } {
  const max = Math.max(pyreon, rival) || 1
  const pct = (v: number) => Math.max(2, Math.round((1000 * v) / max) / 10)
  return { pyreon: pct(pyreon), rival: pct(rival) }
}

/** The fixed provenance line every benchmark table carries. */
export const RECORD_LINE = 'Apple M3 Max · record of 2026-11-05'
