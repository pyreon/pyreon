/**
 * Dedicated tests for the opt-in frontend rule
 * `pyreon/img-requires-dimensions`.
 *
 * Imported directly + passed to `lintFile` so it runs without
 * `rules/index.ts` wiring. Enabled via explicit config (opt-in → OFF
 * in presets).
 */
import type { LintConfig } from '../types'
import { imgRequiresDimensions } from '../rules/frontend/img-requires-dimensions'
import { lintFile } from '../runner'

const ON: LintConfig = { rules: { 'pyreon/img-requires-dimensions': 'warn' } }

function lint(source: string, filePath = 'src/App.tsx', config: LintConfig = ON) {
  return lintFile(filePath, source, [imgRequiresDimensions], config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

describe('pyreon/img-requires-dimensions (dedicated)', () => {
  // ── FIRES ────────────────────────────────────────────────────────────────
  it('FIRES on <img> with no width/height', () => {
    const result = lint(`export default () => <img src="x.png" alt="x" />`)
    expect(diagIds(result)).toContain('pyreon/img-requires-dimensions')
  })

  it('FIRES when only width is present (height missing)', () => {
    const result = lint(`export default () => <img src="x.png" alt="x" width={100} />`)
    expect(diagIds(result)).toContain('pyreon/img-requires-dimensions')
  })

  it('FIRES when only height is present (width missing)', () => {
    const result = lint(`export default () => <img src="x.png" alt="x" height="80" />`)
    expect(diagIds(result)).toContain('pyreon/img-requires-dimensions')
  })

  // ── DOES NOT FIRE ────────────────────────────────────────────────────────
  it('does NOT fire when BOTH width and height are present', () => {
    const result = lint(`export default () => <img src="x.png" alt="x" width={100} height={80} />`)
    expect(diagIds(result)).not.toContain('pyreon/img-requires-dimensions')
  })

  it('does NOT fire on non-img elements', () => {
    const result = lint(`export default () => <video src="x.mp4" />`)
    expect(diagIds(result)).not.toContain('pyreon/img-requires-dimensions')
  })

  // ── OPT-IN BEHAVIOUR ─────────────────────────────────────────────────────
  it('does NOT fire when the rule is not enabled (opt-in default OFF)', () => {
    const result = lint(`export default () => <img src="x.png" />`, 'src/App.tsx', {
      rules: {},
    })
    expect(diagIds(result)).not.toContain('pyreon/img-requires-dimensions')
  })

  // ── exemptPaths ──────────────────────────────────────────────────────────
  it('does NOT fire for an exempt path', () => {
    const result = lint(`export default () => <img src="x.png" />`, 'vendor/legacy.tsx', {
      rules: {
        'pyreon/img-requires-dimensions': ['warn', { exemptPaths: ['vendor/'] }],
      },
    })
    expect(diagIds(result)).not.toContain('pyreon/img-requires-dimensions')
  })
})
