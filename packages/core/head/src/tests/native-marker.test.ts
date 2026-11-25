import { isNativeCompat } from '@pyreon/core/compat'
import { describe, expect, it } from 'vitest'
import { HeadProvider } from '../provider'

describe('native-compat marker — @pyreon/head', () => {
  it('HeadProvider is marked native', () => {
    expect(isNativeCompat(HeadProvider)).toBe(true)
  })
})
