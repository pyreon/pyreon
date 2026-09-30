import { describe, expect, it } from 'vitest'
import { monthIndexOf, monthStartMs, timeTicks } from './scale-extra'

const DAY = 86_400_000

describe('timeTicks — calendar-aligned month / quarter / year steps', () => {
  it('month ticks sit exactly on UTC month starts, labelled with that month', () => {
    const ticks = timeTicks({ min: Date.UTC(2024, 0, 15), max: Date.UTC(2026, 11, 20) }, 0, 600, 30)
    expect(ticks.length).toBeGreaterThan(5)
    for (const t of ticks) {
      const d = new Date(t.value)
      expect(d.getUTCDate()).toBe(1)
      expect(d.getUTCHours()).toBe(0)
      expect(t.label).toBe(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    }
  })

  it('quarter ticks land on Jan/Apr/Jul/Oct 1', () => {
    const ticks = timeTicks({ min: Date.UTC(2020, 1, 3), max: Date.UTC(2025, 5, 1) }, 0, 600, 12)
    expect(ticks.length).toBeGreaterThan(3)
    for (const t of ticks) {
      const d = new Date(t.value)
      expect(d.getUTCDate()).toBe(1)
      expect(d.getUTCMonth() % 3).toBe(0)
    }
  })

  it('year ticks land on Jan 1 of round years', () => {
    const ticks = timeTicks({ min: Date.UTC(1990, 6, 1), max: Date.UTC(2040, 0, 1) }, 0, 600, 6)
    expect(ticks.length).toBeGreaterThan(2)
    for (const t of ticks) {
      const d = new Date(t.value)
      expect(d.getUTCMonth()).toBe(0)
      expect(d.getUTCDate()).toBe(1)
      expect(d.getUTCFullYear() % 10).toBe(0)
      expect(t.label).toBe(String(d.getUTCFullYear()))
    }
  })

  it('monthIndexOf / monthStartMs round-trip across eras', () => {
    for (const [y, m] of [[1969, 11], [1970, 0], [2000, 1], [2024, 1], [2100, 11], [1600, 2]] as const) {
      const ms = Date.UTC(y, m, 1)
      expect(monthStartMs(monthIndexOf(ms))).toBe(ms)
      expect(monthIndexOf(ms + 5 * DAY)).toBe(y * 12 + m)
    }
  })
})
