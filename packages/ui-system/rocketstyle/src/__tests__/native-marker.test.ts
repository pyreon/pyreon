import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import RocketstyleProvider from '../context/context'

describe('native-compat marker — @pyreon/rocketstyle', () => {
  it('Provider is marked native', () => {
    expect(isNativeCompat(RocketstyleProvider)).toBe(true)
  })
})
