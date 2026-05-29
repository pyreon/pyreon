import { describe, expect, it } from 'vitest'

import { buildReport } from '../doctor/report'
import type { Finding, GateResult } from '../doctor/types'

const f = (
  severity: Finding['severity'],
  category: Finding['category'],
  code: string,
): Finding => ({
  severity,
  category,
  code,
  gate: 'test',
  message: 'm',
})

const g = (
  gate: string,
  category: GateResult['category'],
  findings: Finding[] = [],
  elapsedMs = 10,
): GateResult => ({
  gate,
  category,
  findings,
  meta: { elapsedMs },
})

describe('buildReport', () => {
  it('produces a clean report when no gates run', () => {
    const report = buildReport([])
    expect(report.score).toBe(100)
    expect(report.grade).toBe('A')
    expect(report.findings).toEqual([])
    expect(report.totals).toEqual({ errors: 0, warnings: 0, infos: 0 })
    expect(report.elapsedMs).toBe(0)
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('sorts findings: errors → warnings → infos, then by category, then by code', () => {
    const gates = [
      g('a', 'correctness', [
        f('info', 'documentation', 'a/info'),
        f('warning', 'performance', 'a/warn'),
      ]),
      g('b', 'architecture', [
        f('error', 'correctness', 'b/err1'),
        f('error', 'architecture', 'b/err2'),
      ]),
    ]
    const report = buildReport(gates)
    // Errors first, sorted by category (architecture < correctness alphabetically)
    expect(report.findings.map((x) => x.code)).toEqual(['b/err2', 'b/err1', 'a/warn', 'a/info'])
  })

  it('counts totals across gates', () => {
    const gates = [
      g('a', 'correctness', [
        f('error', 'correctness', 'a'),
        f('error', 'correctness', 'b'),
        f('warning', 'correctness', 'c'),
        f('info', 'correctness', 'd'),
      ]),
    ]
    const report = buildReport(gates)
    expect(report.totals.errors).toBe(2)
    expect(report.totals.warnings).toBe(1)
    expect(report.totals.infos).toBe(1)
  })

  it('sums elapsedMs across gates (proxy for total CPU work)', () => {
    const gates = [
      g('a', 'correctness', [], 100),
      g('b', 'architecture', [], 200),
      g('c', 'testing', [], 50),
    ]
    expect(buildReport(gates).elapsedMs).toBe(350)
  })

  it('preserves the gates array in the report', () => {
    const gates = [g('a', 'correctness'), g('b', 'architecture')]
    expect(buildReport(gates).gates).toEqual(gates)
  })

  it('computes score from findings (1 error = -10)', () => {
    const gates = [g('a', 'correctness', [f('error', 'correctness', 'a/err')])]
    const report = buildReport(gates)
    expect(report.score).toBe(90)
    expect(report.grade).toBe('A')
  })
})
