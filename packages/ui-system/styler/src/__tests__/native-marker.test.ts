import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { ThemeProvider } from '../ThemeProvider'

describe('native-compat marker — @pyreon/styler', () => {
  it('ThemeProvider is marked native', () => {
    expect(isNativeCompat(ThemeProvider)).toBe(true)
  })
})
