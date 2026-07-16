import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'
import { disabledState, focusRing, focusRingTone } from '../bases/fragments'

/**
 * The fragments are now the single source of the library's focus + disabled
 * treatment (previously hand-written at 30 and 21 sites). These assertions lock
 * their emitted shape — a change here changes every component at once, which is
 * the point, but it should never happen by accident.
 */
describe('theme fragments', () => {
  describe('focusRing', () => {
    it('defaults to the primary 3px ring and REPLACES the UA outline', () => {
      expect(focusRing(theme)).toEqual({
        boxShadow: `0 0 0 3px ${theme.color.system.primary[200]}`,
        outline: 'none',
      })
    })

    it('accepts a tone for a full ring in error/success', () => {
      expect(focusRing(theme, 'error')).toEqual({
        boxShadow: `0 0 0 3px ${theme.color.system.error[200]}`,
        outline: 'none',
      })
      expect(focusRing(theme, 'success').boxShadow).toBe(
        `0 0 0 3px ${theme.color.system.success[200]}`,
      )
    })
  })

  describe('focusRingTone', () => {
    it('emits ONLY the ring colour', () => {
      expect(focusRingTone(theme, 'error')).toEqual({
        boxShadow: `0 0 0 3px ${theme.color.system.error[200]}`,
      })
    })

    // Load-bearing: `.states()` overrides ride on a base focus that already set
    // `outline: 'none'`. Re-declaring outline here would change the emitted CSS
    // at the 7 error/success sites — the whole reason this fragment is separate
    // from focusRing.
    it('does NOT re-declare outline (state overrides are a pure colour swap)', () => {
      expect('outline' in focusRingTone(theme, 'error')).toBe(false)
    })
  })

  describe('disabledState', () => {
    it('is the standard disabled treatment', () => {
      expect(disabledState()).toEqual({ opacity: 0.5, cursor: 'not-allowed' })
    })

    it('composes with extras via spread', () => {
      expect({ ...disabledState(), pointerEvents: 'none' }).toEqual({
        opacity: 0.5,
        cursor: 'not-allowed',
        pointerEvents: 'none',
      })
    })
  })
})
