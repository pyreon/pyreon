import { describe, expect, it } from 'vitest'
import { formatCompact, formatJSON, formatText } from '../reporter'
import type { LintResult } from '../types'

// Coverage gap closed in PR #323. The reporter module renders LintResult
// shapes into one of three formats (text / JSON / compact). Pure pretty-
// printing — no I/O, no async — but uncovered until now.

const span = (start: number, end: number) => ({ start, end })

const fileWithErr = {
  filePath: '/abs/foo.ts',
  diagnostics: [
    {
      ruleId: 'pyreon/no-window-in-ssr',
      severity: 'error' as const,
      message: 'window is undefined in SSR',
      loc: { line: 12, column: 4 },
      span: span(0, 6),
    },
  ],
}
const fileWithMixed = {
  filePath: '/abs/bar.ts',
  diagnostics: [
    {
      ruleId: 'pyreon/no-bare-signal-in-jsx',
      severity: 'warn' as const,
      message: 'bare signal in JSX text',
      loc: { line: 5, column: 10 },
      span: span(20, 26),
    },
    {
      ruleId: 'pyreon/use-pyreon-hooks',
      severity: 'info' as const,
      message: 'consider useEventListener',
      loc: { line: 7, column: 2 },
      span: span(40, 60),
    },
  ],
}
const cleanFile = {
  filePath: '/abs/clean.ts',
  diagnostics: [],
}

const result: LintResult = {
  files: [fileWithErr, fileWithMixed, cleanFile],
  totalErrors: 1,
  totalWarnings: 1,
  totalInfos: 1,
  configDiagnostics: [],
}

const empty: LintResult = {
  files: [],
  totalErrors: 0,
  totalWarnings: 0,
  totalInfos: 0,
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
            { ruleId: 'r', severity: 'error', message: 'm', loc: { line: 1, column: 1 }, span: span(0, 1) },
            { ruleId: 'r', severity: 'error', message: 'm', loc: { line: 2, column: 1 }, span: span(2, 3) },
            { ruleId: 'r', severity: 'warn', message: 'm', loc: { line: 3, column: 1 }, span: span(4, 5) },
            { ruleId: 'r', severity: 'warn', message: 'm', loc: { line: 4, column: 1 }, span: span(6, 7) },
          ],
        },
      ],
      totalErrors: 2,
      totalWarnings: 2,
      totalInfos: 0,
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

describe('reporter — formatText shape (shared @pyreon/ansi theme)', () => {
  const ESC = String.fromCharCode(27)
  const show = (s: string) => s.split(ESC).join('␛')
  const shaped: LintResult = {
    files: [
      {
        filePath: '/repo/src/routes/inbox.tsx',
        diagnostics: [
          {
            ruleId: 'pyreon/no-missing-for-by',
            severity: 'warn',
            message: '<For> needs a `by` key so rows survive reorder',
            loc: { line: 42, column: 7 },
            span: span(0, 1),
            fix: { span: span(0, 1), replacement: 'x' },
          },
          {
            ruleId: 'pyreon/no-signal-call-write',
            severity: 'error',
            message: 'signal(v) only reads. Write with draft.set(v)',
            loc: { line: 58, column: 12 },
            span: span(2, 3),
            fix: { span: span(2, 3), replacement: 'y' },
          },
        ],
      },
      {
        filePath: '/repo/src/components/Avatar.tsx',
        diagnostics: [
          { ruleId: 'pyreon/require-img-alt', severity: 'warn', message: '<img> needs alt text', loc: { line: 9, column: 5 }, span: span(0, 1) },
        ],
      },
      { filePath: '/repo/src/clean.ts', diagnostics: [] },
    ],
    totalErrors: 1,
    totalWarnings: 2,
    totalInfos: 0,
    configDiagnostics: [],
  }

  for (const level of [0, 1, 2] as const) {
    for (const theme of ['dark', 'light'] as const) {
      it(`level ${level} · ${theme}`, () => {
        expect(show(formatText(shaped, { cwd: '/repo', elapsedMs: 380, color: level, theme, unicode: true }))).toMatchSnapshot()
      })
    }
  }

  it('ascii fallback', () => {
    expect(formatText(shaped, { cwd: '/repo', elapsedMs: 1400, color: 0, unicode: false })).toMatchSnapshot()
  })

  const plain = { color: 0, unicode: true } as const

  it('shows paths relative to cwd, absolute outside it', () => {
    const text = formatText(shaped, { cwd: '/repo', ...plain })
    expect(text).toContain('\nsrc/routes/inbox.tsx\n')
    expect(formatText(shaped, { cwd: '/elsewhere', ...plain })).toContain('/repo/src/routes/inbox.tsx')
  })

  it('wraps a long message at 100 columns and keeps the rule id', () => {
    const long: LintResult = {
      ...empty,
      totalErrors: 1,
      files: [
        {
          filePath: '/repo/a.ts',
          diagnostics: [
            { ruleId: 'pyreon/long', severity: 'error', message: 'word '.repeat(60).trim(), loc: { line: 1, column: 1 }, span: span(0, 1) },
          ],
        },
      ],
    }
    const text = formatText(long, { cwd: '/repo', ...plain })
    for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(100)
    expect(text).toContain('pyreon/long')
    // Continuation lines hang under the message column.
    expect(text.split('\n')[3]?.startsWith(' '.repeat(16))).toBe(true)
  })

  it('advertises fixable diagnostics only when --fix did not run', () => {
    expect(formatText(shaped, { ...plain })).toContain('2 fixable with --fix')
    expect(formatText(shaped, { ...plain, fixApplied: true })).not.toContain('fixable')
  })

  it('a clean CLI run ends with a verdict; a clean library call prints nothing', () => {
    expect(formatText(empty, { ...plain, elapsedMs: 12 })).toBe('✓ no problems · 0 files · 12 ms')
    expect(formatText(empty, { ...plain })).toBe('')
  })

  it('renders config diagnostics, which used to be dropped from text output', () => {
    const text = formatText({ ...empty, configDiagnostics: [{ ruleId: 'pyreon/x', severity: 'warn', message: 'bad options' }] }, { ...plain })
    expect(text).toContain('lint config')
    expect(text).toContain('warning  bad options  pyreon/x')
  })
})
