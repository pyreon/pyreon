/**
 * `pyreon plain` and `pyreon add` in the shared terminal theme, at every
 * colour level, on both backgrounds and with ASCII symbols; NO_COLOR
 * output equals the coloured output with the escapes removed; nothing
 * wider than 100 columns except an unbreakable path.
 */
import { createTerm, stripAnsi } from '@pyreon/ansi'
import { describe, expect, it } from 'vitest'
import { renderAddGuide, renderAddHeader } from '../add'
import { type PlainRun, renderPlainText } from '../plain'

const ESC = String.fromCharCode(27)
const show = (s: string): string => s.split(ESC).join('␛')

const TERMS = [
  ['plain', { level: 0, unicode: true }],
  ['16 colours', { level: 1, theme: 'dark', unicode: true }],
  ['256 dark', { level: 2, theme: 'dark', unicode: true }],
  ['256 light', { level: 2, theme: 'light', unicode: true }],
  ['truecolor dark', { level: 3, theme: 'dark', unicode: true }],
  ['truecolor light', { level: 3, theme: 'light', unicode: true }],
  ['ascii', { level: 0, unicode: false }],
] as const

const PLAIN: PlainRun = {
  reports: [
    { file: 'src/Counter.tsx', status: 'already-plain', converted: [], declined: [], written: false },
    { file: 'src/Profile.tsx', status: 'full', converted: ['name', 'age', 'email'], declined: [], written: true },
    {
      file: 'src/components/settings/notifications/EmailDigestPreferencesPanel.tsx',
      status: 'partial',
      converted: ['open'],
      declined: [
        { name: 'items', code: 'signal-as-value', reason: 'passed to a function as a value, so it must stay a signal', line: 14, column: 9 },
      ],
      written: false,
    },
    {
      file: 'src/store.ts',
      status: 'declined',
      converted: [],
      declined: [{ name: 'count', code: 'exported-signal', reason: 'exported, so another module may call it', line: 3, column: 14 }],
      written: false,
    },
    { file: 'src/util.ts', status: 'nothing', converted: [], declined: [], written: false },
  ],
  skippedTests: 4,
  histogram: new Map([
    ['signal-as-value', 1],
    ['exported-signal', 1],
  ]),
  write: false,
  paths: ['src'],
  cwd: '/repo',
  elapsedMs: 380,
}

describe('pyreon plain', () => {
  for (const [name, opts] of TERMS) {
    it(`renders at ${name}`, () => {
      expect(show(renderPlainText(createTerm(opts), PLAIN))).toMatchSnapshot()
    })
  }

  it('NO_COLOR output is complete, and every state carries a symbol and a word', () => {
    const plain = renderPlainText(createTerm({ level: 0, unicode: true }), PLAIN)
    for (const level of [1, 2, 3] as const) {
      expect(stripAnsi(renderPlainText(createTerm({ level, unicode: true }), PLAIN))).toBe(plain)
    }
    for (const word of ['✓ already plain', '✓ converts fully', '! partial', '! declined', '! 5 files scanned']) {
      expect(plain).toContain(word)
    }
  })

  it('wraps at 100 columns: only an unbreakable path may be longer', () => {
    const text = renderPlainText(createTerm({ level: 0, unicode: true, width: 100 }), PLAIN)
    for (const line of text.split('\n')) {
      if (!line.includes('EmailDigestPreferencesPanel')) expect(line.length, line).toBeLessThanOrEqual(100)
    }
  })

  it('a narrow window stacks the table and never cuts the long path', () => {
    const text = renderPlainText(createTerm({ level: 0, unicode: true, width: 56 }), PLAIN)
    expect(text).toContain('  src/components/settings/notifications/EmailDigestPreferencesPanel.tsx\n    ! partial')
    expect(text).toMatchSnapshot()
  })

  it('a clean, fully-converted run ends on ✓', () => {
    const t = createTerm({ level: 0, unicode: true })
    const text = renderPlainText(t, { ...PLAIN, reports: PLAIN.reports.slice(0, 2), histogram: new Map(), skippedTests: 0 })
    const verdictLines = text.split('\n\n').at(-1) ?? ''
    expect(verdictLines).toBe(
      '✓ 2 files scanned · 1 already plain · 1 convertible · 0 declined · 0 nothing to convert · 1 written\n  380 ms',
    )
  })
})

describe('pyreon add', () => {
  const names = ['@pyreon/query', '@pyreon/not-a-recipe']
  for (const [name, opts] of TERMS) {
    it(`renders at ${name}`, () => {
      const t = createTerm(opts)
      const text = [
        renderAddHeader(t, names, 'bun', 'bun add @pyreon/query @pyreon/not-a-recipe'),
        renderAddGuide(t, names, { dryRun: false, pm: 'bun', elapsedMs: 2400 }),
      ].join('\n')
      expect(show(text)).toMatchSnapshot()
    })
  }

  it('NO_COLOR output is complete, and a dry run ends on an info line', () => {
    const plain = renderAddGuide(createTerm({ level: 0, unicode: true }), names, { dryRun: true, pm: 'npm', elapsedMs: 3 })
    expect(stripAnsi(renderAddGuide(createTerm({ level: 3, unicode: true }), names, { dryRun: true, pm: 'npm', elapsedMs: 3 }))).toBe(plain)
    expect(plain.split('\n').at(-1)).toBe('ℹ --dry-run: nothing installed · 2 packages · npm')
  })
})
