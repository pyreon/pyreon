/**
 * Deriving the editor's frontmatter JSON Schema from a collection's Zod
 * schema.
 *
 * This artifact is what gives an author red squiggles on a typo'd
 * frontmatter key while they write. Every failure is a squiggle that
 * does not appear, or one that appears on correct frontmatter — and
 * neither shows up in a build, a test run, or a rendered page. The
 * artifact is generated, never read by a human, and consumed by an
 * editor that reports nothing back.
 *
 * The modifier unwrapping is the part that decides `required`. A field
 * wrapped in `.optional()` that still lands in `required` marks every
 * page missing it as invalid; a required field that unwraps to
 * not-required removes the warning that catches a genuinely missing
 * `title`. Zod stacks these — `.optional().default()`, `.nullable()`
 * inside `.optional()` — so the loop has to unwrap through several
 * layers while remembering that only `optional`/`default` change
 * required-ness and `nullable` does not.
 *
 * The fallbacks matter for the same reason: a Valibot or ArkType schema
 * cannot be introspected here, and emitting a STRICT schema for one
 * (with `additionalProperties: false`) would flag every key in every
 * page of that collection.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  buildJsonSchemaFromZod,
  defaultPermissiveSchema,
  isZodObjectSchema,
  zodFieldToJsonSchema,
  zodTypeNameToJsonSchema,
} from '../type-emit/frontmatter-schema'

type JsonSchema = {
  properties?: Record<string, { type?: string }>
  required?: string[]
  additionalProperties?: boolean
}

const build = (shape: z.ZodRawShape) =>
  buildJsonSchemaFromZod('docs', z.object(shape) as never) as JsonSchema

describe('required-ness follows the modifier chain', () => {
  it('a bare field is required', () => {
    // The control. Every "not required" spec below is worthless against
    // a builder that marks nothing required.
    const out = build({ title: z.string() })
    expect(out.required).toEqual(['title'])
    expect(out.properties?.title?.type).toBe('string')
  })

  it('.optional() makes it NOT required', () => {
    // Marking it required flags every page that legitimately omits it.
    expect(build({ draft: z.string().optional() }).required ?? []).toEqual([])
  })

  it('.default() makes it not required — the value is supplied', () => {
    expect(build({ order: z.number().default(0) }).required ?? []).toEqual([])
  })

  it('.nullable() alone leaves it REQUIRED', () => {
    // `null` is a value the author must still write. Treating nullable
    // as optional removes the warning for a genuinely missing key.
    expect(build({ cover: z.string().nullable() }).required).toEqual(['cover'])
  })

  it('unwraps a STACKED chain and keeps the inner type', () => {
    // `.nullable().optional()` and `.optional().default()` are both
    // ordinary. Stopping at the first layer types the field as the
    // wrapper rather than as its content.
    const out = build({
      a: z.string().nullable().optional(),
      b: z.number().optional().default(1),
    })
    expect(out.required ?? []).toEqual([])
    expect(out.properties?.a?.type).toBe('string')
    expect(out.properties?.b?.type).toBe('number')
  })

  it('reports several fields with mixed requirements', () => {
    const out = build({
      title: z.string(),
      description: z.string().optional(),
      order: z.number(),
    })
    expect(out.required?.sort()).toEqual(['order', 'title'])
  })
})

describe('each Zod primitive maps to a JSON Schema type', () => {
  it('maps the types an editor can check', () => {
    const out = build({
      s: z.string(),
      n: z.number(),
      b: z.boolean(),
      a: z.array(z.string()),
      d: z.date(),
    })
    expect(out.properties?.s?.type).toBe('string')
    expect(out.properties?.n?.type).toBe('number')
    expect(out.properties?.b?.type).toBe('boolean')
    expect(out.properties?.a?.type).toBe('array')
  })

  it('emits an UNCONSTRAINED schema for a type it cannot map', () => {
    // A union or a refinement. An empty `{}` accepts anything, which is
    // right — inventing a type would flag correct frontmatter.
    expect(zodTypeNameToJsonSchema('ZodSomethingNew' as never)).toBeFalsy()
    const out = build({ weird: z.union([z.string(), z.number()]) })
    expect(out.properties?.weird).toEqual({})
  })

  it('reports an unwrappable field as required with no type', () => {
    // A hand-built object with no `_def`. Must not throw mid-emit and
    // lose the whole artifact.
    expect(zodFieldToJsonSchema({} as never)).toEqual({ schema: {}, required: true })
  })
})

describe('a non-Zod schema falls back to PERMISSIVE, never to strict', () => {
  it('recognises a real Zod object', () => {
    expect(isZodObjectSchema(z.object({ a: z.string() }))).toBe(true)
  })

  for (const [label, value] of [
    ['null', null],
    ['a plain object', {}],
    ['a string', 'schema'],
    ['a function', () => {}],
    ['a Zod non-object', z.string()],
    ['an object with a fake _def', { _def: { typeName: 'ZodObject' } }],
  ] as Array<[string, unknown]>) {
    it(`rejects ${label}`, () => {
      // A false positive here calls `.shape()` on something that does
      // not have it, and the artifact is lost for the whole collection.
      expect(isZodObjectSchema(value), label).toBe(false)
    })
  }

  it('the permissive schema accepts unknown keys', () => {
    // The point of the fallback: a Valibot collection must not have
    // every key in every page flagged.
    const out = defaultPermissiveSchema('docs') as JsonSchema
    expect(out.additionalProperties).not.toBe(false)
  })

  it('a strict schema REFUSES unknown keys — that is what catches a typo', () => {
    expect(build({ title: z.string() }).additionalProperties).toBe(false)
  })

  it('falls back when shape() returns nothing usable', () => {
    // A Zod-shaped object whose introspection misbehaves. Emitting a
    // strict schema with no properties would flag every key.
    const fake = { _def: { typeName: 'ZodObject', shape: () => null } }
    const out = buildJsonSchemaFromZod('docs', fake as never) as JsonSchema
    expect(out.additionalProperties).not.toBe(false)
  })

  it('falls back when there is no shape function at all', () => {
    const out = buildJsonSchemaFromZod('docs', { _def: {} } as never) as JsonSchema
    expect(out.additionalProperties).not.toBe(false)
  })

  it('falls back rather than throwing when shape() throws', () => {
    // Losing the artifact is bad; failing the build over an editor
    // convenience is worse.
    const fake = { _def: { typeName: 'ZodObject', shape: () => { throw new Error('boom') } } }
    expect(() => buildJsonSchemaFromZod('docs', fake as never)).not.toThrow()
  })

  it('an EMPTY object schema is still strict', () => {
    // `z.object({})` means "no frontmatter keys", which is a real
    // statement — not a reason to fall back.
    const out = build({})
    expect(out.additionalProperties).toBe(false)
    expect(out.required ?? []).toEqual([])
  })
})
