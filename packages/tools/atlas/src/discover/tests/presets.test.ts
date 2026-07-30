/**
 * `presets` in atlas.config.ts — shape validation.
 *
 * The validator returns a MESSAGE, not a boolean: "presets are ignored" with
 * no reason is a puzzle, not a diagnostic. Each spec asserts the message names
 * the offending field.
 */
import { describe, expect, it } from 'vitest'
import { validatePresets } from '../config'

describe('validatePresets', () => {
  it('accepts a full, valid presets object', () => {
    expect(
      validatePresets({
        viewports: [{ id: 'kiosk', label: 'Kiosk', width: 900 }, { id: 'fluid', label: 'Fluid', width: null }],
        backgrounds: [{ id: 'brand', label: 'Brand', color: '#123456' }],
        locales: [{ id: 'en', label: 'English' }, { id: 'he', label: 'עברית', dir: 'rtl' }],
        roles: [{ id: 'ops', label: 'Ops', grants: ['posts.delete'] }],
      }),
    ).toBeUndefined()
  })

  it('accepts partial presets — omitted families keep the defaults', () => {
    expect(validatePresets({ locales: [{ id: 'en', label: 'English' }] })).toBeUndefined()
  })

  it('names a non-object / non-array / empty family', () => {
    expect(validatePresets('nope')).toContain('must be an object')
    expect(validatePresets({ viewports: 'x' })).toContain('`presets.viewports` must be an array')
    // Empty is rejected rather than accepted: an empty picker is never what
    // anyone meant — omitting the family keeps the defaults.
    expect(validatePresets({ roles: [] })).toContain('must not be empty')
  })

  it('names a missing id/label, a bad viewport width, a bad locale dir', () => {
    expect(validatePresets({ backgrounds: [{ id: 'x' }] })).toContain('needs string `id` and `label`')
    expect(validatePresets({ viewports: [{ id: 'x', label: 'X' }] })).toContain('width: number | null')
    expect(validatePresets({ locales: [{ id: 'x', label: 'X', dir: 'up' }] })).toContain('invalid `dir`')
  })
})
