// `@pyreon/validation`'s adapters AFTER the schema is declared: several schemas in one statement, `.safeParse()` on
// a declared binding or on an inline adapter call, and the modifier chains the native struct does not enforce.
//
// Before, each of these emitted with ZERO warnings and compiled on neither target (or, for the modifiers, compiled
// and silently accepted what the web rejects):
//
//   const a = zodSchema(…), b = zodSchema(…)   → `private let a = zodSchema(z.object(…))` verbatim
//   s.safeParse({ n: 'a' })                    → a STATIC method called through the instance, with a synthesized
//                                                struct where the method takes a dictionary; `.success` on a Result
//   z.string().refine(…) / .nonempty() / …     → the modifier vanished; the device accepted any string
//
// `@pyreon/validate`'s `s` DSL already had the safeParse lowering; these pin the adapter-side counterparts, over
// the SAME `safeParse` expression and `safeParseResult` emit.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const HEAD = `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { signal } from '@pyreon/reactivity'
`

const MULTI = `${HEAD}
const a = zodSchema(z.object({ n: z.string().min(2) })), b = zodSchema(z.object({ m: z.number().min(-1) }))
export function App() {
  const msg = signal('')
  const go = () => {
    const r = a.safeParse({ n: 'abc' })
    const q = b.safeParse({ m: 2 })
    msg.set(r.success && q.success ? 'ok' : 'bad')
  }
  return <Button onPress={go}><Text>{msg()}</Text></Button>
}`

const INLINE = `${HEAD}
export function App() {
  const msg = signal('')
  const go = () => {
    msg.set(zodSchema(z.object({ n: z.string() })).safeParse({ n: 'a' }).success ? 'ok' : 'bad')
  }
  return <Button onPress={go}><Text>{msg()}</Text></Button>
}`

const warn = (src: string, target: 'swift' | 'kotlin') => transform(src, { target }).warnings.map((w) => String(w.message ?? w))

describe('several schemas in ONE declaration', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: every declarator becomes its own native struct, with no warning and no verbatim leftover`, () => {
      const { code, warnings } = transform(MULTI, { target })
      expect(warnings).toEqual([])
      expect(code).toContain('PyreonZodSchema_a')
      expect(code).toContain('PyreonZodSchema_b')
      expect(code).not.toContain('zodSchema(')
    })
  }

  it('`export const a = …, b = …` lowers too', () => {
    const src = `${HEAD}export const a = zodSchema(z.object({ n: z.string() })), b = zodSchema(z.object({ m: z.number() }))
export function App() { return <Text>x</Text> }`
    const { code, warnings } = transform(src, { target: 'swift' })
    expect(warnings).toEqual([])
    expect(code).toContain('PyreonZodSchema_a')
    expect(code).toContain('PyreonZodSchema_b')
  })

  it('a statement mixing a schema with a non-schema declarator is WARNED by name, not half-lowered', () => {
    const src = `${HEAD}const a = zodSchema(z.object({ n: z.string() })), k = 3
export function App() { return <Text>x</Text> }`
    expect(warn(src, 'swift').join('\n')).toMatch(/multi-declarator statement \(`a`, `k`\)/)
  })

  it('`.min(-1)` reads the negative bound (a unary minus is not a Literal)', () => {
    const { code } = transform(MULTI, { target: 'swift' })
    expect(code).toMatch(/< -1/)
  })
})

