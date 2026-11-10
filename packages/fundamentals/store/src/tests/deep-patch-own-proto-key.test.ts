/**
 * `deepPatch` merges DATA (typically `await res.json()`), and `JSON.parse`
 * gives a `"__proto__"` key an ordinary own property. The merge used to copy
 * it with `out[key] = value`, which runs the `__proto__` accessor and makes the
 * value the merged object's PROTOTYPE: the schema parse then read optional
 * fields the payload never had as own keys — past any app-side guard that
 * checked the body for them.
 */
import { defineStore } from '@pyreon/store'
import { zodSchema } from '@pyreon/validation/zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('schema-driven defineStore — deepPatch with an own __proto__ key', () => {
  const Schema = zodSchema(
    z.object({
      name: z.string(),
      profile: z.object({ bio: z.string(), role: z.string().optional() }),
    }),
  )

  it('does not graft a nested own __proto__ key into the prototype chain', () => {
    const useS = defineStore('deep-patch-own-proto-nested', { schema: Schema, initial: { name: 'a', profile: { bio: '' } } })
    const s = useS()
    const body = JSON.parse('{"profile":{"bio":"hi","__proto__":{"role":"admin"}}}')
    // The app-side guard a caller would write: the body carries no `role`.
    expect(Object.hasOwn(body.profile, 'role')).toBe(false)
    s.deepPatch(body)
    const profile = s.state.profile as { bio: string; role?: string }
    expect(profile.bio).toBe('hi')
    expect(profile.role).toBeUndefined()
    expect(({} as { role?: unknown }).role).toBeUndefined()
  })

  it('does not graft a top-level own __proto__ key either', () => {
    const useS = defineStore('deep-patch-own-proto-top', {
      schema: zodSchema(z.object({ name: z.string(), role: z.string().optional() })),
      initial: { name: 'a' },
    })
    const s = useS()
    s.deepPatch(JSON.parse('{"name":"b","__proto__":{"role":"admin"}}'))
    expect(s.state.name).toBe('b')
    expect((s.state as { role?: string }).role).toBeUndefined()
  })
})
