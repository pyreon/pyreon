import { describe, expect, it } from 'vitest'
import {
  buildEntrySource,
  compareToBudgets,
  SCENARIOS,
  type MeasuredImport,
} from '../../../../../scripts/check-import-budgets'

// Pure-logic tests for the per-import bundle gate. The measurement
// (Bun.build) is exercised by running the script itself in CI; here we
// lock the pure pieces — the entry-source generator + the budget
// comparator — which are where a bug would silently weaken the gate.

describe('buildEntrySource', () => {
  it('re-exports the chosen symbols FROM the lib path (so only those stay live)', () => {
    const src = buildEntrySource('/abs/lib/index.js', ['mount', 'render'])
    expect(src).toContain('export { mount, render } from')
    // The path is a JSON string literal — survives odd chars / backslashes.
    expect(src).toContain('"/abs/lib/index.js"')
  })

  it('joins multiple imports with a comma', () => {
    const src = buildEntrySource('/x.js', ['a', 'b', 'c'])
    expect(src).toContain('export { a, b, c } from "/x.js"')
  })

  it('JSON-encodes the path so a backslash/quote cannot break the literal', () => {
    const src = buildEntrySource('/weird\\path"x/index.js', ['m'])
    // The raw path must NOT appear unescaped; the JSON form must.
    expect(src).toContain(JSON.stringify('/weird\\path"x/index.js'))
  })
})

describe('compareToBudgets', () => {
  const m = (id: string, gzip: number, failed = false): MeasuredImport => ({
    id,
    pkg: 'pkg',
    raw: gzip * 3,
    gzip,
    ...(failed ? { failed: true, error: 'boom' } : {}),
  })

  it('passes when every scenario is at or under budget', () => {
    const { regressions, missing } = compareToBudgets(
      [m('a', 100), m('b', 200)],
      { a: 100, b: 250 },
    )
    expect(regressions).toEqual([])
    expect(missing).toEqual([])
  })

  it('flags a scenario that exceeds its budget (the tree-shaking-broke regression)', () => {
    const { regressions } = compareToBudgets([m('a', 9000)], { a: 8000 })
    expect(regressions).toHaveLength(1)
    expect(regressions[0]).toMatchObject({ id: 'a', gzip: 9000, budget: 8000, overBy: 1000 })
  })

  it('treats a scenario with no budget as a regression-worthy "missing" (must be locked)', () => {
    const { missing, regressions } = compareToBudgets([m('newScenario', 500)], {})
    expect(missing).toEqual(['newScenario'])
    expect(regressions).toEqual([])
  })

  it('skips failed builds (they are surfaced separately, not as budget regressions)', () => {
    const { regressions, missing } = compareToBudgets([m('a', 0, true)], { a: 100 })
    expect(regressions).toEqual([])
    expect(missing).toEqual([])
  })

  it('exact-equal to budget is NOT a regression (boundary)', () => {
    const { regressions } = compareToBudgets([m('a', 8000)], { a: 8000 })
    expect(regressions).toEqual([])
  })
})

describe('SCENARIOS', () => {
  it('covers the app-critical client packages', () => {
    const pkgs = new Set(SCENARIOS.map((s) => s.pkg))
    expect(pkgs).toContain('@pyreon/reactivity')
    expect(pkgs).toContain('@pyreon/runtime-dom')
    expect(pkgs).toContain('@pyreon/router')
    expect(pkgs).toContain('@pyreon/core')
  })

  it('every scenario has a unique id + non-empty imports + a packages-relative dir', () => {
    const ids = SCENARIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SCENARIOS) {
      expect(s.imports.length).toBeGreaterThan(0)
      expect(s.dir).toMatch(/^[\w-]+\/[\w-]+$/) // e.g. "core/runtime-dom"
      expect(s.id).toContain('::')
    }
  })
})

describe('VERSION_NOISE_BYTES', () => {
  const measured = (gzip: number) => [{ id: 'p::x', gzip, failed: false } as never]

  it('tolerates the byte a version bump moves, with no code change', () => {
    // Every package embeds its own version, and `"0.51.0"` vs `"0.52.0"` gzip
    // to different sizes despite being the same length. Budgets are locked at
    // the exact measured value, so without slack every release PR reds this
    // gate for a change that touched no code.
    expect(compareToBudgets(measured(597), { 'p::x': 596 }).regressions).toEqual([])
  })

  it('still fails a real regression', () => {
    // A feature that stops tree-shaking moves a minimal import by hundreds of
    // bytes. The slack must not reach anywhere near that.
    const r = compareToBudgets(measured(700), { 'p::x': 596 }).regressions
    expect(r).toHaveLength(1)
    expect(r[0]?.overBy).toBe(104)
  })

  it('fails one byte past the tolerance, so the band is exact', () => {
    expect(compareToBudgets(measured(600), { 'p::x': 596 }).regressions).toEqual([])
    expect(compareToBudgets(measured(601), { 'p::x': 596 }).regressions).toHaveLength(1)
  })

  it('reports overBy against the BUDGET, not the tolerated line', () => {
    // The number a reader acts on is the distance from the lock, not from an
    // internal allowance they cannot see.
    expect(compareToBudgets(measured(601), { 'p::x': 596 }).regressions[0]?.overBy).toBe(5)
  })
})
