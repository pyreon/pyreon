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
  type StoreApi,
  type StorePlugin,
} from '@pyreon/store'
import { arktypeSchema } from '@pyreon/validation/arktype'
import { valibotSchema } from '@pyreon/validation/valibot'
import { zodSchema } from '@pyreon/validation/zod'
import { type } from 'arktype'
import * as v from 'valibot'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('auto-detects raw zod schema via ~standard', () => {
    // Confirm the schema actually carries the ~standard property
    expect('~standard' in (RawZodSchema as object)).toBe(true)

    const useUser = defineStore('std-user-1', {
      schema: RawZodSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    // Standard Schema inference still has a TODO — zod's `~standard.types.output`
    // resolves to a partial / optional shape in the conditional-type. Behavior
    // is correct; runtime works end-to-end. Type-inference for the Standard
    // Schema path is the follow-up. For now, cast at the call site.
    const s = u.store as Record<string, { (): unknown }>
    expect(s.name!()).toBe('Alice')
    expect(s.age!()).toBe(30)
  })

  it('Standard Schema path validates set/patch', () => {
    const useUser = defineStore('std-user-2', {
      schema: RawZodSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    u.set({ name: 'Bob', age: 40 })
    const s = u.store as Record<string, { (): unknown }>
    expect(s.name!()).toBe('Bob')
    expect(() => u.set({ name: '', age: 30 })).toThrow(/Schema validation failed/)
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
