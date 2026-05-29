/**
 * Tests for the opt-in `frontend` best-practice lint rule
 * `pyreon/no-autofocus` (fixable).
 *
 * Structure mirrors `frontend-rules.test.ts`: paired FIRES /
 * DOES-NOT-FIRE specs plus a dedicated autofix spec.
 *
 * The rule is `optIn: true`, so the standard presets force it OFF. We
 * use `getPreset('best-practices')` — which enables every opt-in rule
 * at its declared severity — and additionally layer an explicit
 * `'pyreon/no-autofocus': 'warn'` entry on top of the preset config so
 * the suite is robust both before and after central registration into
 * `rules/index.ts`. The rule object is also passed explicitly as the
 * `rules[]` arg for the same reason.
 */
import { getPreset } from '../config/presets'
import { noAutofocus } from '../rules/frontend/no-autofocus'
import { applyFixes, lintFile } from '../runner'
import type { LintConfig } from '../types'

const RULES = [noAutofocus]

function bpConfig(): LintConfig {
  const base = getPreset('best-practices')
  return {
    rules: {
      ...base.rules,
      'pyreon/no-autofocus': 'warn',
    },
  }
}

function lint(source: string, filePath = 'src/App.tsx', config = bpConfig()) {
  return lintFile(filePath, source, RULES, config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

// Sanity: the `best-practices` preset is the opt-in switch — under
// `recommended` this rule stays OFF even when passed as rules[].
describe('pyreon/no-autofocus — opt-in mechanic', () => {
  it('does NOT fire under the `recommended` preset (opt-in OFF)', () => {
    const result = lintFile(
      'src/App.tsx',
      `function App() { return <input autoFocus /> }`,
      RULES,
      getPreset('recommended'),
    )
    expect(result.diagnostics).toHaveLength(0)
  })
})

describe('pyreon/no-autofocus (frontend, fixable)', () => {
  it('FIRES on `<input autoFocus />` (bare attribute)', () => {
    const result = lint(`function App() { return <input autoFocus /> }`)
    expect(diagIds(result)).toContain('pyreon/no-autofocus')
  })

  it('FIRES on `<input autoFocus={true} />`', () => {
    const result = lint(`function App() { return <input autoFocus={true} /> }`)
    expect(diagIds(result)).toContain('pyreon/no-autofocus')
  })

  it('FIRES on `<input autofocus="true" />` (lowercase, string value)', () => {
    const result = lint(`function App() { return <input autofocus="true" /> }`)
    expect(diagIds(result)).toContain('pyreon/no-autofocus')
  })

  it('does NOT fire on `<input />` (no autoFocus attribute)', () => {
    const result = lint(`function App() { return <input /> }`)
    expect(diagIds(result)).not.toContain('pyreon/no-autofocus')
  })

  it('does NOT fire on `<input autoFocus={false} />` (explicit opt-out)', () => {
    const result = lint(`function App() { return <input autoFocus={false} /> }`)
    expect(diagIds(result)).not.toContain('pyreon/no-autofocus')
  })

  it('does NOT fire when the file path is under an exemptPaths entry', () => {
    const config: LintConfig = {
      rules: {
        ...getPreset('best-practices').rules,
        'pyreon/no-autofocus': ['warn', { exemptPaths: ['src/legacy/'] }],
      },
    }
    const result = lint(
      `function App() { return <input autoFocus /> }`,
      'src/legacy/OldForm.tsx',
      config,
    )
    expect(diagIds(result)).not.toContain('pyreon/no-autofocus')
  })

  it('autofix removes the attribute leaving no leftover double space', () => {
    const source = `function App() { return <input autoFocus className="x" /> }`
    const result = lint(source)
    const diag = result.diagnostics.find((d) => d.ruleId === 'pyreon/no-autofocus')
    expect(diag?.fix).toBeDefined()
    expect(diag?.fix?.replacement).toBe('')
    const fixed = applyFixes(source, result.diagnostics)
    expect(fixed).toBe(`function App() { return <input className="x" /> }`)
    expect(fixed).not.toContain('autoFocus')
    expect(fixed).not.toContain('  ')
  })
})
