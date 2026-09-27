/**
 * What each validator's schemas actually lower to, measured against the REAL
 * native compiler.
 *
 * This used to pin a real gap: a nested object and an array of objects
 * lowered under zod and were DROPPED under `s.*` — `@pyreon/validate`'s
 * wrapper-less DSL synthesized a re-entry wrapper with a callee literally
 * named `null` for the schema-less form, which the wrapper-less branch then
 * rejected. Fixed in `@pyreon/native-compiler` (`parseNestedObjectShape`):
 * both shapes now lower under `s.*` too. `validator: 'zod'` remains a real
 * interoperability option, just no longer the ONLY one that reaches this
 * depth — a named `$ref` reference is still dropped under BOTH recognisers
 * (neither follows a named reference; see the third spec below), which is
 * the residual gap zod's inlining still closes on the native path.
 *
 * It is measured here rather than asserted in prose because it is a property
 * of a DIFFERENT package. If PMTC's `s.*` recogniser regresses this, this
 * file fails and the README claim gets corrected in the same change, instead
 * of quietly becoming a lie.
 *
 * A dropped field is the dangerous shape, not a loud one: the module still
 * emits, still carries the `PyreonZodSchema_` marker, and the struct that
 * reaches iOS is simply missing a field.
 */
import { transform } from '@pyreon/native-compiler'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'

const compiler = (): typeof transform | null => {
  try {
    // A missing compiler must SKIP loudly, never pass — a verification that
    // cannot run must not look like one that ran and succeeded.
    transform('export function D() { return null }', { target: 'swift' })
    return transform
  } catch {
    return null
  }
}

const run = (source: string): { code: string; warnings: string[] } => {
  const t = compiler()
  if (!t) throw new Error('native compiler unavailable')
  return t(source, { target: 'swift' })
}

const pyreonSrc = (expr: string): string =>
  `import { s } from '@pyreon/validate'\nconst Other = s.object({ q: s.string() })\nconst Book = ${expr}\nexport function D() { return <Text>{'x'}</Text> }`

const zodSrc = (expr: string): string =>
  `import { z } from 'zod'\nimport { zodSchema } from '@pyreon/validation'\nconst Other = zodSchema(z.object({ q: z.string() }))\nconst Book = zodSchema(${expr})\nexport function D() { return <Text>{'x'}</Text> }`

const lowers = (src: string): boolean => run(src).code.includes('struct PyreonZodSchema_Book')

describe.skipIf(compiler() === null)('native schema recogniser coverage', () => {
  const shared: [string, string, string][] = [
    ['scalars', `s.object({ id: s.string(), n: s.number() })`, `z.object({ id: z.string(), n: z.number() })`],
    ['optional', `s.object({ n: s.number().optional() })`, `z.object({ n: z.number().optional() })`],
    ['nullable', `s.object({ n: s.number().nullable() })`, `z.object({ n: z.number().nullable() })`],
    ['array of scalars', `s.object({ t: s.array(s.string()) })`, `z.object({ t: z.array(z.string()) })`],
  ]

  for (const [name, sExpr, zExpr] of shared) {
    it(`${name} lowers under BOTH`, () => {
      expect(lowers(pyreonSrc(sExpr)), 'pyreon').toBe(true)
      expect(lowers(zodSrc(zExpr)), 'zod').toBe(true)
    })
  }

  it('a NESTED object lowers under BOTH zod and s.*', () => {
    // Was: "... and is DROPPED under s.*" — the wrapper-less re-entry bug
    // fixed in @pyreon/native-compiler. Kept as a positive spec rather than
    // deleted, so a regression here is caught the same way the drop was.
    expect(lowers(zodSrc(`z.object({ a: z.object({ b: z.string() }) })`)), 'zod').toBe(true)
    expect(lowers(pyreonSrc(`s.object({ a: s.object({ b: s.string() }) })`)), 'pyreon').toBe(true)
  })

  it('an ARRAY OF OBJECTS lowers under BOTH zod and s.*', () => {
    expect(lowers(zodSrc(`z.object({ x: z.array(z.object({ b: z.string() })) })`)), 'zod').toBe(true)
    expect(
      lowers(pyreonSrc(`s.object({ x: s.array(s.object({ b: s.string() })) })`)),
      'pyreon',
    ).toBe(true)
  })

  it('a field NAMING another schema is dropped under both — which is why zod inlines', () => {
    // Neither recogniser follows a named reference. Under zod that gap closes
    // by inlining on the native path, because an inlined ref is a nested
    // object; under `s.*` inlining buys nothing, since nested objects are
    // dropped there too.
    expect(lowers(zodSrc(`z.object({ o: Other })`)), 'zod').toBe(false)
    expect(lowers(pyreonSrc(`s.object({ o: Other })`)), 'pyreon').toBe(false)
  })
})

const REF_SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [b]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } } } }
components:
  schemas:
    Author:
      type: object
      required: [name]
      properties: { name: { type: string } }
    Book:
      type: object
      required: [id, author]
      properties:
        id: { type: string }
        author: { $ref: '#/components/schemas/Author' }
`

const nativeModule = (validator: 'pyreon' | 'zod', spec = REF_SPEC): string => {
  const cfg = resolveConfig({
    input: 'x',
    target: 'multiplatform',
    validator,
    plugins: ['schemas', 'client', 'queries'],
  })
  return generate(spec, cfg).files.find((f) => f.path.endsWith('.native.tsx'))?.contents ?? ''
}

describe.skipIf(compiler() === null)('a cross-model $ref on the native path', () => {
  it('zod INLINES it, so the referenced field survives to the struct', () => {
    const out = run(nativeModule('zod'))
    expect(out.warnings).toEqual([])
    const book = out.code.split('struct PyreonZodSchema_book_schema:')[1]?.split('static func')[0] ?? ''
    // The field is present AND typed as the inlined nested struct — the whole
    // point. A struct that merely EXISTS proves nothing; the failure mode is a
    // struct that exists with a field missing.
    expect(book).toContain('var id: String')
    expect(book).toContain('var author: PyreonZodSchema_book_schema_Author')
  })

  it('s.* drops the field, and says so', () => {
    // Recorded rather than treated as acceptable. The verifier reports this
    // module `broken`; what this pins is WHY, so a future PMTC change that
    // fixes it makes this test fail rather than leaving the README stale.
    const out = run(nativeModule('pyreon'))
    expect(out.warnings.join(' ')).toMatch(/field `author`.*dropping/)
    const book = out.code.split('struct PyreonZodSchema_book_schema:')[1]?.split('static func')[0] ?? ''
    expect(book).toContain('var id: String')
    expect(book).not.toContain('var author')
  })

  it('a CYCLIC $ref terminates instead of inlining forever', () => {
    // There is no finite nesting for a cycle, so the emitter falls back to
    // naming the target. PMTC drops that one field with a warning, which is
    // the honest outcome — and, crucially, the generator does not hang.
    const cyclic = REF_SPEC.replace(
      `    Author:
      type: object
      required: [name]
      properties: { name: { type: string } }`,
      `    Author:
      type: object
      required: [name]
      properties:
        name: { type: string }
        favourite: { $ref: '#/components/schemas/Book' }`,
    )
    const src = nativeModule('zod', cyclic)
    expect(src).toContain('export const book_schema')
    // Bounded output, not an exploded one.
    expect(src.length).toBeLessThan(20_000)
    expect(() => run(src)).not.toThrow()
  })
})
