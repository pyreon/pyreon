/**
 * Wiring contract for opt-in best-practice rules:
 *   - `meta.optIn` rules are FORCED OFF in recommended/strict/app/lib
 *     (no surprise noise or score/CI penalty unless explicitly chosen)
 *   - the `best-practices` preset enables every rule at meta.severity
 *   - non-opt-in rules are unaffected by the new preset
 *
 * A regression here would silently flip best-practice rules on (or off)
 * for every consumer, so it's asserted directly against `allRules`.
 */
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import type { Severity } from '../types'

const OPT_IN_IDS = allRules
  .filter((r) => r.meta.optIn === true)
  .map((r) => r.meta.id)

function sev(entry: unknown): Severity {
  return Array.isArray(entry) ? (entry[0] as Severity) : (entry as Severity)
}

describe('opt-in best-practice rule wiring', () => {
  it('the expected 14 best-practice rules are tagged optIn', () => {
    expect(new Set(OPT_IN_IDS)).toEqual(
      new Set([
        'pyreon/require-img-alt',
        'pyreon/img-requires-dimensions',
        'pyreon/no-positive-tabindex',
        'pyreon/prefer-zero-image',
        'pyreon/no-discarded-optimize-fields',
        'pyreon/no-autofocus',
        'pyreon/no-redundant-role',
        'pyreon/anchor-is-valid',
        'pyreon/query-options-as-function',
        'pyreon/rx-prefer-pipe',
        'pyreon/no-signal-in-form-initial-values',
        'pyreon/i18n-prefer-trans-for-rich-jsx',
        'pyreon/prefer-typed-search-params',
        'pyreon/no-storage-write-as-call',
      ]),
    )
  })

  for (const preset of ['recommended', 'strict', 'app', 'lib'] as const) {
    it(`forces every opt-in rule OFF in the \`${preset}\` preset`, () => {
      const cfg = getPreset(preset)
      for (const id of OPT_IN_IDS) {
        expect(sev(cfg.rules[id])).toBe('off')
      }
    })
  }

  it('the `best-practices` preset enables every opt-in rule at meta.severity', () => {
    const cfg = getPreset('best-practices')
    for (const rule of allRules) {
      if (rule.meta.optIn === true) {
        expect(sev(cfg.rules[rule.meta.id])).toBe(rule.meta.severity)
        expect(sev(cfg.rules[rule.meta.id])).not.toBe('off')
      }
    }
  })

  it('does not change non-opt-in rules vs `recommended`', () => {
    const rec = getPreset('recommended')
    const bp = getPreset('best-practices')
    for (const rule of allRules) {
      if (rule.meta.optIn !== true) {
        expect(sev(bp.rules[rule.meta.id])).toBe(sev(rec.rules[rule.meta.id]))
      }
    }
  })
})
