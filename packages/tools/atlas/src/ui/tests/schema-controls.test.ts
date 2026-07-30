/**
 * Schema-driven controls.
 *
 * Run against REAL zod and REAL valibot, because the two limits this module
 * documents are properties of those libraries — validation is a cross-library
 * contract, shape introspection is not — and a stubbed schema would let either
 * claim pass unearned.
 */
import * as v from 'valibot'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  canIntrospect,
  controlsFromSchema,
  fieldToControl,
  isStandardSchema,
  validateValues,
} from '../schema-controls'

const zodSchema = z.object({
  title: z.string(),
  count: z.number(),
  published: z.boolean(),
  status: z.enum(['draft', 'review', 'live']),
})

describe('deriving controls', () => {
  it('produces one control per schema field', () => {
    const controls = controlsFromSchema(zodSchema)
    expect(controls.map((c) => c.key)).toEqual(['title', 'count', 'published', 'status'])
  })

  it('maps an enum to a picker carrying the REAL allowed values', () => {
    // The whole point: a hand-written control list drifts to a stale subset,
    // and nothing tells you.
    const status = controlsFromSchema(zodSchema).find((c) => c.key === 'status')
    expect(status?.type).toBe('enum')
    expect(status?.options).toEqual(['draft', 'review', 'live'])
    expect(status?.default).toBe('draft')
  })

  it('maps a boolean to a switch', () => {
    expect(controlsFromSchema(zodSchema).find((c) => c.key === 'published')?.type).toBe('bool')
  })

  it('leaves a number as text, so the SCHEMA decides what is valid', () => {
    // Coercing here would hide the rejection the validation panel exists to show.
    expect(controlsFromSchema(zodSchema).find((c) => c.key === 'count')?.type).toBe('text')
  })

  it('derives a human label rather than showing the raw key', () => {
    expect(fieldToControl({ name: 'title', type: 'string', optional: false, label: 'Title' }).label)
      .toBe('Title')
  })
})

describe('the introspection limit is real, and reported as a limit', () => {
  it('reads fields from zod', () => {
    expect(canIntrospect(zodSchema)).toBe(true)
  })

  it('CANNOT read fields from a non-zod Standard Schema', () => {
    // Shape-reading is not part of the Standard Schema spec. Valibot validates
    // fine (below) but its fields are not introspectable, so the panel must say
    // "introspection needs Zod" rather than "this schema has no fields".
    const valibotSchema = v.object({ title: v.string() })
    expect(canIntrospect(valibotSchema)).toBe(false)
    expect(controlsFromSchema(valibotSchema)).toEqual([])
  })
})

describe('validation is cross-library', () => {
  it('accepts valid values under zod', () => {
    expect(
      validateValues(zodSchema, { title: 'x', count: 1, published: true, status: 'draft' }),
    ).toEqual({ state: 'valid' })
  })

  it('names the offending FIELD, not just that something failed', () => {
    const verdict = validateValues(zodSchema, {
      title: 'x',
      count: 'not a number',
      published: true,
      status: 'draft',
    })
    expect(verdict.state).toBe('invalid')
    if (verdict.state !== 'invalid') return
    expect(verdict.issues.some((i) => i.path === 'count')).toBe(true)
    expect(verdict.issues[0]?.message).toBeTruthy()
  })

  it('validates a VALIBOT schema too — the contract is `~standard`', () => {
    const valibotSchema = v.object({ title: v.string() })
    expect(validateValues(valibotSchema, { title: 'ok' })).toEqual({ state: 'valid' })
    expect(validateValues(valibotSchema, { title: 42 }).state).toBe('invalid')
  })

  it('reports `unsupported` for something that is not a schema at all', () => {
    expect(validateValues({ nope: true }, {})).toEqual({ state: 'unsupported' })
  })

  it('reports `async` rather than awaiting and showing a stale verdict', () => {
    // This runs in a render path; awaiting would mean rendering a verdict that
    // does not belong to the values on screen.
    const asyncSchema = { '~standard': { validate: () => Promise.resolve({ value: {} }) } }
    expect(validateValues(asyncSchema, {})).toEqual({ state: 'async' })
  })
})

describe('schema detection', () => {
  it('accepts a CALLABLE schema — ArkType is a function carrying `~standard`', () => {
    const callable = Object.assign(() => {}, {
      '~standard': { validate: () => ({ value: {} }) },
    })
    expect(isStandardSchema(callable)).toBe(true)
  })

  it('rejects a plain function without the brand', () => {
    expect(isStandardSchema(() => {})).toBe(false)
    expect(isStandardSchema(null)).toBe(false)
  })
})
