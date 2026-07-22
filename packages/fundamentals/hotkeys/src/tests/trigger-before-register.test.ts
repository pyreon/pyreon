/**
 * Isolated file (fresh worker): trigger() before ANY registration on window
 * — the no-target-state early return. Kept separate because every other
 * suite registers hotkeys first, making the state permanently present in
 * their workers.
 */
import { describe, expect, it } from 'vitest'
import { trigger } from '../index'

describe('trigger before any registration', () => {
  it('returns 0 when no hotkey state exists for window', () => {
    expect(trigger('ctrl+never-registered')).toBe(0)
  })
})
