import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MATRIX_DOC,
  computeScopeTotals,
  computeTotals,
  parseMatrixRows,
  parseScope,
  parseTierTable,
  shortName,
  tierFor,
  verifyHeadline,
  verifyScopeItems,
  verifyScopeTotals,
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
    const scope = parseScope(md)
    expect(scope.issues).toEqual([])
    expect(verifyScopeItems(rows, scope.items)).toEqual([])
    expect(verifyScopeTotals(scope.section, computeScopeTotals(rows, scope.items))).toEqual([])
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

// ─── Road to Stable (closed scope) ───────────────────────────────────────────

const SCOPE_MATRIX = [
  { category: 'Core UI (primitives)', weight: 10, fraction: 1.0 },
  { category: 'Storage', weight: 7, fraction: 0.7 },
  { category: 'Payments', weight: 2, fraction: 0.0 },
]

const A_HEAD =
  '| (A) ID | Matrix row | Item | Gain | Points | Effort |\n| --- | --- | --- | --- | --- | --- |\n'

const B_HEAD =
  '| (B) ID | Matrix row | Maintainer action | Gain | Points |\n| --- | --- | --- | --- | --- |\n'

const C_HEAD =
  '| (C) ID | Matrix row | Remainder | Share | Points | Proposal |\n| --- | --- | --- | --- | --- | --- |\n'

const GOOD_A =
  '| STO-1 | Storage | process death | +0.20 | 1.40 | M |\n| PAY-1 | Payments | StoreKit | +0.40 | 0.80 | L |\n'

const GOOD_B = '| PAY-B1 | Payments | Play Console account | +0.60 | 1.20 |\n'
const GOOD_C = '| STO-C1 | Storage | web-only remainder | 0.10 | 0.70 | leaves the row |\n'

// Base earned = 10 + 4.9 + 0 = 14.9 / 19. A = 2.20 → 17.10 (90%); B = 1.20 → 18.30 (96%); C = 0.70.
const GOOD_TOTALS =
  '**(A) total:** +2.20 points.\n\n**(B) total:** +1.20 points.\n\n**(C) remainder:** 0.70 points.\n\n' +
  '**Projected after (A):** 17.10 / 19 ≈ 90%\n\n**Projected after (A) + (B):** 18.30 / 19 ≈ 96%\n'

function scopeDoc(a = GOOD_A, b = GOOD_B, c = GOOD_C, totals = GOOD_TOTALS): string {
  return `intro\n\n## Road to Stable (closed scope)\n\ntext\n\n${A_HEAD}${a}\n${totals}\n${B_HEAD}${b}\n${C_HEAD}${c}\n## Next section\n\n**(A) total:** +9.99 points.\n`
}

function check(md: string): string[] {
  const scope = parseScope(md)
  if (scope.issues.length > 0) return scope.issues
  return [
    ...verifyScopeItems(SCOPE_MATRIX, scope.items),
    ...verifyScopeTotals(scope.section, computeScopeTotals(SCOPE_MATRIX, scope.items)),
  ]
}

describe('check-multiplatform-matrix — Road to Stable scope', () => {
  it('accepts a scope that names real rows, closes every row to 1.0 and states the implied totals', () => {
    expect(check(scopeDoc())).toEqual([])
  })

  it('reads only its own section — a totals line under the next heading does not count', () => {
    // scopeDoc puts a wrong `(A) total` after `## Next section`; the clean pass above proves it is ignored.
    expect(parseScope(scopeDoc()).section).not.toContain('Next section')
  })

  it('an item that names a row the matrix does not have is a failure', () => {
    const issues = check(scopeDoc(GOOD_A.replace('| Storage |', '| Storage & files |')))
    expect(issues.some((i) => i.includes('"Storage & files" is not a matrix row'))).toBe(true)
  })

  it('Points that disagree with weight × gain are a failure', () => {
    const issues = check(scopeDoc(GOOD_A.replace('| 1.40 |', '| 1.50 |')))
    expect(
      issues.some((i) => i.includes('STO-1: Points says 1.5 but weight 7 × gain 0.2 = 1.40')),
    ).toBe(true)
  })

  it('a row whose fraction plus items is not exactly 1.0 does not close', () => {
    const issues = check(
      scopeDoc(
        GOOD_A,
        GOOD_B,
        ''.concat('| STO-C1 | Storage | x | 0.05 | 0.35 | stays scored |\n'),
      ),
    )
    expect(issues.some((i) => i.includes('"Storage" does not close'))).toBe(true)
  })

  it('a row already at 1.0 that still carries items is a failure (landing an item deletes it)', () => {
    const issues = check(
      scopeDoc(`${GOOD_A}| CORE-1 | Core UI (primitives) | x | +0.10 | 1.00 | S |\n`),
    )
    expect(issues.some((i) => i.includes('"Core UI (primitives)" is already at 1.0'))).toBe(true)
  })

  it('stated totals that disagree with the tables are a failure, naming both numbers', () => {
    const issues = check(scopeDoc(GOOD_A, GOOD_B, GOOD_C, GOOD_TOTALS.replace('+2.20', '+2.30')))
    expect(issues.some((i) => i.includes('says 2.30 but the tables imply 2.20'))).toBe(true)
    const proj = check(
      scopeDoc(GOOD_A, GOOD_B, GOOD_C, GOOD_TOTALS.replace('17.10 / 19 ≈ 90%', '17.10 / 19 ≈ 91%')),
    )
    expect(proj.some((i) => i.includes('Projected after (A):'))).toBe(true)
  })

  it('a missing or repeated totals statement is a failure', () => {
    const missing = check(
      scopeDoc(GOOD_A, GOOD_B, GOOD_C, GOOD_TOTALS.replace('**(C) remainder:** 0.70 points.', '')),
    )
    expect(missing.some((i) => i.includes('(C) remainder') && i.includes('found 0'))).toBe(true)
    const twice = check(
      scopeDoc(GOOD_A, GOOD_B, GOOD_C, `${GOOD_TOTALS}\n**(B) total:** +1.20 points.\n`),
    )
    expect(twice.some((i) => i.includes('(B) total') && i.includes('found 2'))).toBe(true)
  })

  it('bad Effort / Proposal cells and duplicate IDs are failures', () => {
    const issues = check(
      scopeDoc(
        GOOD_A.replace('| M |', '| huge |'),
        GOOD_B.replace('PAY-B1', 'PAY-1'),
        GOOD_C.replace('leaves the row', 'maybe'),
      ),
    )
    expect(issues.some((i) => i.includes('Effort must be one of'))).toBe(true)
    expect(issues.some((i) => i.includes('Proposal must be'))).toBe(true)
    expect(issues.some((i) => i.includes('PAY-1: duplicate ID'))).toBe(true)
  })

  it('a missing section, a missing table, an empty table or an unparseable row is a failure', () => {
    expect(parseScope('no scope here').issues.some((i) => i.includes('not found'))).toBe(true)
    const noC = parseScope(scopeDoc().replace('| (C) ID |', '| C ID |'))
    expect(noC.issues.some((i) => i.includes('no (C) table'))).toBe(true)
    const emptyB = parseScope(scopeDoc(GOOD_A, ''))
    expect(emptyB.issues.some((i) => i.includes('(B) table has ZERO rows'))).toBe(true)
    const broken = parseScope(scopeDoc(`${GOOD_A}| X-1 | Storage | x | lots | 1.00 | S |\n`))
    expect(broken.issues.some((i) => i.includes('does not parse'))).toBe(true)
  })
})
