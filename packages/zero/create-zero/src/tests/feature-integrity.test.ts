/**
 * Feature-data integrity — the root-cause guard for the 0.33.0 custom-features
 * crash (`TypeError: Cannot read properties of undefined (reading 'label')`).
 *
 * That crash happened because `FEATURE_CATEGORIES` (and the `full` preset)
 * referenced `state-tree` / `coolgrid`, which were never defined in `FEATURES`.
 * The interactive "Custom — pick features one by one" picker then mapped a
 * category key to `FEATURES[key].label` and dereferenced `undefined`.
 *
 * These invariants make ANY such drift fail loudly at test time: every feature
 * key referenced anywhere MUST be defined in `FEATURES`, and the picker's
 * grouped-option builder MUST produce a defined label for every option.
 */
import { describe, expect, it } from 'vitest'
import {
  FEATURE_CATEGORIES,
  FEATURES,
  PRESETS,
  TEMPLATES,
} from '../templates'
import { buildGroupedFeatureOptions } from '../prompts'

const FEATURE_KEYS = new Set(Object.keys(FEATURES))

describe('feature-data integrity — no key drift', () => {
  it('every key in FEATURE_CATEGORIES is defined in FEATURES', () => {
    const missing: string[] = []
    for (const [catId, cat] of Object.entries(FEATURE_CATEGORIES)) {
      for (const key of cat.features) {
        if (!FEATURE_KEYS.has(key)) missing.push(`${catId} → "${key}"`)
      }
    }
    expect(missing, `category keys missing from FEATURES: ${missing.join(', ')}`).toEqual([])
  })

  it('every key in every PRESET is defined in FEATURES', () => {
    const missing: string[] = []
    for (const [presetId, preset] of Object.entries(PRESETS)) {
      for (const key of preset.features) {
        if (!FEATURE_KEYS.has(key)) missing.push(`preset ${presetId} → "${key}"`)
      }
    }
    expect(missing, `preset keys missing from FEATURES: ${missing.join(', ')}`).toEqual([])
  })

  it('every template defaultFeatures key is defined in FEATURES', () => {
    const missing: string[] = []
    for (const [tmplId, tmpl] of Object.entries(TEMPLATES)) {
      for (const key of tmpl.defaultFeatures) {
        if (!FEATURE_KEYS.has(key)) missing.push(`template ${tmplId} → "${key}"`)
      }
    }
    expect(missing, `template default keys missing from FEATURES: ${missing.join(', ')}`).toEqual([])
  })

  it('every FEATURES entry is reachable in at least one category (shown in the picker)', () => {
    const categorised = new Set<string>()
    for (const cat of Object.values(FEATURE_CATEGORIES)) {
      for (const key of cat.features) categorised.add(key)
    }
    const orphans = [...FEATURE_KEYS].filter((k) => !categorised.has(k))
    expect(orphans, `FEATURES not in any category (unreachable in picker): ${orphans.join(', ')}`).toEqual([])
  })

  it('every FEATURES entry has a label + at least one dependency', () => {
    for (const [key, def] of Object.entries(FEATURES)) {
      expect(def.label, `feature "${key}" label`).toBeTruthy()
      expect(Array.isArray(def.deps) && def.deps.length > 0, `feature "${key}" deps`).toBe(true)
      for (const dep of def.deps) {
        expect(typeof dep === 'string' && dep.length > 0, `feature "${key}" dep "${dep}"`).toBe(true)
      }
    }
  })
})

describe('buildGroupedFeatureOptions — the interactive picker source', () => {
  it('builds grouped options with a defined label for every feature (no drift crash)', () => {
    const grouped = buildGroupedFeatureOptions()
    expect(Object.keys(grouped).length).toBe(Object.keys(FEATURE_CATEGORIES).length)
    let optionCount = 0
    for (const options of Object.values(grouped)) {
      for (const opt of options) {
        optionCount++
        expect(opt.value, 'option value').toBeTruthy()
        expect(opt.label, `option "${opt.value}" label`).toBeTruthy()
        expect(FEATURE_KEYS.has(opt.value), `option "${opt.value}" is a real feature`).toBe(true)
      }
    }
    // Every categorised feature surfaces exactly once as a pickable option.
    expect(optionCount).toBe(
      Object.values(FEATURE_CATEGORIES).reduce((n, c) => n + c.features.length, 0),
    )
  })

  it('the new state-tree + coolgrid features (the 0.33.0 crash keys) are present + pickable', () => {
    expect(FEATURES['state-tree']?.label).toBeTruthy()
    expect(FEATURES.coolgrid?.label).toBeTruthy()
    const allOptions = Object.values(buildGroupedFeatureOptions()).flat()
    expect(allOptions.some((o) => o.value === 'state-tree')).toBe(true)
    expect(allOptions.some((o) => o.value === 'coolgrid')).toBe(true)
  })
})
