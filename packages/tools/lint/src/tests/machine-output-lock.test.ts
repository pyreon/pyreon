import { describe, expect, it } from 'vitest'
import { formatCompact, formatJSON } from '../reporter'
import type { LintResult } from '../types'

/**
 * `--format json` and `--format compact` are machine contracts. These
 * snapshots were written against the reporter BEFORE the text format moved
 * to the shared `@pyreon/ansi` theme; any change here is a contract change.
 */

const result: LintResult = {
  files: [
    {
      filePath: '/repo/src/routes/inbox.tsx',
      diagnostics: [
        {
          ruleId: 'pyreon/no-missing-for-by',
          severity: 'warn',
          message: '<For> needs a `by` key so rows survive reorder',
          loc: { line: 42, column: 7 },
          span: { start: 100, end: 120 },
          fix: { span: { start: 100, end: 120 }, replacement: '<For each={x} by={(m) => m.id}>' },
        },
        {
          ruleId: 'pyreon/no-signal-call-write',
          severity: 'error',
          message: 'signal(v) only reads. Write with draft.set(v)',
          loc: { line: 58, column: 12 },
          span: { start: 300, end: 310 },
        },
      ],
    },
    {
      filePath: '/repo/src/components/Avatar.tsx',
      diagnostics: [
        {
          ruleId: 'pyreon/require-img-alt',
          severity: 'info',
          message: '<img> needs alt text',
          loc: { line: 9, column: 5 },
          span: { start: 1, end: 2 },
        },
      ],
    },
    { filePath: '/repo/src/clean.ts', diagnostics: [] },
  ],
  totalErrors: 1,
  totalWarnings: 1,
  totalInfos: 1,
  configDiagnostics: [{ ruleId: 'pyreon/x', severity: 'warn', message: 'bad options' }],
}

describe('lint machine output is locked', () => {
  it('json', () => {
    expect(formatJSON(result)).toMatchSnapshot()
  })
  it('compact', () => {
    expect(formatCompact(result)).toMatchSnapshot()
  })
})
