import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import UnistyleProvider from '../context'

describe('native-compat marker — @pyreon/unistyle', () => {
  it('Provider is marked native', () => {
    expect(isNativeCompat(UnistyleProvider)).toBe(true)
  })
})
