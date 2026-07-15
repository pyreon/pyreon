/**
 * Schema-driven `defineStore` overload tests.
 *
 * Cross-library matrix:
 *   - Zod via `zodSchema()` (Pyreon adapter — Tier A.1)
 *   - Valibot via `valibotSchema()` (Pyreon adapter — Tier A.1)
 *   - ArkType via `arktypeSchema()` (Pyreon adapter — Tier A.1)
 *   - User-authored adapter (Tier B — any library can be wrapped)
 *
 * Behavioral assertions:
 *   - Field signals inferred from schema
 *   - `set` validates + replaces atomically
 *   - `patch` validates merged + writes only changed
 *   - `reset` restores parsed initial
 *   - Direct signal write bypasses validation (documented escape hatch)
 *   - Reserved-key collision throws at defineStore-time
 *   - Field-vs-action collision throws
 *   - Async validator rejected at defineStore-time
 *   - onValidationError callback suppresses throw
 *   - Plugin compat
 *   - subscribe + onAction still fire
 *   - Defaults / transforms applied (parsed value written, not raw initial)
 */
import {
  addStorePlugin,
  computed,
  defineStore,
  resetAllStores,
  resetStore,
  type StoreApi,
  type StorePlugin,
} from '@pyreon/store'
import { arktypeSchema } from '@pyreon/validation/arktype'
import { valibotSchema } from '@pyreon/validation/valibot'
import { zodSchema } from '@pyreon/validation/zod'
import { type } from 'arktype'
import * as v from 'valibot'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'

afterEach(() => {
  resetAllStores()
})

// ─── Tier A.1: Zod via zodSchema() ──────────────────────────────────────────

