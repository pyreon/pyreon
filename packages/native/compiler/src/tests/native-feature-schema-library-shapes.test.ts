// `Todo.schema` IS the schema the author passed to `defineFeature`, so `Todo.schema.<method>(x)` must lower to THAT
// library's web result — never a shape borrowed from another library.
//
// The recognizer used to treat every `<ns>.object({ … })` validator as zod: an `s.object` (`@pyreon/validate`) feature
// schema's `.safeParse` lowered to zod's `{ success, data }` (the web returns `{ ok, value | issues }`), and a valibot
// `v.object` schema's `.safeParse` lowered to a method that does not exist on the web at all.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const src = (imp: string, ns: string, call: string) => `
import { defineFeature } from '@pyreon/feature'
import { signal } from '@pyreon/reactivity'
${imp}

export const Todo = defineFeature({
  name: 'todo',
  schema: ${ns}.object({ title: ${ns}.string(), done: ${ns}.boolean() }),
})

export function Form() {
  const ok = signal(false)
  const check = () => { ok.set(${call}) }
  return (<Button onPress={check}><Text>go</Text></Button>)
}
`

const VALIDATE_SAFE = src(`import { s } from '@pyreon/validate'`, 's', `Todo.schema.safeParse({ title: 'a', done: true }).ok`)
const VALIDATE_PARSE = src(`import { s } from '@pyreon/validate'`, 's', `Todo.schema.parse({ title: 'a', done: true }).ok`)
const VALIBOT = src(`import * as v from 'valibot'`, 'v', `Todo.schema.safeParse({ title: 'a', done: true }).success`)

describe('a feature schema lowers to its own library’s result', () => {
  for (const [name, code] of [['safeParse', VALIDATE_SAFE], ['parse', VALIDATE_PARSE]] as const) {
    it(`@pyreon/validate \`.${name}\`: { ok, value | issues }, never zod's { success, data }, on both targets`, () => {
      const swift = transform(code, { target: 'swift' })
      const kotlin = transform(code, { target: 'kotlin' })
      expect(swift.warnings).toEqual([])
      expect(kotlin.warnings).toEqual([])
      expect(swift.code).toContain('pyreonValidateResult { try PyreonZodSchema_Todo_schema.parse(')
      expect(kotlin.code).toContain('pyreonValidateResult { PyreonZodSchema_Todo_schema.parse(')
      expect(swift.code).not.toContain('safeParseResult')
    })
    it.skipIf(!isSwiftcAvailable())(`@pyreon/validate \`.${name}\`: Swift typechecks`, () => {
      const r = validateSwiftWithStubs(transform(code, { target: 'swift' }).code)
      expect(r.ok, r.error).toBe(true)
    })
    it.skipIf(!isKotlincAvailable())(`@pyreon/validate \`.${name}\`: Kotlin compiles`, () => {
      const r = validateKotlin(transform(code, { target: 'kotlin' }).code)
      expect(r.ok, r.error).toBe(true)
    }, 300_000)
  }

  it('valibot: the schema has no `.safeParse` method on the web, so the call is reported, not emitted', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(VALIBOT, { target })
      expect(r.warnings.join('\n')).toMatch(/valibot schema has no `\.safeParse` \/ `\.parse` METHOD/)
      expect(r.code).not.toContain('safeParseResult')
    }
  })
})
