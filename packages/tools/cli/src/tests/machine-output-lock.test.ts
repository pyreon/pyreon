import { describe, expect, it } from 'vitest'

import { renderGha, renderJson } from '../doctor/render'
import { buildReport } from '../doctor/report'
import type { DoctorReport, Finding, GateResult } from '../doctor/types'

/**
 * `--json` and `--gha` are machine contracts. These snapshots were written
 * against the renderers BEFORE the human output moved to the shared
 * `@pyreon/ansi` theme; any change to them is a contract change and must be
 * deliberate. Human text (`renderText`) is deliberately not locked here.
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

describe('doctor machine output is locked', () => {
  it('--json', () => {
    expect(renderJson(fixture())).toMatchSnapshot()
  })
  it('--gha', () => {
    expect(renderGha(fixture())).toMatchSnapshot()
  })
  it('--gha for a report that measured nothing', () => {
    const empty = buildReport([gate({ meta: { elapsedMs: 0, skipped: true, emptyScan: true } })])
    expect(renderGha({ ...empty, timestamp: '2026-11-11T00:00:00.000Z' })).toMatchSnapshot()
  })
})
