// Form-binding arc (v2) — useForm with validators + onSubmit, runtime
// Field bindings, per-field dict subscripts, web-parity API flow
// (production-gaps arc, 2026-06-10).
//
// Pre-arc, useForm was PARTIAL: `form.values.username` emitted illegal
// member access on a dictionary on BOTH targets, `<Field
// value={form.values.x}>` silently dropped its binding + onChangeText,
// and the source API (`setFieldValue` / `submit` / validators) didn't
// exist on the runtime ports.
//
// Bisect sites: the validators/onSubmit branches in parse.ts's useForm
// case; the form-init emit blocks; the dict-member rewrites at the top
// of both emitters' member cases; the form-binding branches in
// emitSwiftField / emitKotlinField.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const FORM_APP = `
  import { useForm } from '@pyreon/form'
  import { Stack, Field, Button, Text } from '@pyreon/primitives'
  import { Show } from '@pyreon/core'
  export function App() {
    const form = useForm({
      initialValues: { username: '' },
      validators: {
        username: (v) => (v.length < 3 ? 'At least 3 characters' : ''),
      },
      onSubmit: (values) => {
        console.log(values)
      },
    })
    return (
      <Stack>
        <Field value={form.values.username} onChangeText={(v) => form.setFieldValue('username', v)} placeholder="Username" data-testid="u" />
        <Show when={() => form.errors.username !== ''}>
          <Text>{form.errors.username}</Text>
        </Show>
        <Button onPress={() => form.submit()} disabled={form.isSubmitting}>Continue</Button>
      </Stack>
    )
  }
`

describe('form-binding — Swift', () => {
  it('init carries validators as closures + the onSubmit callback', () => {
    const out = transform(FORM_APP, { target: 'swift' }).code
    expect(out).toContain(
      'validators: ["username": { v in (v.count < 3 ? "At least 3 characters" : "") }]',
    )
    // onSubmit attaches via .onAppear, NOT the init — SwiftUI @State
    // property initializers run before `self` exists, so a callback
    // capturing instance members (navigate, store writes) can't be an
    // init argument. Found by the FIRST device build of the validated
    // login ("cannot use instance member 'navigate' within property
    // initializer").
    expect(out).toContain('.onAppear {')
    expect(out).toContain('form.onSubmit = { values in')
    expect(out).not.toContain('onSubmit: {')
    // console.log lowers to print.
    expect(out).toContain('print(values)')
  })

  it('Field binds through the runtime binding(_:) helper', () => {
    const out = transform(FORM_APP, { target: 'swift' }).code
    expect(out).toContain('TextField("Username", text: form.binding("username"))')
    // The pre-arc shape silently fell to the generic emit.
    expect(out).not.toContain('Field(value:')
  })

  it('per-field dict access subscripts with typed defaults', () => {
    const out = transform(FORM_APP, { target: 'swift' }).code
    // Pre-arc: `form.errors.username` — illegal member access on
    // [String: String].
    expect(out).toContain('(form.errors["username"] ?? "") != ""')
    expect(out).not.toContain('form.errors.username')
  })

  it('submit + isSubmitting flow through the runtime surface', () => {
    const out = transform(FORM_APP, { target: 'swift' }).code
    expect(out).toContain('form.submit()')
    expect(out).toContain('.disabled(form.isSubmitting)')
  })
})

describe('form-binding — Kotlin (mirror)', () => {
  it('init carries validators + onSubmit; Field binds value/onValueChange through setValue', () => {
    const out = transform(FORM_APP, { target: 'kotlin' }).code
    expect(out).toContain(
      '"username" to { v: String -> (if (v.length < 3) "At least 3 characters" else "") }',
    )
    expect(out).toContain('onSubmit = { values ->')
    expect(out).toContain('println(values)')
    expect(out).toContain('value = form.values.value["username"] ?: ""')
    expect(out).toContain('onValueChange = { form.setValue("username", it) }')
  })

  it('per-field dict access subscripts through .value with typed defaults', () => {
    const out = transform(FORM_APP, { target: 'kotlin' }).code
    expect(out).toContain('(form.errors.value["username"] ?: "") != ""')
  })

  it('Field carries its data-testid (was silently dropped — latent device failure)', () => {
    const out = transform(FORM_APP, { target: 'kotlin' }).code
    expect(out).toContain('modifier = Modifier.testTag("u")')
  })

  it('touched dict access defaults to false', () => {
    const out = transform(
      `
      import { useForm } from '@pyreon/form'
      import { Stack, Text } from '@pyreon/primitives'
      import { Show } from '@pyreon/core'
      export function App() {
        const form = useForm({ initialValues: { email: '' } })
        return (
          <Stack>
            <Show when={() => form.touched.email}>
              <Text>visited</Text>
            </Show>
          </Stack>
        )
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('(form.touched.value["email"] ?: false)')
  })
})

describe('form-binding — conservative bails stay loud', () => {
  it('a block-body validator is skipped with a warning (form still emits)', () => {
    const r = transform(
      `
      import { useForm } from '@pyreon/form'
      import { Stack, Text } from '@pyreon/primitives'
      export function App() {
        const form = useForm({
          initialValues: { a: '' },
          validators: { a: (v) => { return v === '' ? 'required' : '' } },
        })
        return <Stack><Text>{form.isValid ? 'ok' : 'no'}</Text></Stack>
      }
      `,
      { target: 'swift' },
    )
    expect((r.warnings ?? []).join(' ')).toContain('expression-body arrow')
    expect(r.code).toContain('PyreonForm(initialValues:')
    expect(r.code).not.toContain('validators:')
  })
})
