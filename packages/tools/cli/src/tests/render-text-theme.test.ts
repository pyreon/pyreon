import { createTerm, stripAnsi } from '@pyreon/ansi'
import { describe, expect, it } from 'vitest'

import { renderText } from '../doctor/render'
import { buildReport } from '../doctor/report'
import type { DoctorReport, Finding, GateResult } from '../doctor/types'

/**
 * The human doctor report in the shared CLI theme, at every colour level, on
 * both backgrounds and with the ASCII fallback. Same fixture as
 * machine-output-lock.test.ts.
 */

const finding = (over: Partial<Finding>): Finding => ({
  category: 'correctness',
  severity: 'error',
  code: 'lint/no-x',
  gate: 'lint',
  message: 'Message',
  ...over,
})

const gate = (over: Partial<GateResult>): GateResult => ({
  gate: 'lint',
  category: 'correctness',
  findings: [],
  meta: { elapsedMs: 10 },
  ...over,
})

const fixture = (): DoctorReport => {
  const report = buildReport([
    gate({
      gate: 'lint',
      meta: { elapsedMs: 380, scanned: 412 },
      findings: [
        finding({
          severity: 'warning',
          category: 'performance',
          code: 'pyreon/no-missing-for-by',
          message: '<For> without `by` recreates every row on reorder',
          location: { path: '/repo/src/routes/inbox.tsx', relPath: 'src/routes/inbox.tsx', line: 42, column: 7 },
          fix: '<For each={messages} by={(m) => m.id}>',
          fixable: true,
        }),
        finding({
          severity: 'info',
          category: 'documentation',
          code: 'pyreon/doc-note',
          message: 'A note, with: colons, commas\nand a newline',
          location: { path: '/repo/README.md', relPath: 'README.md' },
        }),
      ],
    }),
    gate({
      gate: 'audit-tests',
      category: 'testing',
      meta: { elapsedMs: 120, scanned: 9 },
      findings: [
        finding({
          category: 'testing',
          code: 'audit-tests/no-browser-smoke',
          gate: 'audit-tests',
          message: 'Browser package has no real-Chromium smoke test',
          location: { path: '/repo/packages/ui/src/index.ts', relPath: 'packages/ui/src/index.ts' },
          relatedLocations: [
            { path: '/repo/packages/ui/package.json', relPath: 'packages/ui/package.json', line: 3, label: 'declared' },
          ],
          fix: 'add src/tests/ui.browser.test.tsx',
        }),
        finding({ category: 'testing', code: 'audit-tests/project', gate: 'audit-tests', message: 'Project-wide' }),
      ],
    }),
    gate({ gate: 'bundle-budgets', category: 'performance', meta: { elapsedMs: 0, skipped: true, skipReason: 'needs --full' } }),
    gate({
      gate: 'islands-audit',
      category: 'architecture',
      meta: { elapsedMs: 0, skipped: true, emptyScan: true, skipReason: 'matched no files' },
    }),
  ])
  return { ...report, timestamp: '2026-11-11T00:00:00.000Z' }
}

const ESC = String.fromCharCode(27)
const show = (s: string): string => s.split(ESC).join('␛')
const withWorkspace = (): DoctorReport => ({
  ...fixture(),
  workspace: {
    repoRoot: '/repo',
    source: 'workspaces',
    globs: ['apps/*', 'packages/*'],
    packageCount: 3,
    excluded: [],
  },
})

describe('doctor text in the shared theme', () => {
  for (const level of [0, 1, 2, 3] as const) {
    for (const theme of ['dark', 'light'] as const) {
      it(`level ${level} · ${theme}`, () => {
        const t = createTerm({ level, theme, unicode: true })
        expect(show(renderText(withWorkspace(), { term: t }))).toMatchSnapshot()
      })
    }
  }

  it('ascii fallback', () => {
    expect(renderText(withWorkspace(), { term: createTerm({ level: 0, unicode: false }) })).toMatchSnapshot()
  })

  it('NO_COLOR output is the coloured output with the escapes removed', () => {
    const plain = renderText(withWorkspace(), { term: createTerm({ level: 0, unicode: true }) })
    for (const level of [1, 2] as const) {
      expect(stripAnsi(renderText(withWorkspace(), { term: createTerm({ level, unicode: true }) }))).toBe(plain)
    }
  })

  it('no line is wider than 100 columns', () => {
    const plain = renderText(withWorkspace(), { term: createTerm({ level: 0, unicode: true }) })
    for (const line of plain.split('\n')) expect([...line].length).toBeLessThanOrEqual(100)
  })
})
