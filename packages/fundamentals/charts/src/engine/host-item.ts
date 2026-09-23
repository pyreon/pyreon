/**
 * Items under the pointer, as ECharts describes them to a tooltip formatter —
 * the shared helpers the family hosts use to report a `HostItem`.
 */
import type { HostItem } from './canvas-host'
import type { Double } from './types'

/**
 * ECharts' pie `percent`: each value's share of the sum at `precision` places,
 * allocated by largest remainder so the shares add up to exactly 100
 * (`getPercentSeats`). An all-zero or empty list has no shares.
 */
export function percentSeats(values: Double[], precision: number): Double[] {
  let sum = 0.0
  for (const v of values) sum += Number.isNaN(v) ? 0.0 : v
  if (sum === 0.0) return []
  const digits = 10 ** precision
  const votes = values.map((v) => ((Number.isNaN(v) ? 0.0 : v) / sum) * digits * 100.0)
  const seats = votes.map((v) => Math.floor(v))
  const remainder = votes.map((v, i) => v - seats[i]!)
  let current = 0
  for (const s of seats) current += s
  const target = digits * 100
  while (current < target) {
    let max = Number.NEGATIVE_INFINITY
    let at = -1
    for (let i = 0; i < remainder.length; i++) {
      if (remainder[i]! > max) {
        max = remainder[i]!
        at = i
      }
    }
    if (at < 0) break
    seats[at]! += 1
    remainder[at] = 0
    current += 1
  }
  return seats.map((s) => s / digits)
}

/** One named, coloured slice of a whole. */
export interface SliceLike {
  value: Double
  label: string
  color: string
}

/** A pie slice as an item: ECharts' share, allocated so the slices sum to 100. */
export function pieItem(slices: SliceLike[], i: number): HostItem | null {
  const s = slices[i]
  if (s === undefined) return null
  const seats = percentSeats(slices.map((x) => x.value), 2)
  return { seriesIndex: 0, dataIndex: i, name: s.label, value: s.value, color: s.color, percent: seats[i] ?? 0 }
}

/** A funnel stage as an item: ECharts' funnel share is its value over the sum, to two places. */
export function funnelItem(stages: SliceLike[], i: number): HostItem | null {
  const s = stages[i]
  if (s === undefined) return null
  let sum = 0.0
  for (const x of stages) sum += x.value
  const percent = sum === 0.0 ? 0 : Math.round((s.value / sum) * 10000.0) / 100.0
  return { seriesIndex: 0, dataIndex: i, name: s.label, value: s.value, color: s.color, percent }
}
