import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import Container from '../Container/component'
import Row from '../Row/component'

describe('native-compat markers — @pyreon/coolgrid', () => {
  it('Container is marked native', () => {
    expect(isNativeCompat(Container)).toBe(true)
  })
  it('Row is marked native', () => {
    expect(isNativeCompat(Row)).toBe(true)
  })
})
