import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

/**
 * `exemptPaths` applies to EVERY rule, not just the ones that remembered to
 * ask for it.
 *
 * It began as an opt-in helper: a rule called `isPathExempt(ctx)` itself, and
 * 55 of the 101 rules never did. Configuring an exemption for one of those was
 * silently inert — the config parsed, the option validated, and nothing
 * changed. Nothing reported it, so the only way to find out was to read the
 * rule's source and notice the missing call.
 *
 * That is the shape the repo's catalog calls a silent-hole generator: a
 * capability that works for a hand-maintained subset, where being outside the
 * subset is indistinguishable from being inside it.
 *
 * The fix is central: the rule loop skips an exempt file before `rule.create()`
 * runs, so support is a property of the runner rather than a property each
 * rule opts into. These specs pin BOTH halves — the rule fires without the
 * exemption, and is silent with it.
 */

/** A rule that does NOT call `isPathExempt` in its own implementation. */
const RULE = 'pyreon/no-theme-outside-provider'
const SOURCE = `import { useTheme } from '@pyreon/ui-core'
export function C() { const t = useTheme(); return null }`
const FILE = '/repo/packages/ui-system/rocketstyle/src/hoc/attrs.ts'

const run = (config: LintConfig) =>
  lintFile(FILE, SOURCE, allRules, config).diagnostics.filter((d) => d.ruleId === RULE)

describe('exemptPaths is honoured for every rule', () => {
  it('the rule under test does NOT implement exemptPaths itself', () => {
    // If this ever becomes false the spec still passes but stops proving the
    // central path, so assert the premise rather than assume it.
    const rule = allRules.find((r) => r.meta.id === RULE)
    expect(rule, RULE).toBeDefined()
    expect(String(rule?.create)).not.toContain('isPathExempt')
  })

  it('fires when nothing is exempted', () => {
    expect(run({ rules: { [RULE]: 'error' } })).toHaveLength(1)
  })

  it('is silent when the path IS exempted — even though the rule never asks', () => {
    expect(
      run({ rules: { [RULE]: ['error', { exemptPaths: ['packages/ui-system/rocketstyle/'] }] } }),
    ).toEqual([])
  })

  it('a non-matching exemption does not silence it', () => {
    expect(
      run({ rules: { [RULE]: ['error', { exemptPaths: ['packages/core/router/'] }] } }),
    ).toHaveLength(1)
  })

  it('an empty exemption list does not silence it', () => {
    expect(run({ rules: { [RULE]: ['error', { exemptPaths: [] }] } })).toHaveLength(1)
  })

  it('holds for a rule that DOES implement it — no double-handling regression', () => {
    const id = 'pyreon/no-window-in-ssr'
    const src = `export function C() { return window.innerWidth }`
    const on = lintFile(FILE, src, allRules, { rules: { [id]: 'error' } }).diagnostics
    expect(on.filter((d) => d.ruleId === id).length).toBeGreaterThan(0)
    const off = lintFile(FILE, src, allRules, {
      rules: { [id]: ['error', { exemptPaths: ['packages/ui-system/rocketstyle/'] }] },
    }).diagnostics
    expect(off.filter((d) => d.ruleId === id)).toEqual([])
  })
})
