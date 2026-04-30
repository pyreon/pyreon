import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import Overlay from '../Overlay/component'
import OverlayContextProvider from '../Overlay/context'

describe('native-compat markers — @pyreon/elements', () => {
  it('Overlay is marked native', () => {
    expect(isNativeCompat(Overlay)).toBe(true)
  })
  it('Overlay context Provider is marked native', () => {
    expect(isNativeCompat(OverlayContextProvider)).toBe(true)
  })
})
