// `useForm({ schema })` wires the schema into the native form.
//
// The schema DECLARATION always lowered — `zodSchema(z.object({…}))` emits a
// struct / data class whose `parse()` enforces every captured constraint. What
// never happened is connecting it to a form: `useForm({ schema })` dropped the
// option SILENTLY, so `isValid` was true on native for input the web rejects,
// with no warning to trace it by.
//
// Found by the iOS device gate on the tri-target example app — the first thing
// anywhere to run a schema-validated form on a device. Compile-only checks
// cannot see it: the emit without validators is perfectly valid code.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `import { z } from 'zod'
import { zodSchema } from '@pyreon/validation'
import { useForm } from '@pyreon/form'
import { Stack, Text, Field, Button } from '@pyreon/primitives'
const S = zodSchema(z.object({ name: z.string().min(3) }))
export function C() {
  const f = useForm({ initialValues: { name: '' }, schema: S, onSubmit: () => {} })
  return (<Stack><Field value={f.values().name} onChangeText={(v) => f.setFieldValue('name', v)} /><Button onPress={() => f.handleSubmit()}>go</Button><Text>{String(f.isValid())}</Text></Stack>)
}`

// An explicit per-field validator is MORE specific than the schema, so it must
// win — otherwise adding a schema would silently override hand-written rules.
const SRC_EXPLICIT_WINS = SRC.replace(
  "initialValues: { name: '' }, schema: S",
  "initialValues: { name: '' }, schema: S, validators: { name: (v) => (v.length < 9 ? 'nine' : '') }",
)

// A schema that is not declared in this file cannot be resolved, and silently
// producing no validators is the bug this whole change is about.
const SRC_UNKNOWN = SRC.replace('schema: S', 'schema: Elsewhere')

describe('useForm({ schema }) synthesizes native validators', () => {
  it('delegates each string field to the schema validateField (Swift)', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).toContain('static func validateField(')
    expect(code).toContain('PyreonZodSchema_S.validateField("name", v)')
  })

  it('delegates each string field to the schema validateField (Kotlin)', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code).toContain('fun validateField(')
    expect(code).toContain('PyreonZodSchema_S.validateField("name", v)')
  })

  it('lets an EXPLICIT validator win over the schema for the same field', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code } = transform(SRC_EXPLICIT_WINS, { target })
      expect(code, target).not.toContain('validateField("name"')
      expect(code, target).toContain('nine')
    }
  })

  it('WARNS by name when the schema is not declared in this file', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { warnings } = transform(SRC_UNKNOWN, { target })
      expect(warnings?.join('\n'), target).toContain('useForm({ schema: Elsewhere })')
      expect(warnings?.join('\n'), target).toContain('NO native validators')
    }
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift typechecks', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error).toBe(true)
  })
})
