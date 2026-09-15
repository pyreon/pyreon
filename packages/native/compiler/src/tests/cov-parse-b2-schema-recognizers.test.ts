// Branch coverage — `src/parse.ts` schema recognizers (arktype / zod /
// valibot / `@pyreon/validate`), the shared namespaced walker, the
// discriminated-union parser and the array/nested-object element paths.
//
// Every spec pairs the source shape that TAKES the arm with the emitted
// consequence it must produce: a synthesized struct/data class, a warning
// by its text, or a silent bail (no struct at all).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const AK = `import { arktypeSchema } from '@pyreon/validation'
declare const type: any
`
const Z = `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
`
const VB = `import { valibotSchema } from '@pyreon/validation'
import * as v from 'valibot'
declare const safeParse: <T>(s: unknown, i: unknown) => T
`

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })
/** Every `PyreonZodSchema_*` struct/data class/enum name the emit produced. */
const schemaNames = (code: string): string[] =>
  [...code.matchAll(/(?:struct|data class|enum) (PyreonZodSchema_\w*)/g)].map((m) => m[1]!)

describe('parse.ts — arktypeSchema recognizer', () => {
  it('lowers a three-scalar type() shape to a struct (the positive control)', () => {
    const r = swift(AK + `export const userSchema = arktypeSchema(type({ name: 'string', age: 'number', active: 'boolean' }))`)
    expect(r.code).toContain('struct PyreonZodSchema_userSchema: Codable {')
    expect(r.code).toContain('var name: String = ""')
    expect(r.code).toContain('var age: Int = 0')
    expect(r.code).toContain('var active: Bool = false')
    expect(r.warnings).toEqual([])
  })

  it('bails on a MULTI-declarator statement — one binding per schema only', () => {
    const one = swift(AK + `const a = arktypeSchema(type({ n: 'string' }))`)
    expect(schemaNames(one.code)).toEqual(['PyreonZodSchema_a'])
    const two = swift(
      AK + `const a = arktypeSchema(type({ n: 'string' })), b = arktypeSchema(type({ m: 'string' }))`,
    )
    expect(schemaNames(two.code)).toEqual([])
  })

  it('bails when the declarator id is a destructuring pattern, not an Identifier', () => {
    const r = swift(AK + `const { a } = arktypeSchema(type({ n: 'string' }))`)
    expect(schemaNames(r.code)).toEqual([])
  })

  it('bails when the inner callee is a MemberExpression rather than a bare `type`', () => {
    const r = swift(AK + `declare const ns: any\nconst a = arktypeSchema(ns.type({ n: 'string' }))`)
    expect(schemaNames(r.code)).toEqual([])
    // Falls through to the generic "not an inline literal" advisory.
    expect(r.warnings.join('\n')).toContain('is not an inline literal')
  })

  it('bails when the inner callee is an identifier OTHER than `type`', () => {
    const r = swift(AK + `declare const other: any\nconst a = arktypeSchema(other({ n: 'string' }))`)
    expect(schemaNames(r.code)).toEqual([])
  })

  it('warns when type()`s argument is not an object literal', () => {
    const r = swift(AK + `const a = arktypeSchema(type('string'))`)
    expect(r.warnings.join('\n')).toContain(
      'arktypeSchema declaration `a`: type() argument must be a literal shape',
    )
    expect(schemaNames(r.code)).toEqual([])
  })

  it('skips a SpreadElement property and keeps the literal siblings', () => {
    const r = swift(AK + `declare const base: any\nconst a = arktypeSchema(type({ ...base, n: 'string' }))`)
    expect(r.code).toContain('var n: String = ""')
    expect(r.code.match(/var \w+: /g)).toEqual(['var n: '])
  })

  it('accepts a STRING-literal key as a field name', () => {
    const r = swift(AK + `const a = arktypeSchema(type({ 'plain': 'string' }))`)
    expect(r.code).toContain('var plain: String = ""')
  })

  it('skips a key that is neither Identifier nor Literal (a template-literal key)', () => {
    const r = swift(AK + 'declare const b: string\nconst a = arktypeSchema(type({ [`x${b}`]: \'string\', n: \'string\' }))')
    expect(r.code.match(/var \w+: /g)).toEqual(['var n: '])
    expect(r.warnings).toEqual([])
  })

  it('warns + drops a field whose value is not a string literal', () => {
    const r = swift(AK + `declare const q: any\nconst a = arktypeSchema(type({ n: q.string(), m: 'string' }))`)
    expect(r.warnings.join('\n')).toContain(
      "field `n` is not a string-literal type — v1 supports 'string' | 'number' | 'boolean' literals",
    )
    expect(r.code.match(/var \w+: /g)).toEqual(['var m: '])
  })

  it('warns + drops a string literal naming an unsupported type', () => {
    const r = swift(AK + `const a = arktypeSchema(type({ n: 'bigint', m: 'string' }))`)
    expect(r.warnings.join('\n')).toContain("field `n` has unsupported type 'bigint'")
    expect(r.code.match(/var \w+: /g)).toEqual(['var m: '])
  })

  it('bails with a "no recognized fields" warning when EVERY field dropped', () => {
    const r = swift(AK + `const a = arktypeSchema(type({ n: 'bigint' }))`)
    expect(r.warnings.join('\n')).toContain('arktypeSchema declaration `a`: no recognized fields')
    expect(schemaNames(r.code)).toEqual([])
  })

  it.fails(
    'KNOWN BUG: a non-identifier field name emits invalid Swift — sanitize the key in the arktype/namespaced walkers (parse.ts:4146 / :4570) or reject it with a warning',
    () => {
      const r = swift(AK + `const a = arktypeSchema(type({ 'first-name': 'string' }))`)
      // Today: `var first-name: String = ""` — not a legal Swift identifier.
      expect(r.code).not.toMatch(/var [A-Za-z_]\w*-/)
    },
  )
})

