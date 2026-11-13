/**
 * The pyreon-lint subcommands that print for people, in the shared terminal
 * theme: `--list`, `--why-off`, `--init`, and `--format gha`. Each at every
 * colour level on both backgrounds and with ASCII symbols; NO_COLOR output
 * is complete; nothing wider than the window except an unbreakable token.
 */
import { stripAnsi } from '@pyreon/ansi'
import { describe, expect, it } from 'vitest'
import { formatInitResult, formatRuleList } from '../cli'
import { formatGha } from '../reporter'
import type { LintResult } from '../types'
import { formatRuleState, type RuleState } from '../why-off'

const ESC = String.fromCharCode(27)
const show = (s: string): string => s.split(ESC).join('␛')

const LEVELS = [
  ['plain', { color: 0, unicode: true }],
  ['16 colours', { color: 1, theme: 'dark', unicode: true }],
  ['256 dark', { color: 2, theme: 'dark', unicode: true }],
  ['256 light', { color: 2, theme: 'light', unicode: true }],
  ['truecolor dark', { color: 3, theme: 'dark', unicode: true }],
  ['truecolor light', { color: 3, theme: 'light', unicode: true }],
  ['ascii', { color: 0, unicode: false }],
] as const

const OFF: RuleState = {
  ruleId: 'pyreon/query-options-as-function',
  found: true,
  suggestions: [],
  severity: 'off',
  willRun: false,
  reasons: [
    {
      code: 'opt-in',
      detail: 'This is an opt-in best-practice rule: every shipped preset except best-practices leaves it off.',
      fix: 'enable it in .pyreonlintrc.json: "rules": { "pyreon/query-options-as-function": "warn" }',
    },
    {
      code: 'dependency-missing',
      detail: 'It activates only when the project depends on @pyreon/query, and package.json does not.',
      fix: 'add @pyreon/query to dependencies, or ignore this rule',
    },
  ],
  exemptPaths: ['src/legacy/', 'vendor/'],
}

const ON: RuleState = { ...OFF, ruleId: 'pyreon/no-missing-for-by', severity: 'warn', willRun: true, reasons: [], exemptPaths: [] }
const UNKNOWN: RuleState = {
  ...OFF,
  ruleId: 'pyreon/no-mising-for-by',
  found: false,
  severity: null,
  reasons: [],
  exemptPaths: [],
  suggestions: ['pyreon/no-missing-for-by'],
}

describe('--why-off', () => {
  for (const [name, opts] of LEVELS) {
    it(`renders at ${name}`, () => {
      expect(show([formatRuleState(OFF, opts), formatRuleState(ON, opts), formatRuleState(UNKNOWN, opts)].join('\n\n'))).toMatchSnapshot()
    })
  }

  it('ends on the verdict, which carries a symbol and a word without colour', () => {
    const plain = formatRuleState(OFF, { color: 0, unicode: true })
    expect(plain.split('\n').at(-1)).toBe('✗ WILL NOT RUN · severity: off · 2 reasons')
    expect(formatRuleState(ON, { color: 0, unicode: true }).split('\n').at(-1)).toBe('✓ WILL RUN · severity: warn')
    for (const level of [1, 2, 3] as const) {
      expect(stripAnsi(formatRuleState(OFF, { color: level, unicode: true }))).toBe(plain)
    }
  })
})

describe('--list', () => {
  it('renders at truecolor (one level is enough: the roles are the reporter’s)', () => {
    const text = formatRuleList({ color: 3, theme: 'dark', unicode: true })
    // The registry grows; lock the shape of the first section, not the count.
    const firstSection = text.split('\n\n').slice(0, 2).join('\n\n')
    expect(show(firstSection)).toMatchSnapshot()
  })

  it('wraps every description at 100 columns and ends on the total', () => {
    const text = formatRuleList({ color: 0, unicode: true, width: 100 })
    for (const line of text.split('\n')) expect(line.length, line).toBeLessThanOrEqual(100)
    expect(text.split('\n').at(-1)).toMatch(/^\d+ rules total · \d+ fixable$/)
  })

  it('stacks the description under the id in a narrow window', () => {
    const text = formatRuleList({ color: 0, unicode: true, width: 50 })
    for (const line of text.split('\n')) {
      // A line that is one unbreakable token (a long rule id or API list)
      // may overflow; wrapping never splits a token.
      const tokens = line.trim().split(' ')
      if (tokens.length > 1 && !/^ {4}pyreon\//.test(line)) expect(line.length, line).toBeLessThanOrEqual(50)
    }
  })

  it('NO_COLOR output is complete', () => {
    const plain = formatRuleList({ color: 0, unicode: true })
    expect(stripAnsi(formatRuleList({ color: 3, unicode: true }))).toBe(plain)
    expect(plain).toMatch(/ (error|warn |info |off  ) /)
  })
})

describe('--init', () => {
  const written = {
    status: 'written' as const,
    message:
      'Wrote .pyreonlintrc.json with the `app` preset (no published entry point).\n  Library rules will activate for: @pyreon/query\n\n  Next: `pyreon-lint .`',
  }
  for (const [name, opts] of LEVELS.filter(([n]) => n === 'plain' || n === 'truecolor dark' || n === 'ascii')) {
    it(`renders at ${name}`, () => {
      const out = [
        formatInitResult(written, opts),
        formatInitResult({ status: 'exists', message: '.pyreonlintrc.json already exists — leaving it alone.' }, opts),
        formatInitResult({ status: 'no-package-json', message: 'No package.json here, so the preset cannot be inferred.' }, opts),
      ]
      expect(show(out.join('\n\n'))).toMatchSnapshot()
    })
  }
})

describe('--format gha', () => {
  it('one annotation per diagnostic, paths relative to cwd', () => {
    const result: LintResult = {
      files: [
        {
          filePath: '/repo/src/routes/inbox.tsx',
          diagnostics: [
            { ruleId: 'pyreon/no-missing-for-by', severity: 'warn', message: '<For> needs a `by` key', loc: { line: 42, column: 7 } },
            { ruleId: 'pyreon/no-signal-call-write', severity: 'error', message: 'signal(v) only reads.\nWrite with draft.set(v)', loc: { line: 58, column: 12 } },
          ],
        },
      ],
      totalErrors: 1,
      totalWarnings: 1,
      totalInfos: 0,
      configDiagnostics: [{ ruleId: 'lint-config', severity: 'warn', message: 'unknown rule pyreon/x' }],
    } as unknown as LintResult
    expect(formatGha(result, { cwd: '/repo' })).toMatchSnapshot()
  })
})
