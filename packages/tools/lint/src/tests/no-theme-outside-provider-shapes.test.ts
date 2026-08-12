/**
 * Shape coverage for `pyreon/no-theme-outside-provider`.
 *
 * The rule silences itself inside a hook implementation — a `useX` function
 * delegates provider responsibility to its caller, so reporting there would fire
 * on every correctly-written hook in the codebase. Both function forms have to
 * be recognised, because oxc's visitor passes no parent and the arrow form is
 * bracketed via the declarator instead.
 */
import { describe, expect, it } from 'vitest'
import { noThemeOutsideProvider } from '../rules/styling/no-theme-outside-provider'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const RULES = [noThemeOutsideProvider]
const RULE_ID = 'pyreon/no-theme-outside-provider'
const CONFIG: LintConfig = { rules: { [RULE_ID]: 'warn' } }
const lint = (src: string) =>
  lintFile('/abs/src/x.tsx', src, RULES, CONFIG).diagnostics.filter((d) => d.ruleId === RULE_ID)

describe('pyreon/no-theme-outside-provider', () => {
  it('fires on a bare useTheme() with no provider import (control)', () => {
    expect(lint(`const C = () => { const t = useTheme(); return t }`).length).toBeGreaterThan(0)
  })

  it('is silenced by a PyreonUI import', () => {
    expect(
      lint(`import { PyreonUI } from '@pyreon/ui-core'
            const C = () => { const t = useTheme(); return t }`),
    ).toHaveLength(0)
  })

  it('is silenced by a ThemeProvider import', () => {
    expect(
      lint(`import { ThemeProvider } from '@pyreon/ui-core'
            const C = () => { const t = useTheme(); return t }`),
    ).toHaveLength(0)
  })

  it('does NOT fire inside a hook DECLARATION (delegates to its caller)', () => {
    expect(lint(`function useBrand() { return useTheme() }`)).toHaveLength(0)
  })

  it('does NOT fire inside an ARROW hook (bracketed via the declarator)', () => {
    expect(lint(`const useBrand = () => { return useTheme() }`)).toHaveLength(0)
  })

  it('still fires OUTSIDE the hook once its scope has exited', () => {
    // Proves the depth counter decrements — otherwise everything after the
    // first hook in a file would be silently exempt.
    expect(
      lint(`function useBrand() { return useTheme() }
            const C = () => { const t = useTheme(); return t }`).length,
    ).toBeGreaterThan(0)
  })
})
