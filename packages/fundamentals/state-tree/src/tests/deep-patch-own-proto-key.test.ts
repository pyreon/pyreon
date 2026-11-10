/**
 * Parallel to `@pyreon/store`'s deep-patch-own-proto-key test: schema-mode
 * `deepPatch` merges DATA, and an own `"__proto__"` key from `JSON.parse` must
 * stay an own key through the merge. Copying it with `out[key] = value` made
 * the value the merged object's PROTOTYPE, so the schema parse read smuggled
 * optional fields through the chain.
 */
import { zodSchema } from '@pyreon/validation/zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { model } from '../model'
import { getSnapshot } from '../snapshot'

describe('schema-mode model — deepPatch with an own __proto__ key', () => {
  it('does not graft a top-level own __proto__ key into the prototype chain', () => {
    const M = model({ schema: zodSchema(z.object({ name: z.string(), role: z.string().optional() })), initial: { name: 'a' } })
    const m = M.create() as ReturnType<typeof M.create> & { deepPatch: (p: unknown) => void }
    m.deepPatch(JSON.parse('{"name":"b","__proto__":{"role":"admin"}}'))
    expect(getSnapshot(m)).toEqual({ name: 'b' })
  })

  it('does not graft a nested own __proto__ key either', () => {
    const M = model({
      schema: zodSchema(z.object({ prefs: z.object({ theme: z.string(), role: z.string().optional() }) })),
      initial: { prefs: { theme: 'l' } },
    })
    const m = M.create() as ReturnType<typeof M.create> & { deepPatch: (p: unknown) => void }
    m.deepPatch(JSON.parse('{"prefs":{"theme":"d","__proto__":{"role":"admin"}}}'))
    expect(getSnapshot(m)).toEqual({ prefs: { theme: 'd' } })
    expect(({} as { role?: unknown }).role).toBeUndefined()
  })
})
