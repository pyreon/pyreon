import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MATRIX_DOC,
  computeTotals,
  parseMatrixRows,
  parseTierTable,
  shortName,
  tierFor,
  verifyHeadline,
  verifyTierSummaries,
  verifyTiers,
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
    const tiers = parseTierTable(md)
    expect(tiers.issues).toEqual([])
    expect(verifyTiers(rows, tiers.rows)).toEqual([])
    const summaries = verifyTierSummaries(md, rows, MATRIX_DOC)
    expect(summaries.issues).toEqual([])
    expect(summaries.found).toBeGreaterThanOrEqual(1)
  })
})

describe('check-multiplatform-matrix — tierFor', () => {
  it('is Beta at exactly 0.8 and above', () => {
    expect(tierFor(0.8)).toBe('Beta')
    expect(tierFor(1.0)).toBe('Beta')
  })

  it('is Experimental from exactly 0.4 up to just below 0.8', () => {
    expect(tierFor(0.79)).toBe('Experimental')
    expect(tierFor(0.4)).toBe('Experimental')
  })

  it('is Not ready below 0.4', () => {
    expect(tierFor(0.39)).toBe('Not ready')
    expect(tierFor(0)).toBe('Not ready')
  })
})

const TIER_HEADING = '## Maturity by area'
const TIER_HEADER = '| Area | Tier |\n| --- | --- |\n'
const MATRIX = [
  { category: 'Core UI (primitives)', weight: 10, fraction: 1.0 },
  { category: 'Storage', weight: 7, fraction: 0.7 },
  { category: 'Payments', weight: 2, fraction: 0.0 },
]

function tierDoc(rows: string): string {
  return `intro\n\n${TIER_HEADING}\n\nrules\n\n${TIER_HEADER}${rows}\nafter\n`
}

describe('check-multiplatform-matrix — parseTierTable + verifyTiers', () => {
  const good =
    '| Core UI (primitives) | Beta |\n| Storage | Experimental |\n| Payments | Not ready |'

  it('accepts a table whose areas match the matrix and whose tiers match tierFor', () => {
    const { rows, issues } = parseTierTable(tierDoc(good))
    expect(issues).toEqual([])
    expect(rows).toEqual([
      { area: 'Core UI (primitives)', tier: 'Beta' },
      { area: 'Storage', tier: 'Experimental' },
      { area: 'Payments', tier: 'Not ready' },
    ])
    expect(verifyTiers(MATRIX, rows)).toEqual([])
  })

  it('accepts a bolded tier cell', () => {
    const { rows } = parseTierTable(tierDoc('| Storage | **Experimental** |'))
    expect(rows[0]!.tier).toBe('Experimental')
  })

  it('a WRONG tier is a failure naming the fraction and the derived tier', () => {
    const { rows } = parseTierTable(
      tierDoc(good.replace('| Storage | Experimental |', '| Storage | Beta |')),
    )
    const issues = verifyTiers(MATRIX, rows)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('"Storage" says Beta but its fraction 0.7 makes it Experimental')
  })

  it('a MISSING area is a failure', () => {
    const { rows } = parseTierTable(
      tierDoc('| Core UI (primitives) | Beta |\n| Storage | Experimental |'),
    )
    const issues = verifyTiers(MATRIX, rows)
    expect(issues.some((i) => i.includes('"Payments" has no row'))).toBe(true)
  })

  it('an EXTRA area (not a matrix category) is a failure', () => {
    const { rows } = parseTierTable(tierDoc(`${good}\n| Telepathy | Beta |`))
    const issues = verifyTiers(MATRIX, rows)
    expect(issues.some((i) => i.includes('"Telepathy" is not a matrix category'))).toBe(true)
  })

  it('a duplicate area is a failure', () => {
    const { rows } = parseTierTable(tierDoc(`${good}\n| Payments | Not ready |`))
    expect(verifyTiers(MATRIX, rows).some((i) => i.includes('duplicate area "Payments"'))).toBe(
      true,
    )
  })

  it('an EMPTY table is a failure, never a clean pass', () => {
    const { rows, issues } = parseTierTable(tierDoc(''))
    expect(rows).toEqual([])
    expect(issues.some((i) => i.includes('ZERO data rows'))).toBe(true)
  })

  it('a missing section or header is a failure', () => {
    expect(parseTierTable('nothing here').issues.some((i) => i.includes('not found'))).toBe(true)
    expect(
      parseTierTable(`${TIER_HEADING}\n\nno table`).issues.some((i) => i.includes('header')),
    ).toBe(true)
  })
})

describe('check-multiplatform-matrix — verifyTierSummaries', () => {
  it('shortName strips the trailing scope parenthetical', () => {
    expect(shortName('Core UI (primitives)')).toBe('Core UI')
    expect(shortName('Storage')).toBe('Storage')
  })

  it('accepts a summary listing exactly the tier, by short or full name', () => {
    const md =
      'x **Beta areas:** Core UI. y **Not-ready areas:** Payments. **Experimental areas:** Storage.'
    expect(verifyTierSummaries(md, MATRIX, 'p.md')).toEqual({ issues: [], found: 3 })
    expect(
      verifyTierSummaries('**Beta areas:** Core UI (primitives).', MATRIX, 'p.md').issues,
    ).toEqual([])
  })

  it('flags a summary that is missing an area, lists a wrong-tier area, or names a non-category', () => {
    const { issues } = verifyTierSummaries('**Beta areas:** Storage, Telepathy.', MATRIX, 'p.md')
    expect(issues.some((i) => i.includes('missing "Core UI"'))).toBe(true)
    expect(issues.some((i) => i.includes('"Storage", which is Experimental'))).toBe(true)
    expect(issues.some((i) => i.includes('"Telepathy", which is not a matrix category'))).toBe(true)
  })

  it('reports zero summaries found when there are none', () => {
    expect(verifyTierSummaries('no summaries', MATRIX, 'p.md')).toEqual({ issues: [], found: 0 })
  })
})
