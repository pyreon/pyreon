import { isNativeCompat } from '@pyreon/core/compat'
import { describe, expect, it } from 'vitest'
import { Toaster } from '../toaster'

describe('native-compat marker — @pyreon/toast', () => {
  it('Toaster is marked native', () => {
    expect(isNativeCompat(Toaster)).toBe(true)
  })
})
