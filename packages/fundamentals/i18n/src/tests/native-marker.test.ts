import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../context'

describe('native-compat marker — @pyreon/i18n', () => {
  it('I18nProvider is marked native', () => {
    expect(isNativeCompat(I18nProvider)).toBe(true)
  })
})
