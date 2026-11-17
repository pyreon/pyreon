// @ts-nocheck — PMTC handles typing; see RouterApp.tsx.
//
// Forms row (FRM-3): the form surface beyond register/submit, on a device.
//
// - `useWatch(form, 'email')` — a computed over one field: `Watch` follows the
//   input as it is typed.
// - `useFormState(form, (s) => s.isValid && s.isDirty)` — a computed over the
//   form-level flags: `Can submit` is `no` on the untouched form, `yes` once
//   the field is dirty and valid, `no` after a failed submit set an error.
// - `form.resetField('email')` — restores the initial value and clears the
//   field's error, so the form is clean again (`Can submit: no`, no error).
import { useForm, useFormState, useWatch } from '@pyreon/form'
import { Button, Field, Stack, Text } from '@pyreon/primitives'
import { useNavigate } from '@pyreon/router'

export function FormStatePage() {
  const navigate = useNavigate()
  const form = useForm({
    initialValues: { email: '' },
    validators: { email: (v) => (v.length < 3 ? 'too short' : '') },
    onSubmit: () => {},
  })
  const email = useWatch(form, 'email')
  const canSubmit = useFormState(form, (s) => s.isValid && s.isDirty)
  return (
    <Stack gap={2} padding={4} data-testid="form-state-page">
      <Field value={form.values.email} placeholder="Email" data-testid="fs-email" />
      <Text data-testid="fs-watch">Watch: {email()}</Text>
      <Text data-testid="fs-can">Can submit: {canSubmit() ? 'yes' : 'no'}</Text>
      <Text data-testid="fs-error">Error: {form.errors().email}</Text>
      <Button onPress={() => form.handleSubmit()} data-testid="fs-submit">Submit</Button>
      <Button onPress={() => form.resetField('email')} data-testid="fs-reset">Reset field</Button>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}