describe('parse.ts — namespaced (zod/valibot) walker: declaration shape', () => {
  it('bails on a MULTI-declarator statement', () => {
    const r = swift(Z + `const a = zodSchema(z.object({n:z.string()})), b = zodSchema(z.object({m:z.string()}))`)
    expect(schemaNames(r.code)).toEqual([])
  })

  it('bails when the declarator id is a destructuring pattern', () => {
    const r = swift(Z + `const { a } = zodSchema(z.object({n:z.string()}))`)
    expect(schemaNames(r.code)).toEqual([])
  })

  it('bails when the wrapped argument callee is not a MemberExpression', () => {
    const r = swift(Z + `declare const foo: any\nconst a = zodSchema(foo())`)
    expect(schemaNames(r.code)).toEqual([])
    expect(r.warnings.join('\n')).toContain('is not an inline literal')
  })

  it('bails when the member object is not a bare Identifier', () => {
    const r = swift(Z + `declare const q: any\nconst a = zodSchema(q.x.object({n:z.string()}))`)
    expect(schemaNames(r.code)).toEqual([])
  })

  it('bails when the namespace identifier is not the expected prefix', () => {
    const r = swift(Z + `declare const w: any\nconst a = zodSchema(w.object({n:z.string()}))`)
    expect(schemaNames(r.code)).toEqual([])
  })

  it('bails on a COMPUTED member (`z["object"]`) — the property is not an Identifier', () => {
    const r = swift(Z + `const a = zodSchema(z['object']({n:z.string()}))`)
    expect(schemaNames(r.code)).toEqual([])
  })

  it('bails when the namespaced method is neither object nor discriminatedUnion', () => {
    const r = swift(Z + `const a = zodSchema(z.string())`)
    expect(schemaNames(r.code)).toEqual([])
  })

  it('warns when z.object()`s argument is not a literal shape', () => {
    const r = swift(Z + `declare const sh: any\nconst a = zodSchema(z.object(sh))`)
    expect(r.warnings.join('\n')).toContain(
      'zodSchema declaration `a`: z.object() argument must be a literal shape',
    )
    expect(schemaNames(r.code)).toEqual([])
  })

  it('names the PREFIX (not a null wrapper) when the wrapper-less validate form has a non-literal shape', () => {
    const r = swift(
      `import { s } from '@pyreon/validate'\ndeclare const sh: any\nexport const userSchema = s.object(sh)\nexport function App(){ return <Text>x</Text> }`,
    )
    expect(r.warnings.join('\n')).toContain('s declaration `userSchema`: s.object() argument must be a literal shape')
  })

  it('bails with "no recognized fields" on an empty shape', () => {
    const r = swift(Z + `const a = zodSchema(z.object({}))`)
    expect(r.warnings.join('\n')).toContain('zodSchema declaration `a`: no recognized fields')
    expect(schemaNames(r.code)).toEqual([])
  })
})