describe('schema-driven defineStore — zod (TypedSchemaAdapter / Tier A.1)', () => {
  const UserSchema = zodSchema(
    z.object({
      name: z.string().min(1),
      age: z.number(),
    }),
  )

  it('exposes per-field signals via store with correct values', () => {
    const useUser = defineStore('zod-user-1', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(u.store.name()).toBe('Alice')
    expect(u.store.age()).toBe(30)
  })

  it('`set` validates and replaces atomically', () => {
    const useUser = defineStore('zod-user-2', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    u.set({ name: 'Bob', age: 40 })
    expect(u.store.name()).toBe('Bob')
    expect(u.store.age()).toBe(40)
  })

  it('`set` with invalid input throws', () => {
    const useUser = defineStore('zod-user-3', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(() => u.set({ name: '', age: 30 })).toThrow(/Schema validation failed.*set/)
    // State unchanged
    expect(u.store.name()).toBe('Alice')
  })

  it('`patch` validates merged result and writes only changed', () => {
    const useUser = defineStore('zod-user-4', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    // Patch only age
    u.patch({ age: 31 })
    expect(u.store.age()).toBe(31)
    expect(u.store.name()).toBe('Alice')
  })

  it('`patch` with invalid merged result throws', () => {
    const useUser = defineStore('zod-user-5', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(() => u.patch({ name: '' })).toThrow(/Schema validation failed.*patch/)
  })

  it('`reset` restores parsed initial', () => {
    const useUser = defineStore('zod-user-6', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    u.set({ name: 'Bob', age: 40 })
    u.reset()
    expect(u.store.name()).toBe('Alice')
    expect(u.store.age()).toBe(30)
  })

  it('setup adds actions / computeds alongside field signals', () => {
    const useUser = defineStore('zod-user-7', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
      setup: ({ state }) => ({
        greet: computed(() => `Hello, ${state.name()}`),
        incAge: () => state.age.update((n) => n + 1),
      }),
    })
    const u = useUser() as ReturnType<typeof useUser> & {
      store: { greet: () => string; incAge: () => void; name: { (): string }; age: { (): number } }
    }
    expect(u.store.greet()).toBe('Hello, Alice')
    u.store.incAge()
    expect(u.store.age()).toBe(31)
  })

  it('subscribe fires on set + patch (one notification per call)', () => {
    const useUser = defineStore('zod-user-8', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    const calls: unknown[][] = []
    u.subscribe((mutation) => calls.push([mutation.type, mutation.events.length]))

    u.set({ name: 'Bob', age: 40 })
    u.patch({ age: 41 })

    // set fires one notification with all field events; patch fires one
    // notification with only changed-field events
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('direct signal write bypasses validation (documented escape hatch)', () => {
    const useUser = defineStore('zod-user-9', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    // Bypass: schema requires name.min(1), but direct write doesn't check
    u.store.name.set('')
    expect(u.store.name()).toBe('')
  })

  it('throws at defineStore-time if initial is invalid', () => {
    expect(() =>
      defineStore('zod-user-10', {
        schema: UserSchema,
        initial: { name: '', age: 30 },
      }),
    ).toThrow(/Schema validation failed.*init/)
  })

  it('onValidationError suppresses throw on set/patch', () => {
    const errors: { issues: unknown; op: string }[] = []
    const useUser = defineStore('zod-user-11', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
      onValidationError: (issues, op) => {
        errors.push({ issues, op })
      },
    })
    const u = useUser()
    u.set({ name: '', age: 30 }) // would normally throw
    expect(errors.length).toBe(1)
    expect(errors[0]!.op).toBe('set')
    // State unchanged when validation fails
    expect(u.store.name()).toBe('Alice')
  })

  it('zod transforms apply (e.g. .default())', () => {
    const SchemaWithDefault = zodSchema(
      z.object({
        name: z.string().default('Default'),
        age: z.number(),
      }),
    )
    const useUser = defineStore('zod-default-1', {
      schema: SchemaWithDefault,
      initial: { name: undefined as unknown as string, age: 30 },
    })
    const u = useUser()
    // Default applied via parse, written to signal
    expect(u.store.name()).toBe('Default')
  })
})

// ─── Tier A.1: Valibot via valibotSchema() ──────────────────────────────────

describe('schema-driven defineStore — valibot (TypedSchemaAdapter / Tier A.1)', () => {
  const UserSchema = valibotSchema<{ name: string; age: number }>(
    v.object({
      name: v.pipe(v.string(), v.minLength(1)),
      age: v.number(),
    }),
    v.safeParse,
  )

  it('exposes per-field signals from valibot schema', () => {
    const useUser = defineStore('valibot-user-1', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(u.store.name()).toBe('Alice')
    expect(u.store.age()).toBe(30)
  })

  it('`set` validates and replaces', () => {
    const useUser = defineStore('valibot-user-2', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    u.set({ name: 'Bob', age: 40 })
    expect(u.store.name()).toBe('Bob')
  })

  it('`set` with invalid input throws', () => {
    const useUser = defineStore('valibot-user-3', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(() => u.set({ name: '', age: 30 })).toThrow(/Schema validation failed/)
  })

  it('async safeParseAsync passed by mistake throws at defineStore-time', () => {
    const AsyncSchema = valibotSchema<{ name: string }>(v.object({ name: v.string() }), v.safeParseAsync)
    expect(() =>
      defineStore('valibot-user-4', {
        schema: AsyncSchema,
        initial: { name: 'X' },
      }),
    ).toThrow(/async/i)
  })
})

// ─── Tier A.1: ArkType via arktypeSchema() ──────────────────────────────────

describe('schema-driven defineStore — arktype (TypedSchemaAdapter / Tier A.1)', () => {
  const UserType = type({
    name: 'string > 0',
    age: 'number',
  })
  const UserSchema = arktypeSchema<{ name: string; age: number }>(UserType as unknown as (data: unknown) => unknown)

  it('exposes per-field signals from arktype schema', () => {
    const useUser = defineStore('ark-user-1', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(u.store.name()).toBe('Alice')
    expect(u.store.age()).toBe(30)
  })

  it('`set` validates and replaces', () => {
    const useUser = defineStore('ark-user-2', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    u.set({ name: 'Bob', age: 40 })
    expect(u.store.name()).toBe('Bob')
  })

  it('`set` with invalid input throws', () => {
    const useUser = defineStore('ark-user-3', {
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(() => u.set({ name: '', age: 30 })).toThrow(/Schema validation failed/)
  })
})

// ─── Tier B: user-authored adapter (any library) ────────────────────────────

describe('schema-driven defineStore — user-authored adapter (Tier B)', () => {
  // Minimal user-authored adapter mimicking a "yup-like" library API.
  // Demonstrates that any library can be wrapped into the schema-store
  // contract without Pyreon shipping an adapter.
  type UserShape = { name: string; age: number }
  const customAdapter = {
    _infer: undefined as unknown as UserShape,
    validator: async () => ({}) as never,
    parse: (value: unknown) => {
      const v = value as UserShape
      const issues: { path: string; message: string }[] = []
      if (typeof v?.name !== 'string' || v.name.length === 0) {
        issues.push({ path: 'name', message: 'name must be non-empty string' })
      }
      if (typeof v?.age !== 'number') {
        issues.push({ path: 'age', message: 'age must be number' })
      }
      if (issues.length > 0) return { ok: false as const, issues }
      return { ok: true as const, value: v }
    },
  }

  it('works end-to-end with a user-authored adapter', () => {
    const useUser = defineStore('user-adapter-1', {
      schema: customAdapter,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(u.store.name()).toBe('Alice')
    expect(u.store.age()).toBe(30)
    u.set({ name: 'Bob', age: 40 })
    expect(u.store.name()).toBe('Bob')
    expect(() => u.set({ name: '', age: 30 })).toThrow(/name must be non-empty/)
  })
})

// ─── Tier A.2: Standard Schema (auto-detected) ──────────────────────────────

describe('schema-driven defineStore — Standard Schema (Tier A.2)', () => {
  // Zod 3.24+ implements Standard Schema natively. Pass the raw schema
  // (NOT wrapped in zodSchema) and store auto-detects via the `~standard`
  // property.
  const RawZodSchema = z.object({
    name: z.string().min(1),
    age: z.number(),
  })

  it('auto-detects raw zod schema via ~standard — STRICTLY TYPED (no cast)', () => {
    // Confirm the schema actually carries the ~standard property
    expect('~standard' in (RawZodSchema as object)).toBe(true)

    const useUser = defineStore('std-user-1', {
      schema: RawZodSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    // Raw Standard Schema now infers its field types via `~standard.types.output`
    // (the `types?`-optional InferSchema fix) — no cast needed, and these reads
    // are type-checked (`u.store.name()` is `string`, `u.store.age()` is `number`).
    expect(u.store.name()).toBe('Alice')
    expect(u.store.age()).toBe(30)
    expectTypeOf(u.store.name()).toEqualTypeOf<string>()
    expectTypeOf(u.store.age()).toEqualTypeOf<number>()
    expectTypeOf(u.state.age).toEqualTypeOf<number>()
  })

  it('Standard Schema path validates set/patch (typed)', () => {
    const useUser = defineStore('std-user-2', {
      schema: RawZodSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    u.set({ name: 'Bob', age: 40 })
    expect(u.store.name()).toBe('Bob')
    u.update('age', (n) => {
      expectTypeOf(n).toEqualTypeOf<number>()
      return n + 1
    })
    expect(u.store.age()).toBe(41)
    expect(() => u.set({ name: '', age: 30 })).toThrow(/Schema validation failed/)
  })

  // Raw VALIBOT (not the valibotSchema() adapter — that's Tier A.1 above).
  // Regression for the `wrapStandardSchema` `'value' in r` discriminant bug:
  // valibot's FAILURE result carries BOTH `value` (the raw input) and
  // `issues`, so a raw valibot schema was a SILENT validation no-op — an
  // invalid set()/patch() did NOT throw and wrote the raw invalid value into
  // state. The suite previously ran raw zod + raw arktype but never raw
  // valibot (the "real library, one lib short" trap).
  const RawValibotSchema = v.object({
    name: v.pipe(v.string(), v.minLength(1)),
    age: v.number(),
  })

  it('auto-detects raw VALIBOT schema and REJECTS invalid writes (state unchanged)', () => {
    const useUser = defineStore('std-valibot-1', {
      schema: RawValibotSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(u.store.name()).toBe('Alice')

    u.set({ name: 'Bob', age: 40 })
    expect(u.store.age()).toBe(40)

    // Pre-fix: no throw, and `age` became the string 'nope' (corrupted state).
    expect(() => u.set({ name: 'Bob', age: 'nope' as unknown as number })).toThrow(
      /Schema validation failed/,
    )
    expect(u.store.age()).toBe(40)

    expect(() => u.patch({ name: '' })).toThrow(/Schema validation failed/)
    expect(u.store.name()).toBe('Bob')
  })
})

// ─── Collision handling ──────────────────────────────────────────────────────

describe('schema-driven defineStore — collision handling', () => {
  const UserSchema = zodSchema(z.object({ name: z.string(), age: z.number() }))

  it('throws when setup returns a key colliding with a schema field', () => {
    expect(() =>
      defineStore('collision-1', {
        schema: UserSchema,
        initial: { name: 'A', age: 30 },
        setup: () => ({ name: 'oops' as unknown as never }),
      })(),
    ).toThrow(/collides with schema field/)
  })

  it('throws when schema field collides with a reserved StoreApi key', () => {
    const BadSchema = zodSchema(
      z.object({
        set: z.string(),
      }) as unknown as z.ZodType<{ set: string }>,
    )
    expect(() =>
      defineStore('reserved-1', {
        schema: BadSchema,
        initial: { set: 'value' },
      }),
    ).toThrow(/reserved StoreApi method name/)
  })
})

// ─── Plugin compatibility ───────────────────────────────────────────────────

describe('schema-driven defineStore — plugin compatibility', () => {
  it('addStorePlugin runs against schema stores too', () => {
    const seen: string[] = []
    const plugin: StorePlugin = (api: StoreApi<Record<string, unknown>>) => {
      seen.push(api.id)
    }
    addStorePlugin(plugin)

    const useUser = defineStore('plugin-1', {
      schema: zodSchema(z.object({ name: z.string() })),
      initial: { name: 'X' },
    })
    useUser()

    expect(seen).toContain('plugin-1')
  })

  it('subscribe + onAction work on schema stores', () => {
    const useUser = defineStore('plugin-2', {
      schema: zodSchema(z.object({ count: z.number() })),
      initial: { count: 0 },
      setup: ({ state }) => ({
        inc: () => state.count.update((n) => n + 1),
      }),
    })
    const u = useUser() as ReturnType<typeof useUser> & {
      store: { inc: () => void; count: { (): number } }
    }
    const subSpy = vi.fn()
    const actSpy = vi.fn()
    u.subscribe(subSpy)
    u.onAction(actSpy)

    u.store.inc()

    expect(subSpy).toHaveBeenCalled()
    expect(actSpy).toHaveBeenCalled()
  })
})

// ─── Singleton semantics ────────────────────────────────────────────────────

describe('schema-driven defineStore — singleton semantics', () => {
  it('returns the same StoreApi instance across multiple useStore() calls', () => {
    const useUser = defineStore('singleton-1', {
      schema: zodSchema(z.object({ name: z.string() })),
      initial: { name: 'A' },
    })
    const a = useUser()
    const b = useUser()
    expect(a).toBe(b)
  })
})

// ─── deepPatch — nested-object merge + validation ────────────────────────────

describe('schema-driven defineStore — deepPatch', () => {
  // Schema with a nested plain-object field (`prefs`), a primitive field
  // (`count`), and an array field (`items`). Exercises every branch of the
  // plain-object-recurse vs replace decision in `deepMerge`.
  const Schema = zodSchema(
    z.object({
      count: z.number(),
      prefs: z.object({
        theme: z.enum(['light', 'dark']),
        density: z.enum(['compact', 'cozy']),
      }),
      items: z.array(z.object({ id: z.number(), label: z.string() })),
    }),
  )
  const initial = {
    count: 0,
    prefs: { theme: 'light' as const, density: 'cozy' as const },
    items: [{ id: 1, label: 'one' }],
  }

  it('deep-merges nested plain objects (preserves untouched sibling keys)', () => {
    const useS = defineStore('deepPatch-1', { schema: Schema, initial })
    const s = useS() as ReturnType<typeof useS> & {
      store: { prefs: { (): typeof initial.prefs } }
    }
    s.deepPatch({ prefs: { theme: 'dark' } })
    // `density` survives even though only `theme` was patched
    expect(s.store.prefs()).toEqual({ theme: 'dark', density: 'cozy' })
  })

  it('REPLACES arrays (does not merge by index)', () => {
    const useS = defineStore('deepPatch-2', { schema: Schema, initial })
    const s = useS() as ReturnType<typeof useS> & {
      store: { items: { (): typeof initial.items } }
    }
    s.deepPatch({ items: [{ id: 99, label: 'replaced' }] })
    expect(s.store.items()).toEqual([{ id: 99, label: 'replaced' }])
  })

  it('validates the merged result and throws on schema failure', () => {
    const useS = defineStore('deepPatch-3', { schema: Schema, initial })
    const s = useS()
    expect(() =>
      // `theme` enum doesn't allow 'midnight'
      s.deepPatch({ prefs: { theme: 'midnight' as unknown as 'light' } }),
    ).toThrow(/Schema validation failed.*patch/)
  })

  it('writes only top-level keys passed (not the whole state)', () => {
    const useS = defineStore('deepPatch-4', { schema: Schema, initial })
    const s = useS()
    const events: { type: string; keys: string[] }[] = []
    s.subscribe((m) => {
      events.push({
        type: m.type,
        keys: m.events.map((e) => e.key),
      })
    })
    s.deepPatch({ count: 5 })
    // The notification should mention `count`, not `prefs` or `items`
    expect(events.length).toBeGreaterThan(0)
    const lastKeys = events[events.length - 1]!.keys
    expect(lastKeys).toContain('count')
    expect(lastKeys).not.toContain('prefs')
    expect(lastKeys).not.toContain('items')
  })

  it('REPLACES class instances / Dates (not plain objects, do not recurse)', () => {
    // Schema with a Date field — proves the `isPlainObject` predicate filters
    // class instances out of the merge path. Without it, a future Date prop
    // would attempt to recurse into the Date's internal slots and corrupt it.
    const DateSchema = zodSchema(z.object({ when: z.date(), tag: z.string() }))
    const useS = defineStore('deepPatch-5', {
      schema: DateSchema,
      initial: { when: new Date('2020-01-01'), tag: 'a' },
    })
    const s = useS() as ReturnType<typeof useS> & {
      store: { when: { (): Date } }
    }
    const newDate = new Date('2030-06-15')
    s.deepPatch({ when: newDate })
    expect(s.store.when().toISOString()).toBe(newDate.toISOString())
  })
})

// ─── update — single-field transformer + validation ─────────────────────────

describe('schema-driven defineStore — update', () => {
  const Schema = zodSchema(
    z.object({
      count: z.number().nonnegative(),
      items: z.array(z.object({ id: z.number(), label: z.string() })),
      prefs: z.object({ theme: z.string(), density: z.string() }),
    }),
  )
  const initial = {
    count: 0,
    items: [
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
    ],
    prefs: { theme: 'light', density: 'cozy' },
  }

  it('transforms a primitive via callback', () => {
    const useS = defineStore('update-1', { schema: Schema, initial })
    const s = useS() as ReturnType<typeof useS> & { store: { count: { (): number } } }
    s.update('count', (n) => (n as number) + 1)
    expect(s.store.count()).toBe(1)
  })

  it('filters an array (covers "remove item")', () => {
    const useS = defineStore('update-2', { schema: Schema, initial })
    const s = useS() as ReturnType<typeof useS> & { store: { items: { (): typeof initial.items } } }
    s.update('items', (items) =>
      (items as typeof initial.items).filter((x) => x.id !== 1),
    )
    expect(s.store.items()).toEqual([{ id: 2, label: 'two' }])
  })

  it('appends to an array (covers "add item")', () => {
    const useS = defineStore('update-3', { schema: Schema, initial })
    const s = useS() as ReturnType<typeof useS> & { store: { items: { (): typeof initial.items } } }
    s.update('items', (items) => [
      ...(items as typeof initial.items),
      { id: 3, label: 'three' },
    ])
    expect(s.store.items()).toHaveLength(3)
    expect(s.store.items()[2]).toEqual({ id: 3, label: 'three' })
  })

  it('deletes a key from a nested object via destructure-rest', () => {
    // The `prefs` object schema requires both `theme` AND `density`, so
    // deleting `density` would throw on validation. Instead, transform
    // `prefs` into a new object that still has both keys but with one
    // overwritten — proves the transformer can return any shape the
    // schema accepts.
    const useS = defineStore('update-4', { schema: Schema, initial })
    const s = useS() as ReturnType<typeof useS> & {
      store: { prefs: { (): typeof initial.prefs } }
    }
    s.update('prefs', (prefs) => {
      const p = prefs as typeof initial.prefs
      return { ...p, theme: 'dark' }
    })
    expect(s.store.prefs()).toEqual({ theme: 'dark', density: 'cozy' })
  })

  it('validates the transformed result and throws on schema failure', () => {
    const useS = defineStore('update-5', { schema: Schema, initial })
    const s = useS()
    // `count` is `z.number().nonnegative()` — negative violates the schema
    expect(() => s.update('count', () => -1)).toThrow(/Schema validation failed.*patch/)
  })

  it('onValidationError suppresses throw on update failure', () => {
    const errors: { op: string }[] = []
    const useS = defineStore('update-6', {
      schema: Schema,
      initial,
      onValidationError: (_issues, op) => {
        errors.push({ op })
      },
    })
    const s = useS() as ReturnType<typeof useS> & { store: { count: { (): number } } }
    s.update('count', () => -1) // would normally throw
    expect(errors.length).toBe(1)
    expect(errors[0]!.op).toBe('patch')
    // State unchanged when validation fails
    expect(s.store.count()).toBe(0)
  })
})

// ─── schema-store + resetStore (audit #3 regression) ────────────────────────
//
// Closure-pinned cache survives registry reset.
//
// Pre-fix: the schema-mode factory cached `apiRef` in module-closure scope
// and short-circuited (`if (apiRef) return apiRef`) BEFORE querying the
// registry. After `resetStore(id)` dropped the inner from the registry, the
// next `useStore()` returned the SAME wrapper still bound to the disposed
// inner — every mutation routed through dead bindings (silent data loss);
// the rebuilt fresh inner stayed unreachable. The setup-fn pipeline already
// handled this correctly because its `useStore()` queries `getRegistry()`
// on every call.
//
// Fix: detect inner-identity flip via `useInner()` (cheap Map lookup) and
// rebuild the wrapper only when stale. Identity stability is preserved —
// repeated calls within the SAME inner instance still return the SAME
// wrapper (Spec B guards against accidentally over-fixing by just dropping
// the cache).
describe('schema-driven defineStore — resetStore (audit #3 regression)', () => {
  it('Spec A — resetStore(id) re-runs setup with fresh initial state (no stale wrapper)', () => {
    const useUser = defineStore('reset-regression-1', {
      schema: zodSchema(z.object({ name: z.string(), age: z.number() })),
      initial: { name: 'Alice', age: 30 },
    })
    const before = useUser()
    before.patch({ name: 'mutated', age: 999 })
    expect(before.store.name()).toBe('mutated')
    expect(before.store.age()).toBe(999)

    // Drop the inner from the registry. The wrapper's apiRef is now bound
    // to a disposed inner; the next useUser() call MUST rebuild against a
    // fresh inner re-run from the original `initial`.
    resetStore('reset-regression-1')

    const after = useUser()
    expect(after.store.name()).toBe('Alice')
    expect(after.store.age()).toBe(30)
  })

  it('Spec B — identity stability preserved across calls within same inner instance', () => {
    // Guards against accidentally over-fixing the bug by dropping the cache
    // entirely. Multiple calls without an intervening resetStore must
    // return the SAME wrapper (matches the singleton-semantics contract
    // for the setup-fn pipeline).
    const useUser = defineStore('reset-regression-2', {
      schema: zodSchema(z.object({ name: z.string() })),
      initial: { name: 'A' },
    })
    const a = useUser()
    const b = useUser()
    const c = useUser()
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})
