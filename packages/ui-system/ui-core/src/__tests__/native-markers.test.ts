import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import CoreProvider from '../context'
import { PyreonUI } from '../PyreonUI'

describe('native-compat markers — @pyreon/ui-core', () => {
  it('PyreonUI is marked native', () => {
    expect(isNativeCompat(PyreonUI)).toBe(true)
  })
  it('CoreProvider is marked native', () => {
    expect(isNativeCompat(CoreProvider)).toBe(true)
  })
})