describe('parse.ts — namespaced walker: field shapes', () => {
  it('skips a SpreadElement property', () => {
    const r = swift(Z + `declare const base: any\nconst a = zodSchema(z.object({ ...base, n: z.string() }))`)
    expect(r.code.match(/var \w+: /g)).toEqual(['var n: '])
  })

  it('accepts a string-literal key', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ 'n': z.string() }))`)
    expect(r.code).toContain('var n: String = ""')
  })

  it('skips a key that is neither Identifier nor Literal', () => {
    const r = swift(Z + 'declare const b: string\nconst a = zodSchema(z.object({ [`x${b}`]: z.string(), n: z.string() }))')
    expect(r.code.match(/var \w+: /g)).toEqual(['var n: '])
  })

  it('ignores .min()/.max() whose argument is not a numeric literal', () => {
    const num = swift(Z + `const a = zodSchema(z.object({ n: z.string().min(2).max(4) }))`)
    expect(num.code).toContain('rule: "min length 2"')
    expect(num.code).toContain('rule: "max length 4"')
    const str = swift(Z + `const a = zodSchema(z.object({ n: z.string().min('x').max('y') }))`)
    expect(str.code).toContain('var n: String = ""')
    expect(str.code).not.toContain('rule: "min length')
    expect(str.code).not.toContain('rule: "max length')
  })

  it('treats .nullable() like .optional() — the field becomes native-optional', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ n: z.string().nullable() }))`)
    expect(r.code).toContain('var n: String? = nil')
  })

  it('warns + drops a field whose value is not a call at all', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ n: 5, m: z.string() }))`)
    expect(r.warnings.join('\n')).toContain('field `n` is not a z.X() call — dropping')
    expect(r.code.match(/var \w+: /g)).toEqual(['var m: '])
  })

  it('warns + drops a field whose base callee is a DIFFERENT namespace', () => {
    const r = swift(Z + `declare const w: any\nconst a = zodSchema(z.object({ n: w.string(), m: z.string() }))`)
    expect(r.warnings.join('\n')).toContain('field `n` has unsupported shape')
    expect(r.code.match(/var \w+: /g)).toEqual(['var m: '])
  })

  it('carries .optional() onto a number and a boolean field', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ n: z.number().optional(), b: z.boolean().optional() }))`)
    expect(r.code).toContain('var n: Int? = nil')
    expect(r.code).toContain('var b: Bool? = nil')
  })

  it('infers z.literal() field type from the literal — number and boolean', () => {
    const n = swift(Z + `const a = zodSchema(z.object({ k: z.literal(1), m: z.string() }))`)
    expect(n.code).toContain('var k: Int = 0')
    const b = swift(Z + `const a = zodSchema(z.object({ k: z.literal(true), m: z.string() }))`)
    expect(b.code).toContain('var k: Bool = false')
  })

  it('defaults a z.literal() with no argument (and an optional one) to string', () => {
    const none = swift(Z + `const a = zodSchema(z.object({ k: z.literal(), m: z.string() }))`)
    expect(none.code).toContain('var k: String = ""')
    const opt = swift(Z + `const a = zodSchema(z.object({ k: z.literal('x').optional(), m: z.string() }))`)
    expect(opt.code).toContain('var k: String? = nil')
  })

  it('warns + drops an unsupported namespaced method', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ d: z.date(), m: z.string() }))`)
    expect(r.warnings.join('\n')).toContain('field `d` uses unsupported z.date()')
    expect(r.code.match(/var \w+: /g)).toEqual(['var m: '])
  })
})

describe('parse.ts — nested z.object() fields', () => {
  it('synthesizes an aux struct for a nested object, optional variant included', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ addr: z.object({ city: z.string() }) }))`)
    expect(schemaNames(r.code)).toEqual(['PyreonZodSchema_a_Addr', 'PyreonZodSchema_a'])
    expect(r.code).toContain('var addr: PyreonZodSchema_a_Addr = PyreonZodSchema_a_Addr()')
    const opt = swift(Z + `const a = zodSchema(z.object({ addr: z.object({ city: z.string() }).optional() }))`)
    expect(opt.code).toContain('var addr: PyreonZodSchema_a_Addr? = nil')
  })

  it('warns + drops a nested object whose shape is not a literal', () => {
    const r = swift(Z + `declare const sh: any\nconst a = zodSchema(z.object({ addr: z.object(sh), m: z.string() }))`)
    expect(r.warnings.join('\n')).toContain(
      'field `addr` is a nested z.object() but its shape isn’t a literal'.replace('’', "'"),
    )
    expect(r.code.match(/var \w+: /g)).toEqual(['var m: '])
  })
})

