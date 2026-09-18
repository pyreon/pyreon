import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { CHART_CAPABILITIES, CHART_CAPABILITY_CONTRACT, chartCapabilityScore } from './capability-inventory'

describe('versioned chart capability inventory', () => {
  it('classifies every unique row and attaches repository evidence', () => {
    const packageRoot = existsSync('src/engine/option.ts') ? '.' : 'packages/fundamentals/charts'
    expect(CHART_CAPABILITY_CONTRACT).toMatch(/^option-contract-\d{4}-\d{2}-\d{2}\.\d+$/)
    expect(CHART_CAPABILITIES.length).toBeGreaterThan(50)
    expect(new Set(CHART_CAPABILITIES.map((row) => `${row.mode}:${row.id}`)).size).toBe(CHART_CAPABILITIES.length)
    for (const row of CHART_CAPABILITIES) {
      expect(['complete', 'partial', 'pending']).toContain(row.status)
      expect(row.evidence.length, row.id).toBeGreaterThan(0)
      expect(row.evidence.every((path) => path.startsWith('src/') || path.startsWith('../../native/compiler/')), row.id).toBe(true)
      expect(row.evidence.every((path) => existsSync(resolve(packageRoot, path))), row.id).toBe(true)
    }
  })

  it('keeps direct and hosted scores separate and cannot claim 100 early', () => {
    const direct = chartCapabilityScore('direct')
    const hosted = chartCapabilityScore('hosted')
    expect(direct.total).toBeGreaterThan(hosted.total)
    // The score is the ROW COUNT, never a hand-typed headline: 100 is reachable
    // only when no row is partial or pending.
    const allComplete = (mode: 'direct' | 'hosted') =>
      CHART_CAPABILITIES.filter((row) => row.mode === mode).every((row) => row.status === 'complete')
    expect(direct.percent === 100).toBe(allComplete('direct'))
    expect(hosted.percent === 100).toBe(allComplete('hosted'))
    // Every direct-native row closed (data.transforms, then
    // presentation.universal-transition, were the last two) — 100 is a
    // reachable, honest score now, not a hand-typed one: it falls out of
    // `allComplete('direct')` being true, the same derivation as `hosted`
    // below always used. A NEW row that ships partial (or a regression that
    // reopens one) flips `allComplete` back to false and this back to a
    // guard against claiming 100 early.
    expect(allComplete('direct')).toBe(true)
    expect(allComplete('hosted')).toBe(true)
  })

  it('covers every completion-plan area in the direct ledger', () => {
    expect(new Set(CHART_CAPABILITIES.filter((row) => row.mode === 'direct').map((row) => row.area))).toEqual(
      new Set(['data', 'series', 'coordinates', 'runtime', 'presentation']),
    )
  })

  it('an unknown mode scores zero rather than dividing by an empty set', () => {
    // The `rows.length === 0` arm: a mode with no rows must answer 0%, not NaN
    // — a NaN would render as a blank cell in the ledger and read as "unknown"
    // rather than "nothing claimed".
    const empty = chartCapabilityScore('nope' as never)
    expect(empty).toEqual({ complete: 0, total: 0, percent: 0 })
  })
})
