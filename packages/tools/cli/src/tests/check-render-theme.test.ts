/**
 * `pyreon check` in the shared terminal theme: the report at every colour
 * level (plain, 16, 256, truecolor) on both backgrounds and with the ASCII
 * symbols, the empty states, wrapping at 100 columns without cutting a
 * path, and `--gha`.
 */
import { createTerm, stripAnsi } from '@pyreon/ansi'
import { describe, expect, it } from 'vitest'
import { type CheckRun, type Finding, renderCheckEmpty, renderCheckGha, renderCheckText } from '../check'

const ESC = String.fromCharCode(27)
const show = (s: string): string => s.split(ESC).join('␛')

const LONG_PATH = 'apps/storefront/src/routes/account/settings/notifications/preferences/EmailDigestPanel.tsx'

const FINDINGS: Finding[] = [
  {
    file: 'src/Counter.tsx',
    line: 4,
    column: 3,
    code: 'signal-write-as-call',
    source: 'pyreon',
    message: '`count(5)` reads the signal and ignores the argument; it does not write.',
    suggested: 'count.set(5)',
    fixable: true,
  },
  {
    file: 'src/Counter.tsx',
    line: 9,
    column: 7,
    code: 'use-state',
    source: 'react',
    message: 'useState is a React API. In Pyreon, use signal(). Read: n(), Write: n.set(x)',
    suggested: 'const n = signal(0)',
    fixable: false,
  },
  {
    file: LONG_PATH,
    line: 112,
    column: 18,
    code: 'for-missing-by',
    source: 'pyreon',
    message:
      '<For> without `by` recreates every row when the list is reordered, which loses focus, scroll position and any per-row state the rows hold.',
    suggested: '<For each={digests} by={(d) => d.id}>',
    fixable: false,
  },
]

const RUN: CheckRun = {
  findings: FINDINGS,
  fileCount: 7,
  fixedCount: 0,
  fromGit: true,
  fix: false,
  elapsedMs: 42,
  cwd: '/repo',
}

const TERMS = [
  ['plain', { level: 0, unicode: true }],
  ['16 colours', { level: 1, theme: 'dark', unicode: true }],
  ['256 dark', { level: 2, theme: 'dark', unicode: true }],
  ['256 light', { level: 2, theme: 'light', unicode: true }],
  ['truecolor dark', { level: 3, theme: 'dark', unicode: true }],
  ['truecolor light', { level: 3, theme: 'light', unicode: true }],
  ['ascii', { level: 0, unicode: false }],
] as const

describe('pyreon check report', () => {
  for (const [name, opts] of TERMS) {
    it(`renders at ${name}`, () => {
      expect(show(renderCheckText(createTerm(opts), RUN))).toMatchSnapshot()
    })
  }

  it('NO_COLOR output is the coloured output with the escapes removed', () => {
    const plain = renderCheckText(createTerm({ level: 0, unicode: true }), RUN)
    for (const level of [1, 2, 3] as const) {
      expect(stripAnsi(renderCheckText(createTerm({ level, unicode: true }), RUN))).toBe(plain)
    }
    // Every state carries a symbol and a word without colour.
    expect(plain).toContain('✗ signal-write-as-call · ')
    expect(plain).toContain('✗ 3 findings in 2 files')
  })

  it('wraps at 100 columns and never cuts a path', () => {
    const text = renderCheckText(createTerm({ level: 0, unicode: true, width: 100 }), RUN)
    for (const line of text.split('\n')) {
      if (!line.includes(LONG_PATH)) expect(line.length).toBeLessThanOrEqual(100)
    }
    expect(text).toContain(`↳ ${LONG_PATH}:112:18`)
  })

  it('wraps to a narrow window (58 columns) without cutting the path', () => {
    const text = renderCheckText(createTerm({ level: 0, unicode: true, width: 58 }), RUN)
    expect(text).toContain(`↳ ${LONG_PATH}:112:18`)
    for (const line of text.split('\n')) {
      if (!line.includes(LONG_PATH)) expect(line.length).toBeLessThanOrEqual(58)
    }
    expect(text).toMatchSnapshot()
  })

  it('a clean run and a --fix run', () => {
    const t = createTerm({ level: 0, unicode: true })
    expect(renderCheckText(t, { ...RUN, findings: [], fixedCount: 2, fix: true })).toMatchSnapshot()
  })

  it('the empty runs say which remedy applies, as info and never ✓', () => {
    const t = createTerm({ level: 0, unicode: true })
    expect(renderCheckEmpty(t, true)).toBe(
      'ℹ No changed .ts/.tsx files to check · pass paths explicitly: pyreon check src/',
    )
    expect(renderCheckEmpty(t, false)).toBe(
      'ℹ No source files matched · pass a .ts/.tsx/.js/.jsx file or a directory',
    )
  })

  it('--gha: one error annotation per finding', () => {
    expect(renderCheckGha(FINDINGS)).toMatchSnapshot()
    expect(renderCheckGha([])).toBe('')
  })
})
