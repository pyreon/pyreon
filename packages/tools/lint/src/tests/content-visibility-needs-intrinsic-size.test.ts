/**
 * Dedicated tests for the opt-in frontend rule
 * `pyreon/content-visibility-needs-intrinsic-size`.
 *
 * Imported directly + passed to `lintFile` so it runs without
 * `rules/index.ts` wiring. Enabled via explicit config (opt-in → OFF
 * in presets).
 *
 * Bisect-verifiable: neutering the rule's `create` to `return {}` makes
 * every FIRES spec fail while the DOES-NOT-FIRE specs stay green.
 */
import type { LintConfig } from '../types'
import { contentVisibilityNeedsIntrinsicSize } from '../rules/frontend/content-visibility-needs-intrinsic-size'
import { lintFile } from '../runner'

const ID = 'pyreon/content-visibility-needs-intrinsic-size'
const ON: LintConfig = { rules: { [ID]: 'warn' } }

function lint(source: string, filePath = 'src/App.tsx', config: LintConfig = ON) {
  return lintFile(filePath, source, [contentVisibilityNeedsIntrinsicSize], config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

describe('pyreon/content-visibility-needs-intrinsic-size (dedicated)', () => {
  // ── FIRES (object literal — JSX style + styler/rocketstyle theme) ─────────
  it('FIRES on a JSX style object with contentVisibility:auto and no intrinsic size', () => {
    const r = lint(`export default () => <section style={{ contentVisibility: 'auto' }} />`)
    expect(diagIds(r)).toContain(ID)
  })

  it('FIRES on a styler/rocketstyle theme object (arrow-returned)', () => {
    const r = lint(`const Card = styled('div').theme(() => ({ contentVisibility: 'auto', padding: 16 }))`)
    expect(diagIds(r)).toContain(ID)
  })

  it('FIRES on a kebab-case string key', () => {
    const r = lint(`const t = { 'content-visibility': 'auto' }`)
    expect(diagIds(r)).toContain(ID)
  })

  it('FIRES on auto !important', () => {
    const r = lint(`const t = { contentVisibility: 'auto !important' }`)
    expect(diagIds(r)).toContain(ID)
  })

  // ── FIRES (CSS template literals) ─────────────────────────────────────────
  it('FIRES on a css`` template literal', () => {
    const r = lint("const s = css`display: block; content-visibility: auto;`")
    expect(diagIds(r)).toContain(ID)
  })

  it('FIRES on a styled() tagged template', () => {
    const r = lint("const X = styled('div')`content-visibility: auto`")
    expect(diagIds(r)).toContain(ID)
  })

  // ── FIRES (string style attribute) ────────────────────────────────────────
  it('FIRES on a string style="content-visibility: auto"', () => {
    const r = lint(`export default () => <div style="content-visibility: auto" />`)
    expect(diagIds(r)).toContain(ID)
  })

  // ── DOES NOT FIRE (intrinsic size present) ────────────────────────────────
  it('does NOT fire when containIntrinsicSize is in the same object', () => {
    const r = lint(
      `const t = { contentVisibility: 'auto', containIntrinsicSize: 'auto 800px' }`,
    )
    expect(diagIds(r)).not.toContain(ID)
  })

  it('does NOT fire when a containIntrinsic* longhand is present', () => {
    const r = lint(`const t = { contentVisibility: 'auto', containIntrinsicHeight: '800px' }`)
    expect(diagIds(r)).not.toContain(ID)
  })

  it('does NOT fire on a css`` template that sets contain-intrinsic-size', () => {
    const r = lint(
      "const s = css`content-visibility: auto; contain-intrinsic-size: auto 800px;`",
    )
    expect(diagIds(r)).not.toContain(ID)
  })

  // ── DOES NOT FIRE (not the footgun) ───────────────────────────────────────
  it('does NOT fire on content-visibility: hidden', () => {
    const r = lint(`const t = { contentVisibility: 'hidden' }`)
    expect(diagIds(r)).not.toContain(ID)
  })

  it('does NOT fire on content-visibility: visible (css text)', () => {
    const r = lint("const s = css`content-visibility: visible`")
    expect(diagIds(r)).not.toContain(ID)
  })

  it('does NOT fire on an unrelated object', () => {
    const r = lint(`const t = { color: 'red', padding: 16 }`)
    expect(diagIds(r)).not.toContain(ID)
  })

  it('does NOT fire on an unrelated template literal', () => {
    const r = lint("const s = css`color: red; display: flex;`")
    expect(diagIds(r)).not.toContain(ID)
  })

  // ── OPT-IN BEHAVIOUR ─────────────────────────────────────────────────────
  it('does NOT fire when the rule is not enabled (opt-in default OFF)', () => {
    const r = lint(`const t = { contentVisibility: 'auto' }`, 'src/App.tsx', { rules: {} })
    expect(diagIds(r)).not.toContain(ID)
  })

  // ── exemptPaths ──────────────────────────────────────────────────────────
  it('does NOT fire for an exempt path', () => {
    const r = lint(`const t = { contentVisibility: 'auto' }`, 'packages/vendor/x.ts', {
      rules: { [ID]: ['warn', { exemptPaths: ['packages/vendor/'] }] },
    })
    expect(diagIds(r)).not.toContain(ID)
  })
})
