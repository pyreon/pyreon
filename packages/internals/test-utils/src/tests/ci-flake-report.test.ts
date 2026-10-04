import { describe, expect, it } from 'vitest'
import {
  escapeHtml,
  flakeSummary,
  parsePlaywrightFlakes,
} from '../../../../../scripts/ci-flake-report'

describe('parsePlaywrightFlakes', () => {
  it('sums batched-suite flaky counts and records unique retry titles', () => {
    const report = parsePlaywrightFlakes(
      [
        '\u001b[33m  1 flaky\u001b[39m',
        '  [chromium] › a.spec.ts:4:1 › opens menu (retry #1)',
        '  [chromium] › a.spec.ts:4:1 › opens menu (retry #1)',
        '  2 flaky',
        '  [chromium] › b.spec.ts:8:1 › saves (retry #2)',
      ].join('\n'),
      'docs+atlas',
    )
    expect(report).toMatchObject({ suite: 'docs+atlas', sourceAvailable: true, flakyCount: 3 })
    expect(report.retries).toHaveLength(2)
    expect(report.retries.map((item) => item.retry)).toEqual([1, 2])
  })

  it('returns a stable empty report for a clean run', () => {
    expect(parsePlaywrightFlakes('  18 passed (4.2s)\n', 'core')).toEqual({
      version: 1,
      suite: 'core',
      sourceAvailable: true,
      flakyCount: 0,
      retries: [],
      flakyTitles: [],
    })
  })

  it('records dot-reporter summary titles without inventing a retry number', () => {
    // Shape emitted by hosted core E2E on 2026-10-04. The dot reporter
    // prints a flaky summary but does not print `(retry #N)` lines.
    const title =
      '[fundamentals] › e2e/fundamentals/new-demos.spec.ts:126:7 › Hooks demo › typing into debounced input'
    const report = parsePlaywrightFlakes(
      [
        '  1) [fundamentals] › earlier assertion failure',
        '    Error: expected "abc", received "(empty)"',
        '  1 flaky',
        `    ${title}`,
        '  140 passed (1.5m)',
        '  [fundamentals] › unrelated output after the summary',
      ].join('\n'),
      'core',
    )
    expect(report.flakyCount).toBe(1)
    expect(report.retries).toEqual([])
    expect(report.flakyTitles).toEqual([title])
    expect(flakeSummary(report)).toContain(title)
    expect(flakeSummary(report)).not.toContain('no retry title')
  })

  it('preserves names from mixed reporters and excludes incidental count text', () => {
    const first = '[chromium] › a.spec.ts:4:1 › opens menu'
    const second = '[chromium] › b.spec.ts:8:1 › saves'
    const report = parsePlaywrightFlakes(
      [
        'the example text says 99 flaky problems',
        `${first} (retry #2)`,
        '  1 flaky',
        first,
        '  2 passed',
        '  1 flaky',
        second,
        '  8 passed',
      ].join('\n'),
      'batch',
    )
    expect(report.flakyCount).toBe(2)
    expect(report.flakyTitles).toEqual([first, second])
    const summary = flakeSummary(report)
    expect(summary).toContain(`${first} (retry #2)`)
    expect(summary).toContain(second)
    expect(summary.split(first)).toHaveLength(2)
  })
})

describe('flakeSummary', () => {
  it('is empty for a clean run and actionable for a retry', () => {
    expect(flakeSummary(parsePlaywrightFlakes('10 passed', 'core'))).toBe('')
    expect(flakeSummary(parsePlaywrightFlakes('1 flaky\nx (retry #1)', 'core'))).toContain(
      'x (retry #1)',
    )
  })

  it('HTML-encodes every special character in untrusted test titles', () => {
    expect(escapeHtml(`<script a="x">Tom & 'Sue'</script>`)).toBe(
      '&lt;script a=&quot;x&quot;&gt;Tom &amp; &#39;Sue&#39;&lt;/script&gt;',
    )
  })
})
