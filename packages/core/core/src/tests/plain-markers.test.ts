/**
 * The Plain Mode markers are COMPILE-TIME only — their runtime bodies exist
 * to fail LOUDLY when the compiler did not run (a missing vite plugin, a
 * bare tsc build). Silent degradation would render a non-reactive page that
 * looks right on first paint; these specs lock the loud path.
 */
import { describe, expect, it } from 'vitest'
import { derived, effect, state } from '../plain'

describe('@pyreon/core/plain markers throw with guidance when uncompiled', () => {
  it.each([
    ['state', () => state(0)],
    ['derived', () => derived(1)],
    ['effect', () => effect(() => {})],
    ['state.raw', () => state.raw({ a: 1 })],
  ])('%s() names itself, the missing plugin, and the fix', (name, call) => {
    const escaped = name.replace('.', '\\.')
    expect(call).toThrowError(
      new RegExp(`\\[Pyreon\\] ${escaped}\\(\\) from '@pyreon/core/plain' reached the runtime`),
    )
    expect(call).toThrowError(/pyreon\(\) plugin from '@pyreon\/vite-plugin'/)
  })
})
