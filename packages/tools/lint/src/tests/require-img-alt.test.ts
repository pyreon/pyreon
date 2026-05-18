/**
 * Dedicated tests for the opt-in frontend rule `pyreon/require-img-alt`.
 *
 * The rule is imported DIRECTLY and passed as the only rule to
 * `lintFile`, so the suite runs without `rules/index.ts` wiring.
 * Because the rule is `optIn: true` it's OFF under the standard
 * presets — these tests enable it via an explicit config object.
 */
import type { LintConfig } from '../types'
import { requireImgAlt } from '../rules/frontend/require-img-alt'
import { lintFile } from '../runner'

const ON: LintConfig = { rules: { 'pyreon/require-img-alt': 'error' } }

function lint(source: string, filePath = 'src/App.tsx', config: LintConfig = ON) {
  return lintFile(filePath, source, [requireImgAlt], config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

describe('pyreon/require-img-alt (dedicated)', () => {
  // ── FIRES ────────────────────────────────────────────────────────────────
  it('FIRES on a self-closing <img> with no alt', () => {
    const result = lint(`export default () => <img src="logo.png" />`)
    expect(diagIds(result)).toContain('pyreon/require-img-alt')
  })

  it('FIRES on an <img> with width/height but still no alt', () => {
    const result = lint(`export default () => <img src="x.png" width={40} height={40} />`)
    expect(diagIds(result)).toContain('pyreon/require-img-alt')
  })

  // ── DOES NOT FIRE ────────────────────────────────────────────────────────
  it('does NOT fire on <img alt="...">', () => {
    const result = lint(`export default () => <img src="logo.png" alt="Company logo" />`)
    expect(diagIds(result)).not.toContain('pyreon/require-img-alt')
  })

  it('does NOT fire on decorative <img alt=""> (empty alt is valid)', () => {
    const result = lint(`export default () => <img src="divider.png" alt="" />`)
    expect(diagIds(result)).not.toContain('pyreon/require-img-alt')
  })

  it('does NOT fire on non-img elements', () => {
    const result = lint(`export default () => <div><span>hi</span></div>`)
    expect(diagIds(result)).not.toContain('pyreon/require-img-alt')
  })

  // ── OPT-IN BEHAVIOUR ─────────────────────────────────────────────────────
  it('does NOT fire when the rule is not enabled in config (opt-in default OFF)', () => {
    const result = lint(`export default () => <img src="logo.png" />`, 'src/App.tsx', {
      rules: {},
    })
    expect(diagIds(result)).not.toContain('pyreon/require-img-alt')
  })

  // ── exemptPaths ──────────────────────────────────────────────────────────
  it('does NOT fire for an exempt path', () => {
    const result = lint(`export default () => <img src="logo.png" />`, 'src/legacy/Old.tsx', {
      rules: {
        'pyreon/require-img-alt': ['error', { exemptPaths: ['src/legacy/'] }],
      },
    })
    expect(diagIds(result)).not.toContain('pyreon/require-img-alt')
  })
})
