import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { defineFeature } from '../define-feature'
import { extractFields } from '../schema'

/**
 * The literal field-type map is the ONE schema form that crosses to native.
 *
 * `@pyreon/native-compiler` introspects `schema: { id: 'string', done: 'boolean' }`
 * and emits a Codable struct from it; a runtime Zod/Valibot/ArkType schema is
 * NOT introspected there and warns by name. So a feature that has to run on all
 * three targets must be declared with the literal map — and on the web that
 * produced ZERO fields: no auto form fields, no table columns, no create
 * defaults. The one shape that crosses was inert on the target it came from.
 */
describe('extractFields — literal field-type map', () => {
  it('reads the map the native compiler introspects', () => {
    const fields = extractFields({ id: 'string', done: 'boolean', rank: 'number' })
    expect(fields.map((f) => [f.name, f.type])).toEqual([
      ['id', 'string'],
      ['done', 'boolean'],
      ['rank', 'number'],
    ])
    // Labels still derive from the name, same as the Zod path.
    expect(fields[0]?.label).toBe('Id')
  })

  it('reaches the feature, which is where it was empty', () => {
    const feature = defineFeature({ name: 'todo', schema: { id: 'string', done: 'boolean' } as never })
    expect(feature.fields.map((f) => f.name)).toEqual(['id', 'done'])
  })

  // The load-bearing negatives: a real schema must never be mistaken for the
  // map, and a map with any non-field-type value must not be guessed at.
  it('does NOT hijack a real Zod schema', () => {
    const fields = extractFields(z.object({ id: z.string(), done: z.boolean() }))
    expect(fields.map((f) => [f.name, f.type])).toEqual([
      ['id', 'string'],
      ['done', 'boolean'],
    ])
  })

  it('ignores an object whose values are not all field-type names', () => {
    expect(extractFields({ id: 'string', when: 'whenever' })).toEqual([])
    expect(extractFields({})).toEqual([])
  })
})