describe('parse.ts — z.array() element paths', () => {
  it('lowers z.array(z.boolean()) to a native Bool array', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ t: z.array(z.boolean()) }))`)
    expect(r.code).toContain('var t: [Bool] = []')
  })

  it('synthesizes an _Item aux struct for z.array(z.object({…}))', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ t: z.array(z.object({ q: z.string() })) }))`)
    expect(schemaNames(r.code)).toEqual(['PyreonZodSchema_a_T_Item', 'PyreonZodSchema_a'])
    expect(r.code).toContain('var t: [PyreonZodSchema_a_T_Item] = []')
  })

  const dropped = 'is z.array() with an unsupported inner type'
  it('drops z.array() with NO argument', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ t: z.array(), m: z.string() }))`)
    expect(r.warnings.join('\n')).toContain(dropped)
    expect(r.code.match(/var \w+: /g)).toEqual(['var m: '])
  })

  it('drops an element that is not a call (`z.array(z.string)`)', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ t: z.array(z.string), m: z.string() }))`)
    expect(r.warnings.join('\n')).toContain(dropped)
  })

  it('drops an element whose base namespace differs', () => {
    const r = swift(Z + `declare const w: any\nconst a = zodSchema(z.object({ t: z.array(w.string()), m: z.string() }))`)
    expect(r.warnings.join('\n')).toContain(dropped)
  })

  it('drops an element whose method is unsupported (z.date())', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ t: z.array(z.date()), m: z.string() }))`)
    expect(r.warnings.join('\n')).toContain(dropped)
  })

  it('drops an object-element candidate whose callee is not a MemberExpression', () => {
    const r = swift(Z + `declare const f: any\nconst a = zodSchema(z.object({ t: z.array(f()), m: z.string() }))`)
    expect(r.warnings.join('\n')).toContain(dropped)
  })

  it('drops an object-element candidate reached through a COMPUTED member', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ t: z.array(z['object']({ q: z.string() })), m: z.string() }))`)
    expect(r.warnings.join('\n')).toContain(dropped)
  })

  it('drops an object-element candidate under a different namespace', () => {
    const r = swift(Z + `declare const w: any\nconst a = zodSchema(z.object({ t: z.array(w.object({ q: z.string() })), m: z.string() }))`)
    expect(r.warnings.join('\n')).toContain(dropped)
  })
})

describe('parse.ts — z.array() ELEMENT constraint chain (extractTypeAndConstraints)', () => {
  it('collects .url() / .uuid() on the element', () => {
    const url = swift(Z + `const a = zodSchema(z.object({ t: z.array(z.string().url()) }))`)
    expect(url.code).toContain('var t: [String] = []')
    expect(url.code).toContain('rule: "url (element)"')
    const uuid = swift(Z + `const a = zodSchema(z.object({ t: z.array(z.string().uuid()) }))`)
    expect(uuid.code).toContain('rule: "uuid (element)"')
  })

  it('collects a PORTABLE element .regex() and warns on a non-portable one', () => {
    const ok = swift(Z + `const a = zodSchema(z.object({ t: z.array(z.string().regex(/^a+$/)) }))`)
    expect(ok.warnings).toEqual([])
    expect(ok.code).toContain('rule: "regex (element)"')
    const bad = swift(Z + `const a = zodSchema(z.object({ t: z.array(z.string().regex(/(?<x>a)/)) }))`)
    expect(bad.warnings.join('\n')).toContain('schema element .regex()')
    expect(bad.code).toContain('var t: [String] = []')
    expect(bad.code).not.toContain('rule: "regex (element)"')
  })

  it('ignores element .min()/.max() whose argument is not a numeric literal', () => {
    const num = swift(Z + `const a = zodSchema(z.object({ t: z.array(z.string().min(2).max(6)) }))`)
    expect(num.code).toContain('rule: "min length 2 (element)"')
    expect(num.code).toContain('rule: "max length 6 (element)"')
    const str = swift(Z + `const a = zodSchema(z.object({ t: z.array(z.string().min('x').max('y')) }))`)
    expect(str.code).toContain('var t: [String] = []')
    expect(str.code).not.toContain('rule: "min length')
    expect(str.code).not.toContain('rule: "max length')
  })
})

