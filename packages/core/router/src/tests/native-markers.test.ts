import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { RouterLink, RouterProvider, RouterView } from '../components'

// Marker-presence assertion (PR 3 lock-in). Bisect-verified: removing
// any of the `nativeCompat(...)` calls in components.tsx fails the
// corresponding test.
describe('native-compat markers — @pyreon/router', () => {
  it('RouterProvider is marked native', () => {
    expect(isNativeCompat(RouterProvider)).toBe(true)
  })
  it('RouterView is marked native', () => {
    expect(isNativeCompat(RouterView)).toBe(true)
  })
  it('RouterLink is marked native', () => {
    expect(isNativeCompat(RouterLink)).toBe(true)
  })
})
