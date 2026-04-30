import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { FormProvider } from '../context'
import { Form, Submit } from '../form-component'

describe('native-compat markers — @pyreon/form', () => {
  it('FormProvider is marked native', () => {
    expect(isNativeCompat(FormProvider)).toBe(true)
  })
  it('Form is marked native', () => {
    expect(isNativeCompat(Form)).toBe(true)
  })
  it('Submit is marked native', () => {
    expect(isNativeCompat(Submit)).toBe(true)
  })
})
