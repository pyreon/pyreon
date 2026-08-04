/**
 * `extractFields` — enum members.
 *
 * `FieldInfo.enumValues` is documented as "the list of allowed values", and for
 * zod v4 it was never populated: the extraction looked for `def.values`, which
 * v4 does not have. An enum field therefore came back correctly TYPED with no
 * values — a documented field that was silently always `undefined`, which reads
 * downstream as "this enum has no members" rather than "we could not read them".
 *
 * That is the difference between a form generator offering a picker with the
 * real options and offering a free-text box.
 */
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { extractFields } from '../schema'

describe('enum members', () => {
  it('reads the members of a string enum', () => {
    const fields = extractFields(z.object({ status: z.enum(['draft', 'review', 'live']) }))
    const status = fields.find((f) => f.name === 'status')
    expect(status?.type).toBe('enum')
    expect(status?.enumValues).toEqual(['draft', 'review', 'live'])
  })

  it('reads members through an optional wrapper', () => {
    const fields = extractFields(z.object({ status: z.enum(['a', 'b']).optional() }))
    const status = fields.find((f) => f.name === 'status')
    expect(status?.type).toBe('enum')
    expect(status?.optional).toBe(true)
    expect(status?.enumValues).toEqual(['a', 'b'])
  })

  it('reads a native enum by its VALUES, not its keys', () => {
    // A native enum maps name → value; the members are the values.
    enum Role {
      Admin = 'admin',
      Viewer = 'viewer',
    }
    const fields = extractFields(z.object({ role: z.nativeEnum(Role) }))
    const role = fields.find((f) => f.name === 'role')
    expect(role?.type).toBe('enum')
    expect(role?.enumValues).toEqual(['admin', 'viewer'])
  })

  it('leaves enumValues absent for a non-enum field', () => {
    const fields = extractFields(z.object({ title: z.string() }))
    expect(fields.find((f) => f.name === 'title')?.enumValues).toBeUndefined()
  })
})

// ── The `entries` fallback ────────────────────────────────────────────────
//
// Members are read from whichever of four shapes the installed zod exposes:
// `_def.values` (v3), `_zod.def.values`, `.options` (v4's public accessor),
// and finally the `entries` map. The installed version answers on `.options`,
// so the LAST arm never runs against a real schema — it exists so a future zod
// that drops `.options` degrades to reading members rather than silently
// reporting an enum with none, which is the exact bug this file was opened for.
//
// It is a pure shape-reader, so a synthetic schema is a faithful way to reach
// it. Building one is the only way to know the fallback works at all.

describe('enum members — `entries` fallback', () => {
  /** A minimal object schema exposing ONLY the `entries` shape. */
  const entriesOnlySchema = (entries: Record<string, unknown>) => {
    const field = { _def: { typeName: 'ZodEnum' }, _zod: { def: { type: 'enum', entries } } }
    return {
      _def: { typeName: 'ZodObject', shape: () => ({ status: field }) },
      shape: { status: field },
    }
  }

  it('reads members from `entries` when no other shape is present', () => {
    const fields = extractFields(entriesOnlySchema({ Draft: 'draft', Live: 'live' }))
    const status = fields.find((f) => f.name === 'status')
    expect(status?.type).toBe('enum')
    expect(status?.enumValues).toEqual(['draft', 'live'])
  })

  it('keeps only string and number members', () => {
    // An entries map can carry a reverse numeric mapping or non-primitive
    // values; forwarding those would put junk in a generated picker.
    const fields = extractFields(
      entriesOnlySchema({ A: 'a', N: 3, Fn: () => {}, Obj: {}, Undef: undefined }),
    )
    expect(fields.find((f) => f.name === 'status')?.enumValues).toEqual(['a', 3])
  })

  it('leaves enumValues absent when `entries` yields nothing usable', () => {
    // Better an honestly-absent list than an empty one, which downstream reads
    // as "this enum has no members".
    const fields = extractFields(entriesOnlySchema({ Fn: () => {} }))
    expect(fields.find((f) => f.name === 'status')?.enumValues).toBeUndefined()
  })
})
