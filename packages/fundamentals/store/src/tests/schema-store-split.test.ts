/**
 * Schema stores are `defineSchemaStore`; `defineStore` takes a setup function
 * only. The split keeps the validation bridge out of a plain store's bundle
 * (locked by the `@pyreon/store::defineStore` import budget).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineSchemaStore, defineStore, resetAllStores } from '../index'

afterEach(() => resetAllStores())

describe('defineStore / defineSchemaStore split', () => {
  it('defineStore points a schema config at defineSchemaStore (dev)', () => {
    expect(() =>
      defineStore('split-misuse', { schema: z.object({ n: z.number() }), initial: { n: 0 } } as never),
    ).toThrow(/defineSchemaStore\(id, config\)/)
  })

  it('defineSchemaStore validates writes', () => {
    const use = defineSchemaStore('split-ok', { schema: z.object({ n: z.number() }), initial: { n: 1 } })
    const s = use()
    expect(s.store.n()).toBe(1)
    s.set({ n: 2 })
    expect(s.store.n()).toBe(2)
    expect(() => s.set({ n: 'x' } as never)).toThrow()
  })
})
