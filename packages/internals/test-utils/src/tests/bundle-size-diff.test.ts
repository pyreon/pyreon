import { describe, expect, it } from 'vitest'
import { renderDiff } from '../../../../../scripts/bundle-size-diff'

/**
 * Unit tests for the bundle-size-diff renderer (the PR-comment body).
 *
 * These lock the behaviour the 2026-07 release-PR fix depended on:
 *  - the release comment must show REAL per-package deltas (not the version-
 *    string `+1 B` noise the old base-vs-`main` comparison produced), and
 *  - new/removed packages must be named, not shown as a bogus `+0.0%`.
 *
 * Importing `renderDiff` directly (the CLI is behind `import.meta.main`) keeps
 * this a fast, deterministic pure-function test — no subprocess, no argv.
 */
const report = (pkgs: Record<string, number>) => ({
  measured: Object.entries(pkgs).map(([name, gzip]) => ({ name, raw: gzip * 3, gzip })),
})

describe('renderDiff', () => {
  it('shows real per-package deltas, biggest mover first', () => {
    const { summary } = renderDiff(
      report({ '@pyreon/core': 4530, '@pyreon/compiler': 63770, '@pyreon/hooks': 5610 }),
      report({ '@pyreon/core': 4633, '@pyreon/compiler': 64217, '@pyreon/hooks': 5531 }),
    )
    const table = summary.slice(summary.indexOf('| Package'))
    // biggest abs delta (compiler +447) before core (+103) before hooks (-79)
    expect(table.indexOf('@pyreon/compiler')).toBeLessThan(table.indexOf('@pyreon/core'))
    expect(table.indexOf('@pyreon/core')).toBeLessThan(table.indexOf('@pyreon/hooks'))
    expect(summary).toContain('🔴 +447 B')
    expect(summary).toContain('🟢 -79 B')
  })

  it('names a NEW package instead of printing a bogus +0.0%', () => {
    const { summary } = renderDiff(report({ '@pyreon/a': 1000 }), report({ '@pyreon/a': 1000, '@pyreon/testing': 1730 }))
    expect(summary).toContain('🆕 new (1.69 KB)')
    expect(summary).not.toMatch(/@pyreon\/testing.*\+0\.0%/)
  })

  it('names a REMOVED package', () => {
    const { summary } = renderDiff(report({ '@pyreon/a': 1000, '@pyreon/gone': 2048 }), report({ '@pyreon/a': 1000 }))
    expect(summary).toContain('🗑️ removed (was 2.00 KB)')
  })

  it('a tiny per-byte delta (the version-string noise class) is NOT a regression', () => {
    // The exact shape the release PR used to show against `main`: +1 B on a
    // handful of packages, from the inlined version string. Must stay ✅.
    const { summary, regressions } = renderDiff(
      report({ '@pyreon/a11y': 1290, '@pyreon/toast': 2887 }),
      report({ '@pyreon/a11y': 1291, '@pyreon/toast': 2888 }),
    )
    expect(regressions).toBe(0)
    expect(summary).toContain('_All deltas within noise threshold._ ✅')
  })

  it('flags a real regression past the 5% AND >100 B threshold', () => {
    const { summary, regressions } = renderDiff(
      report({ '@pyreon/big': 10000 }),
      report({ '@pyreon/big': 11000 }), // +1000 B, +10%
    )
    expect(regressions).toBe(1)
    expect(summary).toContain('regressed past threshold')
  })

  it('renders the base label and the note verbatim (backtick-safe)', () => {
    const { summary } = renderDiff(report({ a: 100 }), report({ a: 200 }), {
      baseLabel: 'last release `0.48.0` (`a6bf879b`)',
      note: 'Whole-release delta — 12 PR(s) since `0.48.0` → `0.49.0`.',
    })
    expect(summary).toContain('diff against last release `0.48.0` (`a6bf879b`).')
    expect(summary).toContain('_Whole-release delta — 12 PR(s) since `0.48.0` → `0.49.0`._')
  })

  it('says nothing changed when identical (the correctly-synced no-op case)', () => {
    const { summary, regressions } = renderDiff(report({ a: 100, b: 200 }), report({ a: 100, b: 200 }))
    expect(regressions).toBe(0)
    expect(summary).toContain('_No packages changed size._')
  })
})
