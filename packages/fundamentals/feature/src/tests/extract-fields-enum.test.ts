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