describe('parse.ts — z.discriminatedUnion()', () => {
  const DU = (v: string) => Z + `const a = zodSchema(z.discriminatedUnion(${v}))`

  it('lowers two z.object() variants to an enum + one aux struct each', () => {
    const r = swift(
      DU(`'kind', [z.object({ kind: z.literal('a'), x: z.string() }), z.object({ kind: z.literal('b'), y: z.number() })]`),
    )
    expect(schemaNames(r.code)).toEqual([
      'PyreonZodSchema_a_A',
      'PyreonZodSchema_a_B',
      'PyreonZodSchema_a',
    ])
    expect(r.code).toContain('case a(PyreonZodSchema_a_A)')
    expect(r.code).toContain('case b(PyreonZodSchema_a_B)')
    expect(r.warnings).toEqual([])
  })

  const noEnum = (code: string) => expect(schemaNames(code)).toEqual([])

  it('drops when the discriminator argument is missing or not a string literal', () => {
    const none = swift(DU(''))
    expect(none.warnings.join('\n')).toContain('first arg must be a string literal field name')
    noEnum(none.code)
    const num = swift(DU(`42, [z.object({ kind: z.literal('a') })]`))
    expect(num.warnings.join('\n')).toContain('first arg must be a string literal field name')
  })

  it('drops when the variants argument is not an array literal', () => {
    const r = swift(Z + `declare const vs: any\nconst a = zodSchema(z.discriminatedUnion('kind', vs))`)
    expect(r.warnings.join('\n')).toContain('second arg must be a literal array')
    noEnum(r.code)
  })

  it('drops an EMPTY variants array', () => {
    const r = swift(DU(`'kind', []`))
    expect(r.warnings.join('\n')).toContain('needs at least one variant')
    noEnum(r.code)
  })

  it('drops a variant that is not a call expression', () => {
    const r = swift(Z + `declare const vv: any\nconst a = zodSchema(z.discriminatedUnion('kind', [vv]))`)
    expect(r.warnings.join('\n')).toContain('variant 0 is not a z.object() call')
    noEnum(r.code)
  })

  const noLit = "variant 0 doesn't expose z.literal()"

  it('drops a variant whose callee is not a MemberExpression', () => {
    const r = swift(Z + `declare const foo: any\nconst a = zodSchema(z.discriminatedUnion('kind', [foo()]))`)
    expect(r.warnings.join('\n')).toContain(noLit)
    noEnum(r.code)
  })

  it('drops a variant under a different namespace, and one reached through a non-Identifier object', () => {
    const w = swift(Z + `declare const w: any\nconst a = zodSchema(z.discriminatedUnion('kind', [w.object({ kind: z.literal('a') })]))`)
    expect(w.warnings.join('\n')).toContain(noLit)
    const deep = swift(Z + `declare const q: any\nconst a = zodSchema(z.discriminatedUnion('kind', [q.x.object({ kind: z.literal('a') })]))`)
    expect(deep.warnings.join('\n')).toContain(noLit)
  })

  it('drops a variant reached through a COMPUTED member, and one whose method is not `object`', () => {
    const computed = swift(DU(`'kind', [z['object']({ kind: z.literal('a') })]`))
    expect(computed.warnings.join('\n')).toContain(noLit)
    const union = swift(DU(`'kind', [z.union([])]`))
    expect(union.warnings.join('\n')).toContain(noLit)
  })

  it('drops a variant whose object shape is not a literal', () => {
    const r = swift(Z + `declare const sh: any\nconst a = zodSchema(z.discriminatedUnion('kind', [z.object(sh)]))`)
    expect(r.warnings.join('\n')).toContain(noLit)
  })

  it('drops a variant missing the discriminator field entirely', () => {
    const r = swift(DU(`'kind', [z.object({ x: z.string() })]`))
    expect(r.warnings.join('\n')).toContain(noLit)
  })

  it('drops a variant whose discriminator value is not a call', () => {
    const r = swift(DU(`'kind', [z.object({ kind: 'a', x: z.string() })]`))
    expect(r.warnings.join('\n')).toContain(noLit)
  })

  it('drops a discriminator value that is not a `<prefix>.literal()` member call', () => {
    const notMember = swift(Z + `declare const foo: any\nconst a = zodSchema(z.discriminatedUnion('kind', [z.object({ kind: foo() })]))`)
    expect(notMember.warnings.join('\n')).toContain(noLit)
    const deep = swift(Z + `declare const q: any\nconst a = zodSchema(z.discriminatedUnion('kind', [z.object({ kind: q.x.literal('a') })]))`)
    expect(deep.warnings.join('\n')).toContain(noLit)
    const wrongNs = swift(Z + `declare const w: any\nconst a = zodSchema(z.discriminatedUnion('kind', [z.object({ kind: w.literal('a') })]))`)
    expect(wrongNs.warnings.join('\n')).toContain(noLit)
    const computed = swift(DU(`'kind', [z.object({ kind: z['literal']('a') })]`))
    expect(computed.warnings.join('\n')).toContain(noLit)
    const notLiteralMethod = swift(DU(`'kind', [z.object({ kind: z.string() })]`))
    expect(notLiteralMethod.warnings.join('\n')).toContain(noLit)
  })

  it('drops a z.literal() discriminator whose argument is not a string', () => {
    const num = swift(DU(`'kind', [z.object({ kind: z.literal(1), x: z.string() })]`))
    expect(num.warnings.join('\n')).toContain(noLit)
    const none = swift(DU(`'kind', [z.object({ kind: z.literal(), x: z.string() })]`))
    expect(none.warnings.join('\n')).toContain(noLit)
  })

  it('accepts a string-literal KEY for the discriminator field', () => {
    const r = swift(DU(`'kind', [z.object({ 'kind': z.literal('a'), x: z.string() })]`))
    expect(r.code).toContain('case a(PyreonZodSchema_a_A)')
  })

  it('skips a SpreadElement inside a variant shape while locating the discriminator', () => {
    const r = swift(Z + `declare const base: any\nconst a = zodSchema(z.discriminatedUnion('kind', [z.object({ ...base, kind: z.literal('a') })]))`)
    expect(r.code).toContain('case a(PyreonZodSchema_a_A)')
  })

  it.fails(
    'KNOWN BUG: an EMPTY discriminator literal emits a nameless enum case — reject an empty `capitalizeFirst` result in parseDiscriminatedUnion (parse.ts:4402)',
    () => {
      const r = swift(DU(`'kind', [z.object({ kind: z.literal(''), x: z.string() })]`))
      // Today: `case (PyreonZodSchema_a_)` — not a legal Swift enum case.
      expect(r.code).not.toMatch(/case \(/)
    },
  )
})

describe('parse.ts — valibot recognizer shares the namespaced walker', () => {
  it('lowers v.object() and drops an unsupported v.X()', () => {
    const r = kotlin(
      VB + `export const itemSchema = valibotSchema(v.object({ id: v.string(), bad: v.date() }), safeParse)`,
    )
    expect(r.code).toContain('data class PyreonZodSchema_itemSchema(')
    expect(r.code).toContain('var id: String = "",')
    expect(r.warnings.join('\n')).toContain('field `bad` uses unsupported v.date()')
  })
})

describe('parse.ts — `@pyreon/validate` wrapper-less form', () => {
  const V = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
`
  it('lowers the wrapper-less s.object() declaration', () => {
    const r = swift(V + `export const userSchema = s.object({ name: s.string() })\nexport function App(){ return <Text>x</Text> }`)
    expect(r.code).toContain('struct PyreonZodSchema_userSchema: Codable {')
    expect(r.code).toContain('var name: String = ""')
  })

  it('synthesizes a ZERO-field struct for an inline `s.object({}).safeParse()` chain', () => {
    const r = swift(
      V + `export function App() {
  const ok = computed(() => s.object({}).safeParse({ n: 1 }).success)
  return <Text>{String(ok())}</Text>
}`,
    )
    // The walker bails (no fields) and the inline path falls back to the
    // zero-field struct rather than emitting a verbatim `s.object(...)`.
    expect(r.code).toMatch(/struct PyreonZodSchema_Inline0: Codable \{\n\n/)
    expect(r.code).toContain('PyreonZodSchema_Inline0.safeParseResult(["n": 1] as [String: Any]).success')
  })

  it('lowers `.safeParse()` with NO argument to an empty native dictionary', () => {
    const r = swift(
      V + `export function App() {
  const ok = computed(() => s.object({ n: s.number() }).safeParse().success)
  return <Text>{String(ok())}</Text>
}`,
    )
    expect(r.code).toContain('PyreonZodSchema_Inline0.safeParseResult([String: Any]()).success')
  })

  it('DEDUPS two byte-identical inline shapes onto one synthesized struct', () => {
    const r = swift(
      V + `export function App() {
  const a = computed(() => s.object({ n: s.number() }).safeParse({ n: 1 }).success)
  const b = computed(() => s.object({ n: s.number() }).safeParse({ n: 2 }).success)
  return <Text>{String(a() && b())}</Text>
}`,
    )
    expect(schemaNames(r.code).filter((n) => n.startsWith('PyreonZodSchema_Inline'))).toEqual([
      'PyreonZodSchema_Inline0',
    ])
    expect(r.code).toContain('safeParseResult(["n": 1] as [String: Any])')
    expect(r.code).toContain('safeParseResult(["n": 2] as [String: Any])')
  })

  it('lowers a NESTED s.object() for `@pyreon/validate`', () => {
    // Was a KNOWN BUG: parseNestedObjectShape (parse.ts:4284) synthesized a
    // re-entry wrapper whose callee name is `schemaFn` unconditionally, which
    // for the wrapper-less `s` DSL (schemaFn === null) built `<null>(...)` —
    // the wrapper-less re-entry branch (`schemaFn === null → innerCall =
    // init`) then rejected it every time. Fixed by handing the object call
    // straight through as `init` when schemaFn is null.
    const r = swift(
      V + `export const userSchema = s.object({ addr: s.object({ city: s.string() }) })\nexport function App(){ return <Text>x</Text> }`,
    )
    expect(r.code).toContain('struct PyreonZodSchema_userSchema_Addr: Codable {')
    expect(r.code).toContain('var city: String = ""')
  })

  it('does NOT warn about a dropped nested-object shape now that it lowers', () => {
    const r = swift(
      V + `export const userSchema = s.object({ addr: s.object({ city: s.string() }) })\nexport function App(){ return <Text>x</Text> }`,
    )
    expect(r.warnings.join('\n')).not.toContain('is a nested s.object() but its shape')
  })
})

