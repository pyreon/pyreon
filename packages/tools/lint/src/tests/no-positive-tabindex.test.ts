/**
 * Dedicated tests for the opt-in, fixable frontend rule
 * `pyreon/no-positive-tabindex`.
 *
 * Imported directly + passed to `lintFile` so it runs without
 * `rules/index.ts` wiring. Enabled via explicit config (opt-in → OFF
 * in presets).
 */
import type { LintConfig } from '../types'
import { noPositiveTabindex } from '../rules/frontend/no-positive-tabindex'
import { lintFile } from '../runner'

const ON: LintConfig = { rules: { 'pyreon/no-positive-tabindex': 'warn' } }

function lint(source: string, filePath = 'src/App.tsx', config: LintConfig = ON) {
  return lintFile(filePath, source, [noPositiveTabindex], config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

describe('pyreon/no-positive-tabindex (dedicated)', () => {
  // ── FIRES ────────────────────────────────────────────────────────────────
  it('FIRES on tabIndex={3} (numeric literal in expression container)', () => {
    const result = lint(`export default () => <div tabIndex={3} />`)
    expect(diagIds(result)).toContain('pyreon/no-positive-tabindex')
  })

  it('FIRES on tabindex="2" (string literal, lowercase attr)', () => {
    const result = lint(`export default () => <div tabindex="2" />`)
    expect(diagIds(result)).toContain('pyreon/no-positive-tabindex')
  })

  // ── DOES NOT FIRE ────────────────────────────────────────────────────────
  it('does NOT fire on tabIndex={0}', () => {
    const result = lint(`export default () => <div tabIndex={0} />`)
    expect(diagIds(result)).not.toContain('pyreon/no-positive-tabindex')
  })

  it('does NOT fire on tabIndex={-1} (programmatic focus, negative)', () => {
    const result = lint(`export default () => <div tabIndex={-1} />`)
    expect(diagIds(result)).not.toContain('pyreon/no-positive-tabindex')
  })

  it('does NOT fire on tabindex="0" (string zero)', () => {
    const result = lint(`export default () => <div tabindex="0" />`)
    expect(diagIds(result)).not.toContain('pyreon/no-positive-tabindex')
  })

  it('does NOT fire on dynamic tabIndex={someVar} (not a literal)', () => {
    const result = lint(`export default ({ idx }) => <div tabIndex={idx} />`)
    expect(diagIds(result)).not.toContain('pyreon/no-positive-tabindex')
  })

  // ── FIX ──────────────────────────────────────────────────────────────────
  it('emits a fix replacing the numeric value with 0', () => {
    const result = lint(`export default () => <div tabIndex={3} />`)
    const d = result.diagnostics.find((x) => x.ruleId === 'pyreon/no-positive-tabindex')
    expect(d?.fix).toBeDefined()
    expect(d?.fix?.replacement).toBe('0')
  })

  it('emits a fix replacing the string value with "0"', () => {
    const result = lint(`export default () => <div tabindex="9" />`)
    const d = result.diagnostics.find((x) => x.ruleId === 'pyreon/no-positive-tabindex')
    expect(d?.fix?.replacement).toBe('"0"')
  })

  // ── OPT-IN BEHAVIOUR ─────────────────────────────────────────────────────
  it('does NOT fire when the rule is not enabled (opt-in default OFF)', () => {
    const result = lint(`export default () => <div tabIndex={3} />`, 'src/App.tsx', {
      rules: {},
    })
    expect(diagIds(result)).not.toContain('pyreon/no-positive-tabindex')
  })

  // ── exemptPaths ──────────────────────────────────────────────────────────
  it('does NOT fire for an exempt path', () => {
    const result = lint(`export default () => <div tabIndex={5} />`, 'src/vendor/Widget.tsx', {
      rules: {
        'pyreon/no-positive-tabindex': ['warn', { exemptPaths: ['src/vendor/'] }],
      },
    })
    expect(diagIds(result)).not.toContain('pyreon/no-positive-tabindex')
  })
})
