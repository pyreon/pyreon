// `Pet.parse(x)` on a schema lowers to the emitted struct's own throwing `parse`, on both targets.
//
// It used to warn ("`.parse()` THROWS on invalid input, which needs a native error model PMTC does not carry yet").
// The struct always had a throwing static `parse` — it is what `safeParseResult` calls — so the missing piece was the
// error model, which `try`/`throw` lowering now supplies. A plugin declares the throw through `ExprEmitter.throwsSync`
// and the core treats the call exactly like a call to a throwing helper: `try` / `try!` on Swift, the enclosing helper
// becomes `throws`, and an uncaught position is warned on both targets.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
  validateSwiftWithStubs,
} from '../validate'

const ui = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'`

const body = `
function readPet(raw: { name: string; age: number }) {
  return Pet.parse(raw)
}
function App() {
  const out = signal('')
  const go = () => {
    try {
      const p = readPet({ name: '', age: 1 })
      out.set(p.name)
    } catch (e) {
      out.set(e.message)
    }
  }
  return (<Stack><Text>{out()}</Text><Button onPress={go}>Go</Button></Stack>)
}`

const validate = `${ui}
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string().min(1), age: s.number() })
${body}`

const zod = `${ui}
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
const Pet = zodSchema(z.object({ name: z.string().min(1), age: z.number() }))
${body}`

const uncaught = `${ui}
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string().min(1), age: s.number() })
function App() {
  const out = signal('')
  const go = () => {
    const p = Pet.parse({ name: 'x', age: 2 })
    out.set(p.name)
  }
  return (<Stack><Text>{out()}</Text><Button onPress={go}>Go</Button></Stack>)
}`

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })
const code = (src: string, target: 'swift' | 'kotlin') => emit(src, target).code
const warnings = (src: string, target: 'swift' | 'kotlin') => emit(src, target).warnings.join('\n')

describe('schema .parse(x) — lowers to the struct’s throwing parse', () => {
  for (const [name, src] of Object.entries({ validate, zod })) {
    it(`Swift (${name}): the helper becomes throws, and the caught call is \`try\``, () => {
      const swift = code(src, 'swift')
      expect(swift).toContain(
        'func readPet(_ raw: __Obj0) throws -> PyreonZodSchema_Pet { (try PyreonZodSchema_Pet.parse(pyreonSchemaInput(raw))) }',
      )
      expect(swift).toContain('(try readPet(')
    })

    it(`Kotlin (${name}): the struct's parse, typed as the struct`, () => {
      expect(code(src, 'kotlin')).toContain(
        'fun readPet(raw: __Obj0): PyreonZodSchema_Pet = PyreonZodSchema_Pet.parse(pyreonSchemaInput(raw))',
      )
    })

    it(`${name}: the handled shape no longer warns on either target`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        expect(warnings(src, target)).not.toMatch(/\.parse\(|TERMINATES/)
      }
    })
  }

  it('an uncaught parse in a handler terminates natively, and says so', () => {
    const swift = code(uncaught, 'swift')
    expect(swift).toContain('let p = (try PyreonZodSchema_Pet.parse(["name": "x", "age": 2] as [String: Any]))')
    expect(swift).toContain('Button("Go") { try! go() }')
    for (const target of ['swift', 'kotlin'] as const) {
      expect(warnings(uncaught, target)).toContain('TERMINATES the app')
    }
  })

  it('a discriminatedUnion binding still names why its .parse does not lower', () => {
    const src = `${ui}
import { s } from '@pyreon/validate'
const Shape = s.discriminatedUnion('kind', [s.object({ kind: s.literal('a'), n: s.number() })])
function App() {
  const out = signal('')
  const go = () => { try { Shape.parse({ kind: 'a', n: 1 }); out.set('ok') } catch (e) { out.set('bad') } }
  return (<Stack><Text>{out()}</Text><Button onPress={go}>Go</Button></Stack>)
}`
    expect(warnings(src, 'swift')).toContain('`.parse(x)` does not return yet')
  })
})

describe('schema .parse(x) survives the real toolchains', () => {
  for (const [name, src] of Object.entries({ validate, zod, uncaught })) {
    it.skipIf(!isSwiftcAvailable())(`Swift: ${name} type-checks against the stub`, () => {
      const r = validateSwiftWithStubs(code(src, 'swift'))
      expect(r.ok, r.error ?? '').toBe(true)
    })
    it.skipIf(!isSwiftUIAvailable())(`Swift: ${name} type-checks against the real SwiftUI SDK`, () => {
      const r = validateSwiftTypecheck(code(src, 'swift'))
      expect(r.ok, r.error ?? '').toBe(true)
    })
    it.skipIf(!isKotlincAvailable())(`Kotlin: ${name} compiles on kotlinc`, () => {
      const r = validateKotlin(code(src, 'kotlin'))
      expect(r.ok, r.error ?? '').toBe(true)
    })
  }
})