// Real-toolchain gate — the point of these three shapes is "the synthesized
// struct/enum COMPILES", which a string assertion cannot claim. Skipped when
// the toolchain is absent (the verdicts are content-addressed and cached).
describe('parse.ts — the recognized schema shapes compile on both targets', () => {
  const SHAPES: [string, string][] = [
    [
      'arktype scalars',
      AK + `export const userSchema = arktypeSchema(type({ name: 'string', age: 'number', active: 'boolean' }))`,
    ],
    [
      'nested object + typed array + optional',
      Z +
        `export const userSchema = zodSchema(z.object({
  name: z.string().min(2).optional(),
  addr: z.object({ city: z.string() }),
  tags: z.array(z.string().url()),
  rows: z.array(z.object({ q: z.number() })),
}))`,
    ],
    [
      'discriminated union',
      Z +
        `export const evt = zodSchema(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), x: z.number() }),
  z.object({ kind: z.literal('key'), code: z.string() }),
]))`,
    ],
  ]
  for (const [name, src] of SHAPES) {
    it.skipIf(!isSwiftcAvailable())(`${name}: emitted Swift type-checks`, () => {
      const res = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(res.ok, res.error).toBe(true)
    })
    it.skipIf(!isKotlincAvailable())(`${name}: emitted Kotlin type-checks`, () => {
      const res = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(res.ok, res.error).toBe(true)
    })
  }
})
