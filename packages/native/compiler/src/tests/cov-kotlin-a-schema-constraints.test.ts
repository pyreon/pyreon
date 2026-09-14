// Coverage: `emitKotlinScalarConstraints` / `emitKotlinArrayElementConstraints`
// (emit-kotlin.ts ~1113-1270) — the Kotlin half of the zod constraint emit.
//
// The Swift mirror of these arms is locked by tier2-schema-*.test.ts; the
// OPTIONAL-field (nullable-receiver) variants are the ones with no Kotlin
// coverage, and they are exactly where the emit differs most: a nullable
// receiver needs a `!= null &&` guard or a `if (x != null)` wrapper, and
// getting that wrong is a kotlinc type error on `Int?` vs `Int`, not a
// behaviour difference you would notice in a snapshot.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SCHEMA = (fields: string) => `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({
${fields}
}))
`

const kt = (fields: string) => transform(SCHEMA(fields), { target: 'kotlin' })

describe('Kotlin zod constraints: REQUIRED string fields', () => {
  it('url requires a scheme (URI parses "x.com" happily, zod rejects it)', () => {
    const out = kt(`  h: z.string().url(),`).code
    expect(out).toContain(
      'if ((try { java.net.URI(hVal).scheme } catch (_: Throwable) { null }) == null) throw PyreonSchemaError.ConstraintViolation("h", "url")',
    )
  })

  it('regex uses containsMatchIn (RegExp.test is a PARTIAL match on the web) + the i flag', () => {
    const plain = kt(`  i: z.string().regex(/^y/),`).code
    expect(plain).toContain('!Regex("^y").containsMatchIn(iVal)')
    expect(plain).not.toContain('RegexOption.IGNORE_CASE')
    const ci = kt(`  i: z.string().regex(/^y/i),`).code
    expect(ci).toContain('!Regex("^y", RegexOption.IGNORE_CASE).containsMatchIn(iVal)')
  })

  it('uuid is a try/catch around UUID.fromString', () => {
    expect(kt(`  j: z.string().uuid(),`).code).toContain(
      'try { java.util.UUID.fromString(jVal) } catch (_: Throwable) { throw PyreonSchemaError.ConstraintViolation("j", "uuid") }',
    )
  })
})

describe('Kotlin zod constraints: REQUIRED number fields', () => {
  it('min/max compare the value directly (no length access)', () => {
    const out = kt(`  k: z.number().min(0),
  l: z.number().max(100),`).code
    expect(out).toContain('if (kVal < 0) throw PyreonSchemaError.ConstraintViolation("k", "min 0")')
    expect(out).toContain('if (lVal > 100) throw PyreonSchemaError.ConstraintViolation("l", "max 100")')
    expect(out).not.toContain('kVal.length')
  })
})

describe('Kotlin zod constraints: OPTIONAL fields use a nullable receiver', () => {
  it('string min/max guard on `!= null` and force-unwrap the Int? length', () => {
    const out = kt(`  a: z.string().max(5).optional(),
  b: z.string().min(2).optional(),`).code
    expect(out).toContain('if (aVal != null && aVal?.length!! > 5)')
    expect(out).toContain('if (bVal != null && bVal?.length!! < 2)')
  })

  it('url/regex/uuid wrap the whole check in `if (x != null)` (they are statements, not comparisons)', () => {
    const out = kt(`  c: z.string().url().optional(),
  d: z.string().regex(/^x/i).optional(),
  e: z.string().uuid().optional(),`).code
    expect(out).toContain('if (cVal != null) if ((try { java.net.URI(cVal!!).scheme }')
    expect(out).toContain('if (dVal != null) if (!Regex("^x", RegexOption.IGNORE_CASE).containsMatchIn(dVal!!))')
    expect(out).toContain('if (eVal != null) try { java.util.UUID.fromString(eVal!!) }')
  })

  it('number min/max force-unwrap the nullable value', () => {
    const out = kt(`  f: z.number().min(1).optional(),
  g: z.number().max(9).optional(),`).code
    expect(out).toContain('if (fVal != null && fVal!! < 1)')
    expect(out).toContain('if (gVal != null && gVal!! > 9)')
  })
})

describe('Kotlin zod constraints: shapes that emit NO per-element loop', () => {
  it('a SCALAR field is not an array — no element loop', () => {
    const out = kt(`  a: z.string().min(2),`).code
    expect(out).toContain('aVal.length < 2')
    expect(out).not.toContain('for (aElement')
  })

  it('an array of OBJECTS validates through the nested schema, not per-element constraints', () => {
    const out = kt(`  rows: z.array(z.object({ id: z.string().min(1) })),`).code
    expect(out).not.toContain('for (rowsElement in rowsVal)')
    // the nested schema owns its own parse()
    expect(out).toContain('.parse(')
  })

  it('an OPTIONAL array with element constraints wraps the loop in a null guard', () => {
    const out = kt(`  tags: z.array(z.string().min(2)).optional(),`).code
    expect(out).toContain('if (tagsVal != null) {')
    expect(out).toContain('for (tagsElement in tagsVal)')
    expect(out).toContain('"min length 2 (element)"')
  })
})

describe('Kotlin zod constraints: validateField reuses the same generator', () => {
  it('string fields get a per-field validator whose guards match parse()', () => {
    const out = kt(`  a: z.string().min(2),
  k: z.number().min(0),`).code
    expect(out).toContain('fun validateField(field: String, value: String): String {')
    expect(out).toContain('if (value.length < 2)')
    // a NUMBER field is not a text input — no validateField arm for it
    expect(out).not.toContain('"k" -> {')
  })

  it('a string field with NO constraints still gets an arm (Unit), so the when stays total', () => {
    const out = kt(`  a: z.string(),`).code
    expect(out).toContain('"a" -> {')
    expect(out).toContain('Unit')
  })
})
