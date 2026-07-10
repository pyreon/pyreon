/**
 * Tests for the opt-in `frontend` best-practice rule:
 *   - pyreon/anchor-is-valid  (not fixable)
 *
 * Structure mirrors `frontend-rules.test.ts`: paired FIRES /
 * DOES-NOT-FIRE specs for fast bisect-verification.
 *
 * The rule is `optIn: true`, so the standard presets force it OFF.
 * We use `getPreset('best-practices')` — which enables every opt-in
 * rule at its declared severity — to exercise the real opt-in
 * mechanic, and layer an explicit severity entry on top so the suite
 * is robust both before and after central registration.
 */
import { getPreset } from '../config/presets'
import { anchorIsValid } from '../rules/frontend/anchor-is-valid'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const ANCHOR_RULES = [anchorIsValid]

function bpConfig(): LintConfig {
  const base = getPreset('best-practices')
  return {
    rules: {
      ...base.rules,
      'pyreon/anchor-is-valid': 'warn',
    },
  }
}

function lint(source: string, filePath = 'src/App.tsx', config = bpConfig()) {
  return lintFile(filePath, source, ANCHOR_RULES, config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

// Sanity: the `best-practices` preset is the opt-in switch — under
// `recommended` this rule stays OFF even when passed as rules[].
describe('pyreon/anchor-is-valid — opt-in mechanic', () => {
  it('does NOT fire under the `recommended` preset (opt-in OFF)', () => {
    const result = lintFile(
      'src/App.tsx',
      `function App() { return <a>x</a> }`,
      ANCHOR_RULES,
      getPreset('recommended'),
    )
    expect(result.diagnostics).toHaveLength(0)
  })
})

describe('pyreon/anchor-is-valid (frontend)', () => {
  it('FIRES on `<a>` with no href attribute', () => {
    const result = lint(`function App() { return <a>x</a> }`)
    expect(diagIds(result)).toContain('pyreon/anchor-is-valid')
  })

  it('FIRES on `<a href="">` (empty href)', () => {
    const result = lint(`function App() { return <a href="">x</a> }`)
    expect(diagIds(result)).toContain('pyreon/anchor-is-valid')
  })

  it('FIRES on `<a href="#">` (placeholder href)', () => {
    const result = lint(`function App() { return <a href="#">x</a> }`)
    expect(diagIds(result)).toContain('pyreon/anchor-is-valid')
  })

  it('FIRES on `<a href="javascript:void(0)">` (javascript: URL)', () => {
    const result = lint(
      `function App() { return <a href="javascript:void(0)">x</a> }`,
    )
    expect(diagIds(result)).toContain('pyreon/anchor-is-valid')
  })

  it('does NOT fire on `<a href="/about">` (real destination)', () => {
    const result = lint(`function App() { return <a href="/about">x</a> }`)
    expect(diagIds(result)).not.toContain('pyreon/anchor-is-valid')
  })

  it('does NOT fire on a dynamic `<a href={url}>` (non-literal)', () => {
    const result = lint(
      `function App({ url }) { return <a href={url}>x</a> }`,
    )
    expect(diagIds(result)).not.toContain('pyreon/anchor-is-valid')
  })

  it('does NOT fire on a component `<A href="">` (uppercase, skipped)', () => {
    const result = lint(`function App() { return <A href="">x</A> }`)
    expect(diagIds(result)).not.toContain('pyreon/anchor-is-valid')
  })

  it('does NOT fire on a non-anchor element `<button>`', () => {
    const result = lint(`function App() { return <button>x</button> }`)
    expect(diagIds(result)).not.toContain('pyreon/anchor-is-valid')
  })

  it('does NOT fire on a bare value-less `<a href>` attribute (nothing to prove)', () => {
    const result = lint(`function App() { return <a href>x</a> }`)
    expect(diagIds(result)).not.toContain('pyreon/anchor-is-valid')
  })

  it('does NOT fire when the file path is exempted', () => {
    const result = lint(
      `function App() { return <a>x</a> }`,
      'src/App.tsx',
      {
        rules: {
          ...getPreset('best-practices').rules,
          'pyreon/anchor-is-valid': ['warn', { exemptPaths: ['src/App.tsx'] }],
        },
      },
    )
    expect(diagIds(result)).not.toContain('pyreon/anchor-is-valid')
  })
})
