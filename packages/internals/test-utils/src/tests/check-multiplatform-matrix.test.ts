import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MATRIX_DOC,
  computeTotals,
  parseMatrixRows,
  verifyHeadline,
} from '../../../../../scripts/check-multiplatform-matrix'

const HEADING = '## Production capability matrix'
const HEADER = '| Category | Weight | R4+ fraction | Rung + evidence |\n| --- | --- | --- | --- |\n'

function doc(rows: string, headline: string): string {
  return `intro text\n\n${HEADING}\n\nblah\n\n${HEADER}${rows}\nafter table\n\n${headline}\n`
}

describe('check-multiplatform-matrix — parseMatrixRows', () => {
  it('parses category / integer weight / fraction from each data row', () => {
    const md = doc('| Core UI | 10 | 1.0 | R4 evidence |\n| Payments | 2 | 0.0 | R2 |', '')
    const { rows, issues } = parseMatrixRows(md)
    expect(issues).toEqual([])
    expect(rows).toEqual([
      { category: 'Core UI', weight: 10, fraction: 1.0 },
      { category: 'Payments', weight: 2, fraction: 0.0 },
    ])
  })

  it('a row that LOOKS like data but does not parse is an ERROR, not a skip (silent-filter class)', () => {
    const md = doc('| Core UI | 10 | 1.0 | ok |\n| Broken | ten | 1.0 | oops |', '')
    const { rows, issues } = parseMatrixRows(md)
    expect(rows).toHaveLength(1)
    expect(issues.some((i) => i.includes('does not parse'))).toBe(true)
  })

  it('an empty table is a FAILURE, never a clean pass', () => {
    const md = doc('', '')
    const { issues } = parseMatrixRows(md)
    expect(issues.some((i) => i.includes('ZERO data rows'))).toBe(true)
  })

  it('missing section heading is a failure', () => {
    const { issues } = parseMatrixRows('no matrix here at all')
    expect(issues.some((i) => i.includes('not found'))).toBe(true)
  })

  it('flags out-of-range fractions and duplicate categories', () => {
    const md = doc('| A | 5 | 1.5 | bad |\n| A | 5 | 0.5 | dup |', '')
    const { issues } = parseMatrixRows(md)
    expect(issues.some((i) => i.includes('[0, 1]'))).toBe(true)
    expect(issues.some((i) => i.includes('duplicate category'))).toBe(true)
  })
})

describe('check-multiplatform-matrix — computeTotals', () => {
  it('sums weight and weight×fraction, killing float dust', () => {
    const totals = computeTotals([
      { category: 'a', weight: 10, fraction: 1.0 },
      { category: 'b', weight: 8, fraction: 0.85 },
      { category: 'c', weight: 3, fraction: 0.55 },
    ])
    expect(totals.total).toBe(21)
    expect(totals.earned).toBe(18.45)
  })
})

describe('check-multiplatform-matrix — verifyHeadline', () => {
  const totals = { total: 121, earned: 83.0, pct: (83.0 / 121) * 100 }

  it('accepts an exactly-matching headline', () => {
    expect(verifyHeadline('**≈ 69%** (83.0 / 121 — history…', totals)).toEqual([])
  })

  it('rejects a stale percentage, earned, or total — naming each drift', () => {
    const issues = verifyHeadline('**≈ 72%** (81.8 / 113 — history…', totals)
    expect(issues.some((i) => i.includes('≈ 72%'))).toBe(true)
    expect(issues.some((i) => i.includes('81.8'))).toBe(true)
    expect(issues.some((i) => i.includes('113'))).toBe(true)
  })

  it('a MISSING headline is a failure — the doc must state the computed number', () => {
    const issues = verifyHeadline('no totals stated anywhere', totals)
    expect(issues.some((i) => i.includes('not found'))).toBe(true)
  })

  it('TWO headline-shaped numbers is a failure — there must be ONE number', () => {
    const issues = verifyHeadline('**≈ 69%** (83.0 / 121 x **≈ 70%** (84.0 / 121', totals)
    expect(issues.some((i) => i.includes('exactly once'))).toBe(true)
  })
})

describe('check-multiplatform-matrix — against the REAL doc', () => {
  // The end-to-end lock: the shipped doc must satisfy its own gate. If a row
  // edit lands without recomputing the headline, THIS spec (and the CI gate)
  // reds — which is the whole point.
  it('the shipped matrix parses, and its headline equals its table sum', () => {
    const repoRoot = resolve(import.meta.dirname, '../../../../..')
    const md = readFileSync(resolve(repoRoot, MATRIX_DOC), 'utf8')
    const { rows, issues } = parseMatrixRows(md)
    expect(issues).toEqual([])
    expect(rows.length).toBeGreaterThanOrEqual(20)
    const totals = computeTotals(rows)
    expect(verifyHeadline(md, totals)).toEqual([])
  })
})
