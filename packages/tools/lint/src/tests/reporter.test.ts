import { describe, expect, it } from 'vitest'
import { formatCompact, formatJSON, formatText } from '../reporter'
import type { LintResult } from '../types'

// Coverage gap closed in PR #323. The reporter module renders LintResult
// shapes into one of three formats (text / JSON / compact). Pure pretty-
// printing — no I/O, no async — but uncovered until now.

const fileWithErr = {
  filePath: '/abs/foo.ts',
  diagnostics: [
    {
      ruleId: 'pyreon/no-window-in-ssr',
      severity: 'error' as const,
      message: 'window is undefined in SSR',
      loc: { line: 12, column: 4 },
    },
  ],
  fixed: 0,
}
const fileWithMixed = {
  filePath: '/abs/bar.ts',
  diagnostics: [
    {
      ruleId: 'pyreon/no-bare-signal-in-jsx',
      severity: 'warn' as const,
      message: 'bare signal in JSX text',
      loc: { line: 5, column: 10 },
    },
    {
      ruleId: 'pyreon/use-pyreon-hooks',
      severity: 'info' as const,
      message: 'consider useEventListener',
      loc: { line: 7, column: 2 },
    },
  ],
  fixed: 0,
}
const cleanFile = {
  filePath: '/abs/clean.ts',
  diagnostics: [],
  fixed: 0,
}

const result: LintResult = {
  files: [fileWithErr, fileWithMixed, cleanFile],
  totalErrors: 1,
  totalWarnings: 1,
  totalInfos: 1,
  totalFixed: 0,
  configDiagnostics: [],
}

const empty: LintResult = {
  files: [],
  totalErrors: 0,
  totalWarnings: 0,
  totalInfos: 0,
  totalFixed: 0,
  configDiagnostics: [],
}

describe('reporter — formatText', () => {
  it('renders file paths, locations, severities, messages, and rule ids', () => {
    const text = formatText(result)
    expect(text).toContain('/abs/foo.ts')
    expect(text).toContain('/abs/bar.ts')
    expect(text).toContain('12:4')
    expect(text).toContain('5:10')
    expect(text).toContain('window is undefined in SSR')
    expect(text).toContain('pyreon/no-window-in-ssr')
    expect(text).toContain('pyreon/no-bare-signal-in-jsx')
    // 'error' / 'warning' / 'info' strings appear (ANSI-coloured)
    expect(text).toContain('error')
    expect(text).toContain('warning')
    expect(text).toContain('info')
  })

  it('omits files with no diagnostics from the body', () => {
    const text = formatText(result)
    expect(text).not.toContain('/abs/clean.ts')
  })

  it('renders the trailing summary with pluralisation', () => {
    const text = formatText(result)
    expect(text).toMatch(/1 error/)
    expect(text).toMatch(/1 warning/)
    expect(text).toMatch(/1 info/)
  })

  it('pluralises errors and warnings when count > 1', () => {
    const multi: LintResult = {
      files: [
        {
          filePath: '/x.ts',
          diagnostics: [
            { ruleId: 'r', severity: 'error', message: 'm', loc: { line: 1, column: 1 } },
            { ruleId: 'r', severity: 'error', message: 'm', loc: { line: 2, column: 1 } },
            { ruleId: 'r', severity: 'warn', message: 'm', loc: { line: 3, column: 1 } },
            { ruleId: 'r', severity: 'warn', message: 'm', loc: { line: 4, column: 1 } },
          ],
          fixed: 0,
        },
      ],
      totalErrors: 2,
      totalWarnings: 2,
      totalInfos: 0,
      totalFixed: 0,
      configDiagnostics: [],
    }
    const text = formatText(multi)
    expect(text).toMatch(/2 errors/)
    expect(text).toMatch(/2 warnings/)
  })

  it('returns empty-ish output for a clean result (no summary)', () => {
    const text = formatText(empty)
    expect(text.trim()).toBe('')
  })
})

describe('reporter — formatJSON', () => {
  it('round-trips through JSON.parse', () => {
    const json = formatJSON(result)
    expect(JSON.parse(json)).toEqual(result)
  })

  it('produces indented output (multi-line)', () => {
    const json = formatJSON(result)
    expect(json.split('\n').length).toBeGreaterThan(1)
  })

  it('handles empty results', () => {
    expect(JSON.parse(formatJSON(empty))).toEqual(empty)
  })
})

describe('reporter — formatCompact', () => {
  it('emits one line per diagnostic in `path:line:col: severity [ruleId] message` form', () => {
    const text = formatCompact(result)
    const lines = text.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(
      '/abs/foo.ts:12:4: error [pyreon/no-window-in-ssr] window is undefined in SSR',
    )
    expect(lines[1]).toBe(
      '/abs/bar.ts:5:10: warn [pyreon/no-bare-signal-in-jsx] bare signal in JSX text',
    )
    expect(lines[2]).toBe(
      '/abs/bar.ts:7:2: info [pyreon/use-pyreon-hooks] consider useEventListener',
    )
  })

  it('emits empty string when there are no diagnostics', () => {
    expect(formatCompact(empty)).toBe('')
  })
})
