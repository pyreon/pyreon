/**
 * Edge-shape coverage for `pyreon/color-contrast`.
 *
 * The rule only fires when BOTH `color` and a background are LITERAL strings it
 * can parse. Every early-out below is a shape it must decline to judge — a
 * contrast rule that guesses at a computed key or an unparsable value would
 * report a ratio it never actually computed, which is worse than silence.
 */
import { describe, expect, it } from 'vitest'
import { colorContrast } from '../rules/frontend/color-contrast'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const RULES = [colorContrast]
const RULE_ID = 'pyreon/color-contrast'
const CONFIG: LintConfig = { rules: { [RULE_ID]: 'warning' } }
const lint = (src: string, fp = '/abs/src/x.tsx', cfg: LintConfig = CONFIG) =>
  lintFile(fp, src, RULES, cfg).diagnostics.filter((d) => d.ruleId === RULE_ID)

describe('pyreon/color-contrast — shapes it must decline to judge', () => {
  it('fires on a genuinely low-contrast literal pair (control)', () => {
    expect(lint(`const s = { color: '#777777', background: '#888888' }`).length).toBeGreaterThan(0)
  })

  it('accepts a STRING-LITERAL key, not just an identifier', () => {
    // `{ 'color': … }` is the same declaration as `{ color: … }`.
    expect(lint(`const s = { 'color': '#777777', 'background': '#888888' }`).length).toBeGreaterThan(0)
  })

  it('does NOT fire on a COMPUTED key (name unknown at lint time)', () => {
    expect(lint(`const s = { [k]: '#777777', background: '#888888' }`)).toHaveLength(0)
  })

  it('does NOT fire when a value is not a string literal', () => {
    expect(lint(`const s = { color: 123, background: '#888888' }`)).toHaveLength(0)
    expect(lint(`const s = { color: theme.fg, background: '#888888' }`)).toHaveLength(0)
  })

  it('does NOT fire on an unparsable hex (non-hex characters)', () => {
    expect(lint(`const s = { color: '#zzzzzz', background: '#888888' }`)).toHaveLength(0)
  })

  it('handles 3-digit shorthand hex', () => {
    // #777/#888 is the same low-contrast pair in shorthand form.
    expect(lint(`const s = { color: '#777', background: '#888' }`).length).toBeGreaterThan(0)
  })

  it('respects exemptPaths', () => {
    const cfg: LintConfig = { rules: { [RULE_ID]: ['warning', { exemptPaths: ['src/legacy/'] }] } }
    expect(
      lint(`const s = { color: '#777777', background: '#888888' }`, '/abs/src/legacy/x.tsx', cfg),
    ).toHaveLength(0)
  })
})
