import { describe, expect, it } from 'vitest'
import { isNativeCompat } from '../compat-marker'
import { ErrorBoundary } from '../error-boundary'

// Marker-presence assertion (PR 3 lock-in). Bisect-verified: removing the
// `nativeCompat(ErrorBoundary)` call fails this test with
// `expected false to be true`.
describe('native-compat marker — @pyreon/core', () => {
  it('ErrorBoundary is marked native', () => {
    expect(isNativeCompat(ErrorBoundary)).toBe(true)
  })
})
