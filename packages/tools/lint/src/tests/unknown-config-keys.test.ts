import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { diagnoseUnknownConfigKeys, isNear } from '../utils/unknown-config'

/**
 * A config key that names nothing must SAY so.
 *
 * The failure mode it replaces is total silence. An entry like
 * `"pyreon/no-windwo-in-ssr": "off"` parses fine, merges fine, and matches no
 * rule — so the rule the author meant to disable keeps running, and the rule
 * they think they disabled does not exist. Nothing distinguishes that from a
 * line that works.
 *
 * This repo shipped exactly that: `.pyreonlintrc.json` carried
 * `pyreon/dangerously-set-inner-html`, with an `exemptPaths` list, for a rule
 * that has never existed in the registry.
 */

const IDS = allRules.map((r) => r.meta.id)
const run = (cfg: Parameters<typeof diagnoseUnknownConfigKeys>[0]) =>
  diagnoseUnknownConfigKeys(cfg, IDS)

describe('unknown config keys are reported', () => {
  it('is silent on a config that names only real rules', () => {
    expect(run({ rules: { 'pyreon/no-window-in-ssr': 'error' } })).toEqual([])
  })

  it('is silent when there is no config file at all', () => {
    expect(run(null)).toEqual([])
  })

  it('reports an unknown rule id as an error', () => {
    const [d] = run({ rules: { 'pyreon/not-a-rule-at-all': 'off' } })
    expect(d?.severity).toBe('error')
    expect(d?.message).toContain('unknown rule')
  })

  it('suggests the near miss for a typo', () => {
    const [d] = run({ rules: { 'pyreon/no-windwo-in-ssr': 'error' } })
    expect(d?.message).toContain('pyreon/no-window-in-ssr')
  })

  it('reports the exact id this repo actually shipped', () => {
    // Not a synthetic name — `.pyreonlintrc.json` carried this for a rule that
    // does not exist, complete with an exemptPaths list.
    const [d] = run({ rules: { 'pyreon/dangerously-set-inner-html': ['warn', { exemptPaths: ['x'] }] } })
    expect(d?.ruleId).toBe('pyreon/dangerously-set-inner-html')
  })

  it('reports an unknown GROUP and lists the valid ones', () => {
    const [d] = run({ groups: { pyeron: 'error' } as never })
    expect(d?.message).toContain('unknown rule group')
    expect(d?.message).toContain('security')
  })

  it('accepts every real group, including `internal`', () => {
    expect(
      run({ groups: { pyreon: 'error', a11y: 'off', security: 'error', pkg: 'warn', internal: 'error' } }),
    ).toEqual([])
  })

  it('reports every offending key, not just the first', () => {
    expect(run({ rules: { 'pyreon/aaa-nope': 'off', 'pyreon/bbb-nope': 'off' } })).toHaveLength(2)
  })

  it('isNear rejects distant names so suggestions stay useful', () => {
    expect(isNear('pyreon/no-window-in-ssr', 'pyreon/no-windwo-in-ssr')).toBe(true)
    expect(isNear('pyreon/no-script-url', 'pyreon/heading-order')).toBe(false)
  })
})
