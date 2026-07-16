/**
 * Compile-time type tests for `StoreState<Api>` / `StoreActions<Api>` —
 * deriving the unwrapped state shape + action surface from a store's api
 * object without re-annotating. Follows the repo's `.types.test.ts`
 * precedent (assignability assertions + @ts-expect-error negatives).
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { Signal } from '@pyreon/reactivity'
import { zodSchema } from '@pyreon/validation/zod'
import { z } from 'zod'
import type { SchemaStoreApi, SignalsOf, StoreActions, StoreApi, StoreState } from '../index'
import { computed, defineStore, signal } from '../index'

// ─── Composition store fixture ────────────────────────────────────────────────

const useCart = defineStore('types-test:cart', () => {
  const items = signal<string[]>([])
  const owner = signal<{ id: number } | null>(null)
  const count = computed(() => items().length)
  const add = (item: string) => items.update((xs) => [...xs, item])
  const clear = () => items.set([])
  return { items, owner, count, add, clear }
})
type CartApi = ReturnType<typeof useCart>

describe('StoreState — composition stores (StoreApi<T>)', () => {
  it('unwraps every signal field to its value type', () => {
    type State = StoreState<CartApi>
    expectTypeOf<State['items']>().toEqualTypeOf<string[]>()
    expectTypeOf<State['owner']>().toEqualTypeOf<{ id: number } | null>()
  })

  it('excludes computeds and actions (mirrors the runtime state snapshot)', () => {
    type State = StoreState<CartApi>
    expectTypeOf<keyof State>().toEqualTypeOf<'items' | 'owner'>()
  })

  it('resolves to never for a non-store input (negative)', () => {
    expectTypeOf<StoreState<{ items: string[] }>>().toEqualTypeOf<never>()
    expectTypeOf<StoreState<number>>().toEqualTypeOf<never>()
  })
})

describe('StoreActions — composition stores', () => {
  it('picks exactly the plain function fields', () => {
    type Actions = StoreActions<CartApi>
    expectTypeOf<keyof Actions>().toEqualTypeOf<'add' | 'clear'>()
    expectTypeOf<Actions['add']>().toEqualTypeOf<(item: string) => void>()
  })

  it('excludes signals and computeds even though both are callable', () => {
    type Actions = StoreActions<CartApi>
    // @ts-expect-error — `items` is a Signal, not an action
    type _Items = Actions['items']
    // @ts-expect-error — `count` is a Computed, not an action
    type _Count = Actions['count']
  })
})

// ─── Schema store fixture ─────────────────────────────────────────────────────

const useProfile = defineStore('types-test:profile', {
  schema: zodSchema(z.object({ name: z.string(), age: z.number() })),
  initial: { name: 'Ada', age: 36 },
  setup: (ctx) => ({
    rename: (name: string) => ctx.state.name.set(name),
  }),
})
type ProfileApi = ReturnType<typeof useProfile>

describe('StoreState / StoreActions — schema stores (SchemaStoreApi)', () => {
  it('StoreState is the schema-inferred raw value shape', () => {
    type State = StoreState<ProfileApi>
    expectTypeOf<State>().toEqualTypeOf<{ name: string; age: number }>()
  })

  it('StoreActions picks the setup-returned actions, drops field signals', () => {
    type Actions = StoreActions<ProfileApi>
    expectTypeOf<keyof Actions>().toEqualTypeOf<'rename'>()
    expectTypeOf<Actions['rename']>().toEqualTypeOf<(name: string) => void>()
  })

  it('works on the bare SchemaStoreApi interface too', () => {
    type Api = SchemaStoreApi<{ a: number }, SignalsOf<{ a: number }> & { bump: () => void }>
    expectTypeOf<StoreState<Api>>().toEqualTypeOf<{ a: number }>()
    expectTypeOf<keyof StoreActions<Api>>().toEqualTypeOf<'bump'>()
  })
})

describe('StoreState round-trips with SignalsOf (the existing inverse)', () => {
  it('SignalsOf<StoreState<Api>> matches the signal fields of the store', () => {
    type Api = StoreApi<{ flag: Signal<boolean> }>
    type State = StoreState<Api> // { flag: boolean }
    expectTypeOf<SignalsOf<State>['flag']>().toEqualTypeOf<Signal<boolean>>()
  })
})

// Runtime smoke — keeps the suite green; tsc carries the real load.
describe('store type-helpers runtime surface', () => {
  it('the fixtures actually run (stores classify as expected)', () => {
    const cart = useCart()
    cart.store.add('x')
    expect(cart.store.items()).toEqual(['x'])
    expect(cart.state).toHaveProperty('items')
    cart.dispose()
    const profile = useProfile()
    expect(profile.state.name).toBe('Ada')
    profile.dispose()
  })
})