describe('.safeParse() on a declared schema or an inline adapter call', () => {
  it('Swift: lowers to safeParseResult over the binding’s struct, with a dictionary argument', () => {
    const { code, warnings } = transform(MULTI, { target: 'swift' })
    expect(warnings).toEqual([])
    expect(code).toContain('PyreonZodSchema_a.safeParseResult(["n": "abc"] as [String: Any])')
    expect(code).toContain('static func safeParseResult')
  })

  it('Kotlin: the same, over a Map', () => {
    const { code, warnings } = transform(MULTI, { target: 'kotlin' })
    expect(warnings).toEqual([])
    expect(code).toContain('PyreonZodSchema_a.safeParseResult(mapOf<String, Any?>("n" to "abc"))')
  })

  it('an inline `zodSchema(z.object({…})).safeParse(x)` synthesizes a struct and prints no “no native lowering” line', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code, warnings } = transform(INLINE, { target })
      expect(warnings).toEqual([])
      expect(code).toContain('PyreonZodSchema_VInline0')
      expect(code).not.toContain('zodSchema(')
    }
  })

  it('`.parse()` THROWS, so it is a NAMED warning that points at `.safeParse()` — never a verbatim emit', () => {
    const src = `${HEAD}const a = zodSchema(z.object({ n: z.string() }))
export function App() {
  const msg = signal('')
  const go = () => { msg.set(a.parse({ n: 'x' }).n) }
  return <Button onPress={go}><Text>{msg()}</Text></Button>
}`
    const w = warn(src, 'swift').join('\n')
    expect(w).toMatch(/`a\.parse\(…\)` on a @pyreon\/validation schema/)
    expect(w).toMatch(/safeParse/)
    // The inline spelling gets the same verdict.
    const inline = `${HEAD}export function App() {
  const msg = signal('')
  const go = () => { msg.set(zodSchema(z.object({ n: z.string() })).parse({ n: 'x' }).n) }
  return <Button onPress={go}><Text>{msg()}</Text></Button>
}`
    expect(warn(inline, 'kotlin').join('\n')).toMatch(/zodSchema\(…\)\.parse\(…\)/)
  })

  it('`.safeParse()` on a discriminatedUnion is a named warning (no { success, data } enum form yet)', () => {
    const src = `${HEAD}const u = zodSchema(z.discriminatedUnion('t', [z.object({ t: z.literal('a') }), z.object({ t: z.literal('b') })]))
export function App() {
  const go = () => { u.safeParse({ t: 'a' }) }
  return <Button onPress={go}><Text>x</Text></Button>
}`
    expect(warn(src, 'swift').join('\n')).toMatch(/discriminatedUnion/)
  })

  it('an unrelated `x.safeParse(…)` is left alone', () => {
    const src = `${HEAD}const a = zodSchema(z.object({ n: z.string() }))
export function App() {
  const go = (other: { safeParse(v: string): string }) => other.safeParse('x')
  return <Button onPress={() => go({ safeParse: (v) => v })}><Text>x</Text></Button>
}`
    expect(warn(src, 'swift').join('\n')).not.toMatch(/other\.safeParse/)
  })
})

describe('modifiers the native struct does not enforce are NAMED, never dropped silently', () => {
  const field = (chain: string) =>
    `${HEAD}const s = zodSchema(z.object({ n: z.string()${chain} }))
export function App() { return <Text>x</Text> }`

  for (const mod of ['refine(v => v.length > 2)', 'transform(v => v.trim())', "default('x')", 'nonempty()', 'trim()']) {
    it(`.${mod.split('(')[0]}() warns on both targets`, () => {
      const name = mod.split('(')[0]
      for (const target of ['swift', 'kotlin'] as const) {
        expect(warn(field(`.${mod}`), target).join('\n')).toMatch(new RegExp(`\`\\.${name}\\(\\)\` is NOT lowered to native`))
      }
    })
  }

  it('lowered modifiers and documentation-only ones stay quiet', () => {
    expect(warn(field(".min(2).max(9).email().describe('x')"), 'swift')).toEqual([])
  })

  it('an OBJECT-level chain names the modifier instead of calling the inline shape “not an inline literal”', () => {
    const src = `${HEAD}const s = zodSchema(z.object({ n: z.string() }).refine((v) => v.n.length > 2))
export function App() { return <Text>x</Text> }`
    expect(warn(src, 'swift').join('\n')).toMatch(/object-level `\.refine\(\)`/)
  })

  it('a non-literal bound is named, not dropped', () => {
    const src = `${HEAD}const k = 3
const s = zodSchema(z.object({ n: z.string().min(k) }))
export function App() { return <Text>x</Text> }`
    expect(warn(src, 'swift').join('\n')).toMatch(/\.min\(…\)` needs a numeric literal/)
  })

  it('a constraint on a field type that carries none is named', () => {
    const src = `${HEAD}const s = zodSchema(z.object({ a: z.array(z.string()).min(1) }))
export function App() { return <Text>x</Text> }`
    expect(warn(src, 'swift').join('\n')).toMatch(/\.min\(\) on a z\.array\(\) field is NOT enforced/)
  })

  it('an array element’s dropped modifier names the element', () => {
    const src = `${HEAD}const s = zodSchema(z.object({ a: z.array(z.string().nonempty()) }))
export function App() { return <Text>x</Text> }`
    expect(warn(src, 'swift').join('\n')).toMatch(/array element\): `\.nonempty\(\)` is NOT lowered/)
  })
})

describe('the emitted output COMPILES (zero warnings is not evidence)', () => {
  for (const [name, src] of [
    ['multi-declarator + bound safeParse', MULTI],
    ['inline safeParse', INLINE],
  ] as const) {
    it.skipIf(!isSwiftcAvailable())(
      `Swift: ${name} typechecks against the stubs`,
      () => {
        const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
        expect(r.error ?? '').toBe('')
        expect(r.ok).toBe(true)
      },
      300_000,
    )
    it.skipIf(!isKotlincAvailable())(
      `Kotlin: ${name} compiles on kotlinc`,
      () => {
        const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
        expect(r.error ?? '').toBe('')
        expect(r.ok).toBe(true)
      },
      300_000,
    )
  }
})
