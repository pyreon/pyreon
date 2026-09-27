/**
 * `format: int64` numbers get ONE aggregated loss note, not one per field.
 *
 * `JSON.parse` rounds a number past 2^53 - 1 before any schema runs, so the
 * generated schema cannot recover it; the note is the honest outcome. One note
 * per field would bury every other loss in an int64-heavy spec (Stripe-style
 * ids), so the count and the first pointer are reported together.
 */
import { describe, expect, it } from 'vitest'
import { loadOpenApi } from '../input/openapi'

const load = (schemas: Record<string, unknown>) =>
  loadOpenApi(
    JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      servers: [{ url: 'https://t.test' }],
      paths: {},
      components: { schemas },
    }),
  ).doc

describe('int64 precision', () => {
  it('aggregates every int64 number into one note with a count', () => {
    const doc = load({
      A: { type: 'object', properties: { id: { type: 'integer', format: 'int64' }, n: { type: 'integer', format: 'int64' } } },
      B: { type: 'integer', format: 'int64' },
    })
    const notes = doc.notes.filter((n) => n.code === 'int64-precision')
    expect(notes).toHaveLength(1)
    expect(notes[0]?.message).toContain('3 `format: int64` numbers')
    expect(notes[0]?.message).toContain('9007199254740991')
  })

  it('still types the field as an integer number', () => {
    const doc = load({ B: { type: 'integer', format: 'int64', minimum: 1 } })
    expect(doc.models[0]?.type).toMatchObject({ kind: 'number', integer: true, minimum: 1 })
  })

  it('is silent for a spec with no int64', () => {
    const doc = load({ B: { type: 'integer', format: 'int32' } })
    expect(doc.notes.some((n) => n.code === 'int64-precision')).toBe(false)
  })
})
