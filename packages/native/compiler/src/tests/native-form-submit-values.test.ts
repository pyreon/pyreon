// `onSubmit: (values) => … values.field …` — reading a field off the form's
// submit payload, the shape any real login/checkout screen needs.
//
// Real-build-found (the auth-rehydration arc, on BOTH toolchains at once):
// `PyreonForm`'s onSubmit hands the callback a string-keyed dictionary
// (`[String: String]` / `Map<String, String>`), but the emit passed the TS
// member read through verbatim — `values.username` — which is
//   swiftc: "value of type '[String : String]' has no member 'username'"
//   kotlinc: "Unresolved reference 'username'"
// so the natural shape compiled on NEITHER target.
//
// The rewrite already existed one call site over: `form.values().username`
// lowers to the subscript. The submit PARAM is the same dictionary arriving
// as a closure parameter instead of a container property.
//
// Why it hid: every gated app named the parameter `_values` and never read a
// field off it. An unused parameter is an unexercised contract — the same
// class as the repo's "an unused import/variable is a SYMPTOM" rule, seen
// from the producer side.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

// NOTE the submit body writes to a SIGNAL, not back into the form
// (`form.setFieldValue(...)` inside its own onSubmit). That sibling shape is a
// SEPARATE, still-open gap on Kotlin only: the emit passes onSubmit as a
// constructor argument, so referencing `form` inside it is a self-reference in
// its own initializer ("unresolved reference 'form'"). Swift is unaffected —
// it assigns `form.onSubmit` post-init from `.onAppear` precisely to avoid
// that. Recorded in the multiplatform matrix's Forms row rather than fixed
// here, so this file locks ONE bug and its bisect stays unambiguous.
const SRC = `import { signal } from '@pyreon/reactivity'
import { useForm } from '@pyreon/form'
import { Button, Stack, Text } from '@pyreon/primitives'

export function App() {
  const lastUser = signal<string>('')
  const form = useForm({
    initialValues: { username: '', city: '' },
    validators: { username: (v) => (v.length < 3 ? 'too short' : '') },
    onSubmit: (values) => {
      lastUser.set(values.username)
    },
  })
  return (
    <Stack>
      <Text>{form.values().username}</Text>
      <Button onPress={() => form.submit()}>Go</Button>
    </Stack>
  )
}`

describe('onSubmit values param — field reads lower to the dictionary lookup', () => {
  it('Swift: `values.username` becomes a subscript with the String default', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.code).toContain('(values["username"] ?? "")')
    // The broken emit — a member access on a Swift dictionary.
    expect(out.code).not.toContain('values.username')
    expect(out.warnings).toEqual([])
  })

  it('Kotlin: `values.username` becomes a map lookup with the String default', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.code).toContain('(values["username"] ?: "")')
    expect(out.code).not.toContain('values.username')
    expect(out.warnings).toEqual([])
  })

  it('the rewrite is SCOPED to the submit param — an unrelated member read is untouched', () => {
    // A same-named local outside any onSubmit body must keep its member
    // access: the rewrite keys on the param being in scope, not on the name.
    const other = `import { Stack, Text } from '@pyreon/primitives'
type Row = { username: string }
export function App() {
  const values: Row = { username: 'x' }
  return <Stack><Text>{values.username}</Text></Stack>
}`
    const out = transform(other, { target: 'swift' })
    expect(out.code).toContain('values.username')
    expect(out.code).not.toContain('values["username"]')
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift typechecks (real swiftc)', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles (real kotlinc)', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
