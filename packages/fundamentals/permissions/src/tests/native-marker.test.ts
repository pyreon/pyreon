import { isNativeCompat } from '@pyreon/core/compat'
import { describe, expect, it } from 'vitest'
import { PermissionsProvider } from '../context'

describe('native-compat marker — @pyreon/permissions', () => {
  it('PermissionsProvider is marked native', () => {
    expect(isNativeCompat(PermissionsProvider)).toBe(true)
  })
})
