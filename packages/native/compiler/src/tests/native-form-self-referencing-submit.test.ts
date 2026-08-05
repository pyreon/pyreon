// A form `onSubmit` that references the FORM ITSELF — the "clear the field
// after submit" idiom, the most common reason a submit handler exists:
//
//   const form = useForm({ onSubmit: () => form.setFieldValue('note', '') })
//
// This did not COMPILE on Android. The Kotlin emit passed onSubmit as a
// CONSTRUCTOR argument inside `remember { PyreonForm(onSubmit = { … form … }) }`,
// making the body a self-reference in the form's own initializer — Kotlin
// rejects it with "unresolved reference 'form'". Swift was unaffected: it
// assigns `form.onSubmit` post-init from `.onAppear` precisely to avoid this.
// So one shared source built on iOS and failed on Android, and the failure was
// a hard compile error rather than anything a runtime test could reach.
//
// The auth-rehydration arc FOUND and RECORDED this without fixing it (one bug
// per regression test). This is the fix: Kotlin mirrors Swift — a post-decl
// `form.onSubmit = { … }` assignment, and `PyreonForm.onSubmit` becomes a
// settable `var` on the runtime AND in the validate stub (a stub stricter
// than the real surface rejects correct code).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const SELF_REF = `
import { Stack, Text, Field, Button } from '@pyreon/primitives'
import { useForm } from '@pyreon/form'
export function FormPage() {
  const form = useForm({
    initialValues: { note: '' },
    onSubmit: (values) => {
      form.setFieldValue('note', '')
    },
  })
  return (
    <Stack gap={3}>
      <Field value={form.values.note} onChangeText={(v) => form.setFieldValue('note', v)} data-testid="note-field" />
      <Button onPress={() => form.submit()} data-testid="note-submit">Save</Button>
      <Text data-testid="note-echo">Note: {form.values.note}</Text>
    </Stack>
  )
}
`

describe('form onSubmit referencing the form itself', () => {
  it('Kotlin: onSubmit is assigned POST-decl, never a constructor argument', () => {
    const r = transform(SELF_REF, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val form = remember { PyreonForm(initialValues = mapOf("note" to "")) }')
    expect(r.code).toContain('form.onSubmit = { values ->')
    // The constructor route must be GONE — keeping both paths would let a
    // self-referencing handler take the one that cannot compile.
    expect(r.code).not.toContain('PyreonForm(initialValues = mapOf("note" to ""), onSubmit')
  })

  it('Swift: unchanged — still assigns form.onSubmit from .onAppear', () => {
    const r = transform(SELF_REF, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('form.onSubmit = { values in')
    expect(r.code).toContain('form.setFieldValue("note", "")')
  })

  // The load-bearing assertion: a string check cannot tell that the OLD emit
  // was uncompilable. Only kotlinc can, and it is what regressed.
  it.skipIf(!isKotlincAvailable())('Kotlin: the self-referencing emit COMPILES', () => {
    const res = validateKotlin(transform(SELF_REF, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('Swift: the self-referencing emit type-checks', () => {
    const res = validateSwiftWithStubs(transform(SELF_REF, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  // The handler-free and non-self-referencing shapes must keep working — the
  // constructor parameter still exists for them on the runtime.
  it('a form with NO onSubmit still emits a bare remembered constructor', () => {
    const src = SELF_REF.replace(/    onSubmit: \(values\) => \{[\s\S]*?\},\n/, '')
    const r = transform(src, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val form = remember { PyreonForm(initialValues = mapOf("note" to "")) }')
    expect(r.code).not.toContain('form.onSubmit =')
  })
})
