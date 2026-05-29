import { describe, expect, it } from 'vitest'

import { computeScore, gradeFor, isAdvisoryCategory, scoreCategory } from '../doctor/score'
import type { Finding, GateResult } from '../doctor/types'

const makeFinding = (
  category: Finding['category'],
  severity: Finding['severity'],
  code = 'test/x',
): Finding => ({
  category,
  severity,
  code,
  gate: 'test',
  message: 'test',
})

const makeGate = (
  gate: string,
  category: GateResult['category'],
  findings: Finding[] = [],
  skipped = false,
): GateResult => ({
  gate,
  category,
  findings,
  meta: {
    elapsedMs: 1,
    ...(skipped && { skipped: true, skipReason: 'test' }),
  },
})

describe('gradeFor', () => {
  it('returns A for 90+', () => {
    expect(gradeFor(100)).toBe('A')
    expect(gradeFor(95)).toBe('A')
    expect(gradeFor(90)).toBe('A')
  })
  it('returns B for 80-89', () => {
    expect(gradeFor(89)).toBe('B')
    expect(gradeFor(80)).toBe('B')
  })
  it('returns C for 70-79', () => {
    expect(gradeFor(79)).toBe('C')
    expect(gradeFor(70)).toBe('C')
  })
  it('returns D for 60-69', () => {
    expect(gradeFor(69)).toBe('D')
    expect(gradeFor(60)).toBe('D')
  })
  it('returns F for <60', () => {
    expect(gradeFor(59)).toBe('F')
    expect(gradeFor(0)).toBe('F')
  })
})

describe('scoreCategory', () => {
  it('returns 100 with grade A for empty findings', () => {
    const result = scoreCategory('correctness', [], true)
    expect(result.score).toBe(100)
    expect(result.grade).toBe('A')
    expect(result.errors).toBe(0)
    expect(result.warnings).toBe(0)
    expect(result.infos).toBe(0)
  })

  it('weights: 1 error = -10, 1 warning = -3, 1 info = -1', () => {
    const findings = [
      makeFinding('correctness', 'error'),
      makeFinding('correctness', 'warning'),
      makeFinding('correctness', 'info'),
    ]
    const result = scoreCategory('correctness', findings, true)
    expect(result.score).toBe(86) // 100 - 10 - 3 - 1
    expect(result.errors).toBe(1)
    expect(result.warnings).toBe(1)
    expect(result.infos).toBe(1)
  })

  it('saturates at 0', () => {
    const findings = Array(20)
      .fill(null)
      .map(() => makeFinding('correctness', 'error'))
    const result = scoreCategory('correctness', findings, true)
    expect(result.score).toBe(0)
    expect(result.grade).toBe('F')
  })

  it('only counts findings in the named category', () => {
    const findings = [makeFinding('correctness', 'error'), makeFinding('performance', 'error')]
    const result = scoreCategory('correctness', findings, true)
    expect(result.score).toBe(90) // -10 for the one correctness error
  })

  it('passes through `included` flag', () => {
    expect(scoreCategory('testing', [], true).included).toBe(true)
    expect(scoreCategory('testing', [], false).included).toBe(false)
  })
})

describe('computeScore', () => {
  it('returns 100/A when no gates run', () => {
    const { score, grade } = computeScore([], [])
    expect(score).toBe(100)
    expect(grade).toBe('A')
  })

  it('excludes uncovered categories from the mean', () => {
    // Only ONE gate (correctness) covers anything — should NOT
    // average in 4× perfect 100s from uncovered categories.
    const gates = [makeGate('lint', 'correctness')]
    const findings = [makeFinding('correctness', 'error')]
    const { score, categories } = computeScore(findings, gates)
    expect(score).toBe(90) // only correctness counted, 100-10
    expect(categories.find((c) => c.category === 'correctness')!.included).toBe(true)
    expect(categories.find((c) => c.category === 'performance')!.included).toBe(false)
  })

  it('averages included categories', () => {
    // 2 gates: lint (correctness, 1 error → 90) + distribution
    // (architecture, 0 findings → 100). Mean = 95.
    const gates = [makeGate('lint', 'correctness'), makeGate('distribution', 'architecture')]
    const findings = [makeFinding('correctness', 'error')]
    const { score } = computeScore(findings, gates)
    expect(score).toBe(95)
  })

  it('skipped gates do NOT include their category', () => {
    const gates = [
      makeGate('lint', 'correctness', [], true), // skipped
      makeGate('distribution', 'architecture'),
    ]
    const { categories } = computeScore([], gates)
    expect(categories.find((c) => c.category === 'correctness')!.included).toBe(false)
    expect(categories.find((c) => c.category === 'architecture')!.included).toBe(true)
  })

  it('finding category alone is enough to include the category', () => {
    // A finding emitted under 'performance' (perhaps from a lint
    // rule whose default gate-category is 'correctness') should
    // pull performance into the included set.
    const gates = [makeGate('lint', 'correctness')]
    const findings = [makeFinding('performance', 'warning')]
    const { categories } = computeScore(findings, gates)
    expect(categories.find((c) => c.category === 'performance')!.included).toBe(true)
    expect(categories.find((c) => c.category === 'performance')!.score).toBe(97)
  })
})

describe('advisory best-practices category', () => {
  it('isAdvisoryCategory: only best-practices is advisory', () => {
    expect(isAdvisoryCategory('best-practices')).toBe(true)
    for (const c of [
      'correctness',
      'performance',
      'architecture',
      'testing',
      'documentation',
    ] as const) {
      expect(isAdvisoryCategory(c)).toBe(false)
    }
  })

  it('best-practices is ALWAYS included:false (scored but not graded), even with findings', () => {
    const findings = [
      makeFinding('best-practices', 'error'),
      makeFinding('best-practices', 'warning'),
    ]
    const gates = [makeGate('lint', 'correctness', findings)]
    const { categories } = computeScore(findings, gates)
    const bp = categories.find((c) => c.category === 'best-practices')!
    expect(bp.included).toBe(false)
    // still SCORED for visibility (1 error + 1 warning = 13 penalty)
    expect(bp.errors).toBe(1)
    expect(bp.warnings).toBe(1)
    expect(bp.score).toBe(87)
  })

  it('best-practices errors do NOT drag the overall grade', () => {
    // 10 advisory errors would be a 0 subscore — but excluded from mean.
    const bpErrors = Array.from({ length: 10 }, () => makeFinding('best-practices', 'error'))
    const cleanGates = [makeGate('lint', 'correctness', [])]
    const withBp = computeScore(bpErrors, cleanGates)
    const withoutBp = computeScore([], cleanGates)
    // Identical: the 10 advisory errors changed nothing in the mean.
    expect(withBp.score).toBe(withoutBp.score)
    expect(withBp.grade).toBe(withoutBp.grade)
  })
})
