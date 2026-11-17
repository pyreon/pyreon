// FRM-3: `useWatch`, `useFormState` and `form.resetField` on the native form.
//
// Before: `useWatch` / `useFormState` were reproduced verbatim (named by the
// unlowered-hook warning), and `form.resetField('email')` flowed through to a
// runtime with no such method — no warning, no compile. Now `useWatch(form, 'x')`
// is a computed over the same read `form.values.x` lowers to, `useFormState`'s
// selector reads become the form's own `isValid` / `isSubmitting` / `isDirty`,
// and `resetField` (with its `keepError` / `keepTouched` options) is a runtime
// method on both targets.

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const SRC = `import { useForm, useFormState, useWatch } from '@pyreon/form'
import { Button, Field, Stack, Text } from '@pyreon/primitives'
export function F() {
  const form = useForm({
    initialValues: { email: '' },
    validators: { email: (v) => (v.length < 3 ? 'too short' : '') },
    onSubmit: () => {},
  })
  const email = useWatch(form, 'email')
  const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting && s.isDirty)
  return (
    <Stack>
      <Field value={form.values.email} />
      <Text>Watch: {email()}</Text>
      <Text>Can: {canSubmit() ? 'yes' : 'no'}</Text>
      <Button onPress={() => form.resetField('email')}>Reset</Button>
      <Button onPress={() => form.resetField('email', { keepError: true, keepTouched: false })}>Keep</Button>
    </Stack>
  )
}`

describe('useWatch / useFormState / resetField on native', () => {
  it('Swift: computed properties over the form, and resetField with labelled options', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('private var email: String { (form.values["email"] ?? "") }')
    expect(out.code).toContain('private var canSubmit: Bool { form.isValid && !form.isSubmitting && form.isDirty }')
    expect(out.code).toContain('form.resetField("email")')
    expect(out.code).toContain('form.resetField("email", keepError: true, keepTouched: false)')
  })

  it('Kotlin: derived state over the form, and resetField with named options', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('val email by remember { derivedStateOf { (form.values.value["email"] ?: "") } }')
    expect(out.code).toContain(
      'val canSubmit by remember { derivedStateOf { form.isValid && !form.isSubmitting.value && form.isDirty } }',
    )
    expect(out.code).toContain('form.resetField("email", keepError = true, keepTouched = false)')
  })

  it('the overloads with no native shape are refused by name, never emitted verbatim', () => {
    const refused = `import { useForm, useFormState, useWatch } from '@pyreon/form'
import { Text } from '@pyreon/primitives'
export function G() {
  const form = useForm({ initialValues: { a: '', b: '' } })
  const both = useWatch(form, ['a', 'b'])
  const summary = useFormState(form)
  const touched = useFormState(form, (s) => s.touchedFields.a)
  return <Text>x</Text>
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(refused, { target })
      const w = out.warnings.join('\n')
      expect(w).toContain('useWatch `both`')
      expect(w).toContain('useFormState `summary`')
      expect(w).toContain('the selector reads `touchedFields`')
      expect(out.code).not.toContain('useWatch(')
      expect(out.code).not.toContain('useFormState(')
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })
})
