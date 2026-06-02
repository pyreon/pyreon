/**
 * Tests for the opt-in frontend a11y rule `pyreon/color-contrast`.
 *
 * Flags a `color` + `background`/`backgroundColor` LITERAL-HEX pair in a
 * style object whose WCAG contrast ratio is below AA (4.5:1). Theme
 * tokens, rgb()/hsl(), named colours, and alpha hex are deliberately out
 * of scope (not statically resolvable to a ratio).
 */
import { describe, expect, it } from 'vitest'
import { colorContrast } from '../rules/frontend/color-contrast'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const RULE = 'pyreon/color-contrast'
const ON: LintConfig = { rules: { [RULE]: 'warn' } }

function ids(source: string, config: LintConfig = ON): string[] {
  return lintFile('App.tsx', source, [colorContrast], config).diagnostics.map((d) => d.ruleId)
}

describe('pyreon/color-contrast', () => {
  // ── FIRES (the exact bokisch.com Lighthouse pairs) ───────────────────────
  it('FIRES on #6b7280 text on #212121 bg (3.33:1)', () => {
    expect(ids(`export default () => <p style={{ color: '#6b7280', background: '#212121' }}>x</p>`)).toContain(RULE)
  })

  it('FIRES on #f8f8f8 on #06b6d4 (2.28:1) via backgroundColor', () => {
    expect(ids(`export default () => <span style={{ color: '#f8f8f8', backgroundColor: '#06b6d4' }}>x</span>`)).toContain(RULE)
  })

  it('FIRES on a 3-digit hex low-contrast pair (#777 on #222)', () => {
    expect(ids(`const s = { color: '#777', background: '#222' }`)).toContain(RULE)
  })

  // ── DOES NOT FIRE ────────────────────────────────────────────────────────
  it('does NOT fire on a high-contrast pair (#000 on #fff = 21:1)', () => {
    expect(ids(`const s = { color: '#000', background: '#fff' }`)).not.toContain(RULE)
  })

  it('does NOT fire when only color is set (no background)', () => {
    expect(ids(`const s = { color: '#6b7280' }`)).not.toContain(RULE)
  })

  it('does NOT fire on theme tokens (member expressions — not literal hex)', () => {
    expect(ids(`const s = (t) => ({ color: t.color.muted, background: t.color.dark })`)).not.toContain(RULE)
  })

  it('does NOT fire on alpha hex (8-digit — effective contrast unknown)', () => {
    expect(ids(`const s = { color: '#6b728080', background: '#212121' }`)).not.toContain(RULE)
  })

  it('does NOT fire on rgb()/named colours (not hex)', () => {
    expect(ids(`const s = { color: 'rgb(107,114,128)', background: 'black' }`)).not.toContain(RULE)
  })

  // ── OPT-IN ───────────────────────────────────────────────────────────────
  it('does NOT fire when the rule is disabled (opt-in default OFF)', () => {
    expect(ids(`const s = { color: '#777', background: '#222' }`, { rules: {} })).not.toContain(RULE)
  })
})
