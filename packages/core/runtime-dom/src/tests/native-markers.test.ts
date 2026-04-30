import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { KeepAlive } from '../keep-alive'
import { Transition } from '../transition'
import { TransitionGroup } from '../transition-group'

// Marker-presence assertion (PR 3 lock-in). Bisect-verified: removing
// `nativeCompat(...)` from any of these files fails the corresponding test.
describe('native-compat markers — @pyreon/runtime-dom', () => {
  it('Transition is marked native', () => {
    expect(isNativeCompat(Transition)).toBe(true)
  })
  it('TransitionGroup is marked native', () => {
    expect(isNativeCompat(TransitionGroup)).toBe(true)
  })
  it('KeepAlive is marked native', () => {
    expect(isNativeCompat(KeepAlive)).toBe(true)
  })
})
