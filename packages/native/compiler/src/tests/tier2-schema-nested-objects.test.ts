// Gap 4 v3.2 — nested z.object() shapes. Tests verify:
//   1. `z.object({ x: z.object({...}) })` synthesizes an auxiliary
//      nested struct/data class, emitted BEFORE the parent.
//   2. `z.array(z.object({...}))` synthesizes a `_Item` aux schema
//      and emits parse() as `raw.map { ... .parse($0) }`.
//   3. Optional nested objects work.
//   4. Multi-level nesting (object inside array inside object) works.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Gap 4 v3.2 — nested z.object() shapes', () => {
  // ─────────────────── nested object field (Swift) ───────────────────

  it('Swift: nested z.object() emits as a separate struct emitted BEFORE parent', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  name: z.string(),
  address: z.object({
    street: z.string(),
    zip: z.number(),
  }),
}))
`
    const r = transform(src, { target: 'swift' })
    // Nested aux schema is emitted as its own struct
    expect(r.code).toContain('struct PyreonZodSchema_userSchema_Address')
    expect(r.code).toContain('var street: String')
    expect(r.code).toContain('var zip: Int')
    // Parent references it
    expect(r.code).toContain('var address: PyreonZodSchema_userSchema_Address')
    // Order: aux schema comes BEFORE parent
    const auxIdx = r.code.indexOf('struct PyreonZodSchema_userSchema_Address')
    const mainIdx = r.code.indexOf('struct PyreonZodSchema_userSchema:')
    expect(auxIdx).toBeGreaterThan(-1)
    expect(mainIdx).toBeGreaterThan(-1)
    expect(auxIdx).toBeLessThan(mainIdx)
    // parse() routes through the nested schema's own parse()
    expect(r.code).toContain('PyreonZodSchema_userSchema_Address.parse(addressRaw)')
  })

  it('Swift: nested object parse() throws on wrong type', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  meta: z.object({ id: z.string() }),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain(
      'guard let metaRaw = input["meta"] as? [String: Any]',
    )
    expect(r.code).toContain('expected: "PyreonZodSchema_s_Meta"')
  })

  it('Swift: optional nested object emits as T? = nil with present-checked branch', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  profile: z.object({ bio: z.string() }).optional(),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('var profile: PyreonZodSchema_userSchema_Profile? = nil')
    expect(r.code).toContain('if let raw = input["profile"]')
    expect(r.code).toContain('PyreonZodSchema_userSchema_Profile.parse(')
  })

  // ─────────────────── nested object field (Kotlin) ───────────────────

  it('Kotlin: nested z.object() emits as a separate data class emitted BEFORE parent', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  name: z.string(),
  address: z.object({
    street: z.string(),
    zip: z.number(),
  }),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('data class PyreonZodSchema_userSchema_Address')
    expect(r.code).toContain('var street: String')
    expect(r.code).toContain('var zip: Int')
    expect(r.code).toContain('var address: PyreonZodSchema_userSchema_Address')
    const auxIdx = r.code.indexOf('data class PyreonZodSchema_userSchema_Address')
    const mainIdx = r.code.indexOf('data class PyreonZodSchema_userSchema(')
    expect(auxIdx).toBeGreaterThan(-1)
    expect(mainIdx).toBeGreaterThan(-1)
    expect(auxIdx).toBeLessThan(mainIdx)
    expect(r.code).toContain(
      'PyreonZodSchema_userSchema_Address.parse(addressRaw)',
    )
  })

  it('Kotlin: optional nested object emits as T? = null with present-checked branch', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  profile: z.object({ bio: z.string() }).optional(),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('var profile: PyreonZodSchema_userSchema_Profile? = null')
    expect(r.code).toContain('input.containsKey("profile")')
    expect(r.code).toContain('PyreonZodSchema_userSchema_Profile.parse(raw)')
  })

  // ─────────────────── array of objects (Swift) ───────────────────

  it('Swift: z.array(z.object({...})) emits [_Item] with map-parse', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  posts: z.array(z.object({
    title: z.string(),
    views: z.number(),
  })),
}))
`
    const r = transform(src, { target: 'swift' })
    // Aux schema for the array item
    expect(r.code).toContain('struct PyreonZodSchema_userSchema_Posts_Item')
    expect(r.code).toContain('var title: String')
    expect(r.code).toContain('var views: Int')
    // Parent field references the array of item-schema instances
    expect(r.code).toContain(
      'var posts: [PyreonZodSchema_userSchema_Posts_Item]',
    )
    // parse() uses .map { ... .parse($0) }
    expect(r.code).toContain('postsRaw.map { try PyreonZodSchema_userSchema_Posts_Item.parse($0) }')
  })

  it('Swift: array of objects parse() expects [[String: Any]]', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  items: z.array(z.object({ k: z.string() })),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain(
      'guard let itemsRaw = input["items"] as? [[String: Any]]',
    )
  })

  it('Swift: optional array of objects emits as [_Item]? = nil', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  comments: z.array(z.object({ text: z.string() })).optional(),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain(
      'var comments: [PyreonZodSchema_userSchema_Comments_Item]? = nil',
    )
    expect(r.code).toContain('if let raw = input["comments"]')
    expect(r.code).toContain('PyreonZodSchema_userSchema_Comments_Item.parse')
  })

  // ─────────────────── array of objects (Kotlin) ───────────────────

  it('Kotlin: z.array(z.object({...})) emits List<_Item> with map-parse', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  posts: z.array(z.object({
    title: z.string(),
    views: z.number(),
  })),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('data class PyreonZodSchema_userSchema_Posts_Item')
    expect(r.code).toContain(
      'var posts: List<PyreonZodSchema_userSchema_Posts_Item>',
    )
    expect(r.code).toContain(
      'postsRaw.map { PyreonZodSchema_userSchema_Posts_Item.parse(it) }',
    )
  })

  it('Kotlin: array of objects parse() expects List<Map<String, Any?>>', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  items: z.array(z.object({ k: z.string() })),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('input["items"] as? List<Map<String, Any?>>')
  })

  it('Kotlin: optional array of objects emits as List<_Item>? = null', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  comments: z.array(z.object({ text: z.string() })).optional(),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain(
      'var comments: List<PyreonZodSchema_userSchema_Comments_Item>? = null',
    )
    expect(r.code).toContain('input.containsKey("comments")')
    expect(r.code).toContain('PyreonZodSchema_userSchema_Comments_Item.parse')
  })

  // ─────────────────── deep nesting ───────────────────

  it('Swift: 2-level deep nesting works (object inside object)', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  address: z.object({
    location: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    city: z.string(),
  }),
}))
`
    const r = transform(src, { target: 'swift' })
    // All three structs emitted
    expect(r.code).toContain('struct PyreonZodSchema_userSchema_Address_Location')
    expect(r.code).toContain('struct PyreonZodSchema_userSchema_Address')
    expect(r.code).toContain('struct PyreonZodSchema_userSchema:')
    // Deepest emitted first (find the full struct decl line for the address-level)
    const locIdx = r.code.indexOf(
      'struct PyreonZodSchema_userSchema_Address_Location:',
    )
    const addrIdx = r.code.indexOf('struct PyreonZodSchema_userSchema_Address:')
    const mainIdx = r.code.indexOf('struct PyreonZodSchema_userSchema:')
    expect(locIdx).toBeGreaterThan(-1)
    expect(addrIdx).toBeGreaterThan(-1)
    expect(mainIdx).toBeGreaterThan(-1)
    expect(locIdx).toBeLessThan(addrIdx)
    expect(addrIdx).toBeLessThan(mainIdx)
  })

  it('Kotlin: 2-level deep nesting works (object inside object)', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  address: z.object({
    location: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    city: z.string(),
  }),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain(
      'data class PyreonZodSchema_userSchema_Address_Location',
    )
    expect(r.code).toContain('data class PyreonZodSchema_userSchema_Address')
    expect(r.code).toContain('data class PyreonZodSchema_userSchema(')
  })

  it('both targets: array of objects each containing arrays of primitives composes correctly', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  posts: z.array(z.object({
    title: z.string(),
    tags: z.array(z.string()),
  })),
}))
`
    const swift = transform(src, { target: 'swift' })
    expect(swift.code).toContain('struct PyreonZodSchema_userSchema_Posts_Item')
    expect(swift.code).toContain('var tags: [String]')
    expect(swift.code).toContain(
      'var posts: [PyreonZodSchema_userSchema_Posts_Item]',
    )

    const kotlin = transform(src, { target: 'kotlin' })
    expect(kotlin.code).toContain(
      'data class PyreonZodSchema_userSchema_Posts_Item',
    )
    expect(kotlin.code).toContain('var tags: List<String>')
    expect(kotlin.code).toContain(
      'var posts: List<PyreonZodSchema_userSchema_Posts_Item>',
    )
  })

  it('both targets: nested object preserves required+optional+constraints inside its own fields', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  profile: z.object({
    name: z.string().min(2).max(50),
    nickname: z.string().optional(),
    age: z.number().min(0),
  }),
}))
`
    const swift = transform(src, { target: 'swift' })
    // Nested struct carries the constraint emit for its OWN fields
    expect(swift.code).toContain('struct PyreonZodSchema_userSchema_Profile')
    expect(swift.code).toContain('nameVal.count < 2')
    expect(swift.code).toContain('nameVal.count > 50')
    expect(swift.code).toContain('var nickname: String? = nil')
    expect(swift.code).toContain('ageVal < 0')

    const kotlin = transform(src, { target: 'kotlin' })
    expect(kotlin.code).toContain('data class PyreonZodSchema_userSchema_Profile')
    expect(kotlin.code).toContain('nameVal.length < 2')
    expect(kotlin.code).toContain('nameVal.length > 50')
    expect(kotlin.code).toContain('var nickname: String? = null')
    expect(kotlin.code).toContain('ageVal < 0')
  })
})
