/**
 * The zero build's two printed reports outside the build summary (the
 * route-mode table and the perf advisor), in the shared terminal theme at
 * every colour level, with ASCII symbols, NO_COLOR-complete, and wrapped
 * at the terminal width without cutting a route.
 */
import { createTerm, stripAnsi } from '@pyreon/ansi'
import { describe, expect, it } from 'vitest'
import type { RouteAdvisorResult } from '../perf-advisor/checks'
import { formatAdvisorReport } from '../perf-advisor/report'
import { formatRouteModeTable } from '../route-modes'

const ESC = String.fromCharCode(27)
const show = (s: string): string => s.split(ESC).join('␛')

const RESULTS = [
  {
    path: 'src/routes/dashboard/[team]/analytics/index.tsx',
    findings: [
      {
        check: 'route-js-budget',
        severity: 'warn',
        message: 'This route loads 212.4 KB of JavaScript (gzip 71.0 KB), over the 150 KB budget for a first visit.',
        fix: 'lazy-load the chart library with import() inside the panel that renders it',
      },
    ],
  },
  {
    path: 'src/routes/blog/index.tsx',
    findings: [
      {
        check: 'content-visibility-without-intrinsic-size',
        severity: 'info',
        message: '`content-visibility: auto` without `contain-intrinsic-size` makes the scrollbar jump.',
        fix: 'add contain-intrinsic-size: auto 600px next to it',
      },
    ],
  },
] as unknown as RouteAdvisorResult[]

const ENTRIES = [
  { pattern: '/', mode: 'ssg' as const, declared: false },
  { pattern: '/account', mode: 'ssr' as const, declared: false },
  { pattern: '/blog/:slug', mode: 'isr' as const, declared: true },
  { pattern: '/app/*', mode: 'spa' as const, declared: true },
]

const LEVELS = [
  ['plain', { level: 0, unicode: true }],
  ['16 colours', { level: 1, theme: 'dark', unicode: true }],
  ['256 dark', { level: 2, theme: 'dark', unicode: true }],
  ['256 light', { level: 2, theme: 'light', unicode: true }],
  ['truecolor dark', { level: 3, theme: 'dark', unicode: true }],
  ['truecolor light', { level: 3, theme: 'light', unicode: true }],
  ['ascii', { level: 0, unicode: false }],
] as const

describe('perf advisor report', () => {
  for (const [name, opts] of LEVELS) {
    it(`renders at ${name}`, () => {
      expect(show(formatAdvisorReport(RESULTS, createTerm(opts)))).toMatchSnapshot()
    })
  }
  it('NO_COLOR output is complete; warnings-only ends on !', () => {
    const plain = formatAdvisorReport(RESULTS, createTerm({ level: 0, unicode: true }))
    for (const level of [1, 2, 3] as const) {
      expect(stripAnsi(formatAdvisorReport(RESULTS, createTerm({ level, unicode: true })))).toBe(plain)
    }
    expect(plain.split('\n').at(-1)).toBe('! 2 findings across 2 routes · advisory, does not fail the build')
  })
  it('wraps at a narrow width and keeps the route whole', () => {
    const text = formatAdvisorReport(RESULTS, createTerm({ level: 0, unicode: true, width: 56 }))
    expect(text).toContain('↳ src/routes/dashboard/[team]/analytics/index.tsx')
    for (const line of text.split('\n')) {
      if (!line.includes('content-visibility-without')) expect(line.length, line).toBeLessThanOrEqual(56)
    }
  })
})

describe('route-mode table', () => {
  for (const level of [0, 1, 2, 3] as const) {
    it(`renders at level ${level}`, () => {
      expect(show(formatRouteModeTable(ENTRIES, 'ssr', 40, level).join('\n'))).toMatchSnapshot()
    })
  }
  it('NO_COLOR output is complete', () => {
    const plain = formatRouteModeTable(ENTRIES, 'ssr', 40, 0).join('\n')
    expect(stripAnsi(formatRouteModeTable(ENTRIES, 'ssr', 40, 3).join('\n'))).toBe(plain)
  })
})
