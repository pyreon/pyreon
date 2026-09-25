/**
 * The A11y panel's summary strip counts the SAME results the panel lists —
 * it read "0 violations" directly above axe's "1 violation(s)".
 */
import { describe, expect, it } from 'vitest'
import { type A11yReport, plural, summarizeA11y } from '../a11y'
import { snippet } from '../axe'

const report = (over: Partial<A11yReport> = {}): A11yReport => ({
  checks: [],
  passes: 3,
  warns: 0,
  fails: 0,
  unknowns: 0,
  ...over,
})

describe('summarizeA11y', () => {
  it('is the structural checks alone until axe has run', () => {
    for (const status of ['ready', 'running', 'failed'] as const) {
      expect(
        summarizeA11y(report({ fails: 1 }), { status, violations: [{}], incomplete: 2 }),
      ).toEqual({
        passes: 3,
        warns: 0,
        violations: 1,
        unknowns: 0,
        withAxe: false,
      })
    }
  })

  it('counts axe violations as violations and axe "needs review" as warnings once it has', () => {
    expect(
      summarizeA11y(report({ fails: 1, warns: 1, unknowns: 1 }), {
        status: 'done',
        violations: [{}, {}],
        incomplete: 3,
      }),
    ).toEqual({ passes: 3, warns: 4, violations: 3, unknowns: 1, withAxe: true })
  })

  it('the strip and the axe list can no longer disagree (the audited shape)', () => {
    // 3 passing checks, axe found one color-contrast violation.
    const s = summarizeA11y(report(), {
      status: 'done',
      violations: [{ id: 'color-contrast' }],
      incomplete: 0,
    })
    expect(plural(s.violations, 'violation')).toBe('1 violation')
  })
})

describe('plural', () => {
  it('singular for one, plural otherwise', () => {
    expect(plural(1, 'warning')).toBe('1 warning')
    expect(plural(0, 'warning')).toBe('0 warnings')
    expect(plural(2, 'child', 'children')).toBe('2 children')
  })
})

describe('snippet', () => {
  it('collapses whitespace and caps the length', () => {
    expect(snippet('<a\n   href="x">  y </a>')).toBe('<a href="x"> y </a>')
    expect(snippet('x'.repeat(200), 10)).toBe(`${'x'.repeat(10)}…`)
  })
})
