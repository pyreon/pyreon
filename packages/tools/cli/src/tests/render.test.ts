import { describe, expect, it } from 'vitest'

import { buildReport } from '../doctor/report'
import { renderGha, renderJson, renderText } from '../doctor/render'
import type { Finding, GateResult } from '../doctor/types'

// Strip ANSI for assertions. We test in a controlled NO_COLOR env via
// `FORCE_COLOR=0` at runtime (set in vitest.config or per-run), but
// the test environment may still have a TTY — so strip defensively.
const stripAnsi = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/\u001b\[[0-9;]*m/g, '').replace(/\u001b\][^\u001b]*\u001b\\/g, '')

const f = (
  severity: Finding['severity'],
  category: Finding['category'],
  code: string,
  extra: Partial<Finding> = {},
): Finding => ({
  severity,
  category,
  code,
  gate: 'test',
  message: `Message for ${code}`,
  ...extra,
})

const g = (
  gate: string,
  category: GateResult['category'],
  findings: Finding[] = [],
  meta: Partial<GateResult['meta']> = {},
): GateResult => ({
  gate,
  category,
  findings,
  meta: { elapsedMs: 1, ...meta },
})

describe('renderText', () => {
  it('renders the banner with score + grade', () => {
    const report = buildReport([g('lint', 'correctness')])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('pyreon doctor')
    expect(out).toContain('Score:')
    expect(out).toContain('100')
    expect(out).toContain('Grade:')
    expect(out).toContain('A')
  })

  it('renders per-category bar chart', () => {
    const report = buildReport([
      g('lint', 'correctness', [f('error', 'correctness', 'a/x')]),
      g('distribution', 'architecture'),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('correctness')
    expect(out).toContain('architecture')
    expect(out).toContain('90') // 100 - 10 for one error
    expect(out).toContain('1E') // 1 error breakdown
  })

  it('shows "skipped" for uncovered categories', () => {
    const report = buildReport([g('lint', 'correctness')])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('performance')
    expect(out).toContain('skipped')
  })

  it('lists top-N findings with severity icon + code + message', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('error', 'correctness', 'lint/no-x'),
        f('warning', 'correctness', 'lint/no-y'),
      ]),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('lint/no-x')
    expect(out).toContain('Message for lint/no-x')
    expect(out).toContain('lint/no-y')
  })

  it('shows clean green-light when no findings', () => {
    const report = buildReport([g('lint', 'correctness')])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('No findings')
  })

  it('lists skipped gates in the footer', () => {
    const report = buildReport([
      g('lint', 'correctness'),
      g('bundle-budgets', 'performance', [], {
        skipped: true,
        skipReason: 'enable with --full',
      }),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('Skipped:')
    expect(out).toContain('bundle-budgets')
    expect(out).toContain('enable with --full')
  })

  it('shows fix hint when finding has one', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('warning', 'correctness', 'lint/x', { fix: 'Use `class` instead.' }),
      ]),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('fix:')
    expect(out).toContain('Use `class` instead.')
  })

  it('shows location with line:col when present', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('warning', 'correctness', 'lint/x', {
          location: {
            path: '/abs/file.ts',
            relPath: 'file.ts',
            line: 42,
            column: 7,
          },
        }),
      ]),
    ])
    const out = stripAnsi(renderText(report, { cwd: '/' }))
    expect(out).toContain('file.ts:42:7')
  })

  it('truncates to topN with "and N more" hint', () => {
    const findings = Array(15).fill(null).map((_, i) =>
      f('info', 'correctness', `lint/x${i}`),
    )
    const report = buildReport([g('lint', 'correctness', findings)])
    const out = stripAnsi(renderText(report, { cwd: '/', topN: 3 }))
    expect(out).toContain('and 12 more')
  })
})

describe('renderJson', () => {
  it('emits a parseable JSON object', () => {
    const report = buildReport([g('lint', 'correctness')])
    const json = renderJson(report)
    const parsed = JSON.parse(json)
    expect(parsed.score).toBe(100)
    expect(parsed.grade).toBe('A')
    expect(Array.isArray(parsed.findings)).toBe(true)
    expect(Array.isArray(parsed.categories)).toBe(true)
    expect(Array.isArray(parsed.gates)).toBe(true)
  })
})

describe('renderGha', () => {
  it('emits a notice header with score + totals', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('error', 'correctness', 'lint/err'),
        f('warning', 'correctness', 'lint/warn'),
      ]),
    ])
    const out = renderGha(report)
    expect(out).toMatch(/^::notice::pyreon doctor score:/)
    expect(out).toContain('1 errors, 1 warnings')
  })

  it('emits per-finding annotation with file + line + col', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('error', 'correctness', 'lint/err', {
          location: {
            path: '/abs/file.ts',
            relPath: 'src/file.ts',
            line: 10,
            column: 5,
          },
        }),
      ]),
    ])
    const out = renderGha(report)
    expect(out).toContain('::error ')
    expect(out).toContain('file=src/file.ts')
    expect(out).toContain('line=10')
    expect(out).toContain('col=5')
  })

  it('maps severity correctly (error → error, warning → warning, info → notice)', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('error', 'correctness', 'a'),
        f('warning', 'correctness', 'b'),
        f('info', 'correctness', 'c'),
      ]),
    ])
    const out = renderGha(report)
    expect(out).toContain('::error ')
    expect(out).toContain('::warning ')
    // notice appears for both the header AND the info finding
    expect((out.match(/::notice/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('URL-encodes special chars in messages', () => {
    const report = buildReport([
      g('lint', 'correctness', [
        f('error', 'correctness', 'a', {
          message: 'line1\nline2',
        }),
      ]),
    ])
    const out = renderGha(report)
    expect(out).toContain('%0A') // newline encoded
  })
})
