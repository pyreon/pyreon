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
    })
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
