// A validator's "valid" branch returning `''` must mean VALID.
//
// It is the natural shape when the invalid branch returns a message:
//
//     username: (v) => (v.length < 3 ? 'At least 3 characters' : '')
//
// Before this fix an empty string counted as an error, which produced the worst
// possible failure: `errors()` reads `''` so the UI renders NO message,
// `validate()` returns false, and `handleSubmit` silently never calls
// `onSubmit`. A form that cannot submit and does not say why.
//
// Found from the other end — a tri-target e2e showed a login screen that
// accepted input and did nothing on submit, on web, while both native targets
// device-proved the same flow.

import { describe, expect, it } from 'vitest'
import { useForm } from '@pyreon/form'

const make = (validBranch: '' | undefined) => {
  let fired: unknown = null
  const form = useForm({
    initialValues: { username: '' },
    validators: {
      username: (v: string) => (v.length < 3 ? 'At least 3 characters' : (validBranch as string)),
    },
    onSubmit: (values) => {
      fired = values
    },
  })
  return { form, read: () => fired }
}

describe('an empty-string validator result means valid', () => {
  it('validate() passes when the validator returns an empty string', async () => {
    const { form } = make('')
    form.setFieldValue('username', 'ada')
    await expect(form.validate()).resolves.toBe(true)
  })

  it('handleSubmit() calls onSubmit', async () => {
    const { form, read } = make('')
    form.setFieldValue('username', 'ada')
    await form.handleSubmit()
    expect(read()).toEqual({ username: 'ada' })
  })

  it('isValid reflects it, so a submit button is not stuck disabled', () => {
    // The incremental `_invalidCount` is a separate path from `validate()`;
    // fixing one and not the other would leave the button dead while the form
    // submitted fine, or the reverse.
    const { form } = make('')
    form.setFieldValue('username', 'ada')
    expect(form.isValid()).toBe(true)
  })

  it('undefined still means valid — the fix is additive', async () => {
    const { form, read } = make(undefined)
    form.setFieldValue('username', 'ada')
    await form.handleSubmit()
    expect(read()).toEqual({ username: 'ada' })
  })

  it('a REAL message still blocks submit', async () => {
    // The half that proves the fix did not simply disable validation.
    const { form, read } = make('')
    form.setFieldValue('username', 'ad')
    await expect(form.validate()).resolves.toBe(false)
    await form.handleSubmit()
    expect(read()).toBeNull()
    expect(form.errors().username).toBe('At least 3 characters')
  })
})
