import { afterEach, describe, expect, it } from 'vitest'
import { _resetKotlincCache, isKotlincAvailable, validateKotlin } from '../validate'

// The macOS real-SDK job owns only the Swift half. When its runner image started
// shipping kotlinc, every Kotlin block turned on there too and pushed the job
// past its time cap. This switch lets a Swift-only job decline Kotlin
// explicitly instead of depending on whether kotlinc happens to be on PATH.
describe('PYREON_SKIP_KOTLIN_VALIDATE', () => {
  afterEach(() => {
    delete process.env.PYREON_SKIP_KOTLIN_VALIDATE
    _resetKotlincCache()
  })

  it('reports kotlinc unavailable, so kotlinc-gated specs skip', () => {
    process.env.PYREON_SKIP_KOTLIN_VALIDATE = '1'
    expect(isKotlincAvailable()).toBe(false)
  })

  it('skips a Kotlin validation with a reason naming the switch, even uncached', () => {
    process.env.PYREON_SKIP_KOTLIN_VALIDATE = '1'
    process.env.PYREON_VALIDATE_NO_CACHE = '1'
    try {
      const r = validateKotlin('fun main() { this is not kotlin }')
      expect(r.skipped).toBe(true)
      expect(r.skipReason).toBe('PYREON_SKIP_KOTLIN_VALIDATE=1')
      expect(r.ok).toBe(true)
    } finally {
      delete process.env.PYREON_VALIDATE_NO_CACHE
    }
  })
})
