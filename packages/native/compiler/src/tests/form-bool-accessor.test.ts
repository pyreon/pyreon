// `form.isValid()` is a FUNCTION on the web and a Bool PROPERTY on native.
//
// `@pyreon/form`'s web API exposes `isValid` / `isSubmitting` as accessors, so
// the documented spelling is `form.isValid()`. The native `PyreonForm` exposes
// both as stored Bool properties, and the emit passed the call through
// verbatim — so the web-correct line failed with `cannot call value of
// non-function type 'Bool'` on swiftc and `expression 'isValid' of type
// 'Boolean' cannot be invoked as a function` on kotlinc.
//
// Same inversion `useOnline()` -> `.isOnline` and `useAppState()` -> `.phase`
// already carry. Found by putting a schema-validated form in the tri-target
// example app rather than a snippet — nothing in the app read `isValid()`
// before, so the divergence had never been emitted.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `import { useForm } from '@pyreon/form'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const form = useForm({ initialValues: { name: '' }, onSubmit: () => {} })
  return (<Stack><Text>{String(form.isValid())}</Text><Text>{String(form.isSubmitting())}</Text></Stack>)
}`

describe('form Bool accessors lower to property reads', () => {
  it('drops the call parens on Swift', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).toContain('form.isValid')
    expect(code).not.toContain('form.isValid()')
    expect(code).not.toContain('form.isSubmitting()')
  })

  it('drops the call parens on Kotlin', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code).toContain('form.isValid')
    expect(code).not.toContain('form.isValid()')
  })

  // The load-bearing pair: an emit assertion cannot tell a property read from a
  // call on a Bool — only the compiler can, and that is exactly what broke.
  it.skipIf(!isSwiftcAvailable())('the emitted Swift typechecks', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error).toBe(true)
  })
})
