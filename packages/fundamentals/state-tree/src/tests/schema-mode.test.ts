/**
 * Schema-mode `model({ schema, initial })` coverage.
 *
 * Cross-library matrix:
 *   - Zod via `zodSchema()` (Pyreon adapter — Tier A.1)
 *   - Valibot via `valibotSchema()` (Pyreon adapter — Tier A.1)
 *   - ArkType via `arktypeSchema()` (Pyreon adapter — Tier A.1)
 *   - Raw zod via Standard Schema auto-detection (Tier A.2)
 *   - User-authored adapter (Tier B)
 *
 * Behavioral assertions:
 *   - Field signals inferred from schema
 *   - `set` validates + replaces atomically
 *   - `patch` validates merged + writes only changed
 *   - `reset` restores parsed initial
 *   - Direct signal write bypasses validation (documented escape hatch)
 *   - Bad initial throws at create-time (or invokes onValidationError)
 *   - Async validator rejected at create-time
 *   - Schema defaults / transforms apply (parsed value written to signals)
 *   - Reserved-key collision throws
 *   - Chained .views() / .actions() compose with schema mode
 *   - set / patch / reset available on self inside actions
 */
import { arktypeSchema } from '@pyreon/validation/arktype'
import { valibotSchema } from '@pyreon/validation/valibot'
import { zodSchema } from '@pyreon/validation/zod'
import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { model } from '../model'

// ─── Tier A.1: Zod via zodSchema() ──────────────────────────────────────────

describe('schema-mode model — zod (TypedSchemaAdapter / Tier A.1)', () => {
  const UserSchema = zodSchema(
    z.object({
      name: z.string().min(1),
      age: z.number(),
    }),
  )

  it('exposes per-field signals from the parsed initial', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      age: { (): number }
    }
    expect(u.name()).toBe('Alice')
    expect(u.age()).toBe(30)
  })

  it('set validates and replaces atomically', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      age: { (): number }
      set: (next: { name: string; age: number }) => void
    }
    u.set({ name: 'Bob', age: 40 })
    expect(u.name()).toBe('Bob')
    expect(u.age()).toBe(40)
  })

  it('set with invalid input throws (state unchanged)', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      set: (next: { name: string; age: number }) => void
    }
    expect(() => u.set({ name: '', age: 30 })).toThrow(/Schema validation failed/)
    expect(u.name()).toBe('Alice')
  })

  it('patch validates merged + writes only changed fields', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      age: { (): number }
      patch: (partial: Partial<{ name: string; age: number }>) => void
    }
    u.patch({ age: 31 })
    expect(u.age()).toBe(31)
    expect(u.name()).toBe('Alice')
  })

  it('reset restores parsed initial', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      age: { (): number }
      set: (next: { name: string; age: number }) => void
      reset: () => void
    }
    u.set({ name: 'Bob', age: 99 })
    u.reset()
    expect(u.name()).toBe('Alice')
    expect(u.age()).toBe(30)
  })

  it('throws at create-time when initial is invalid', () => {
    expect(() =>
      model({
        schema: UserSchema,
        initial: { name: '', age: 30 },
      }),
    ).toThrow(/Schema validation failed/)
  })

  it('onValidationError suppresses create()-time throw + falls back to parsed initial', () => {
    const errors: { op: string }[] = []
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
      onValidationError: (_issues, op) => {
        errors.push({ op })
      },
    })
    const u = User.create({ name: '', age: 30 }) as ReturnType<typeof User.create> & {
      name: { (): string }
      age: { (): number }
    }
    expect(errors.length).toBe(1)
    expect(errors[0]!.op).toBe('init')
    expect(u.name()).toBe('Alice')
    expect(u.age()).toBe(30)
  })

  it('create()-time validation re-throws when no parsed initial fallback exists', () => {
    const errors: { op: string }[] = []
    const User = model({
      schema: UserSchema,
      onValidationError: (_issues, op) => {
        errors.push({ op })
      },
    })
    expect(() => User.create({ name: '', age: 30 })).toThrow(/Schema validation failed/)
    expect(errors.length).toBe(1)
  })

  it('direct signal write bypasses validation (documented escape hatch)', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string; set: (v: string) => void }
    }
    // schema requires name.min(1), but direct write doesn't check
    u.name.set('')
    expect(u.name()).toBe('')
  })

  it('schema defaults apply (z.string().default(...))', () => {
    const WithDefault = zodSchema(
      z.object({
        name: z.string().default('Default'),
        age: z.number(),
      }),
    )
    const M = model({
      schema: WithDefault,
      initial: { name: undefined as unknown as string, age: 30 },
    })
    const m = M.create() as ReturnType<typeof M.create> & {
      name: { (): string }
    }
    expect(m.name()).toBe('Default')
  })

  it('onValidationError suppresses throw on set', () => {
    const errors: { op: string }[] = []
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
      onValidationError: (_issues, op) => {
        errors.push({ op })
      },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      set: (next: { name: string; age: number }) => void
    }
    u.set({ name: '', age: 30 }) // would normally throw
    expect(errors.length).toBe(1)
    expect(errors[0]!.op).toBe('set')
    expect(u.name()).toBe('Alice') // unchanged
  })
})

// ─── Tier A.1: Valibot ──────────────────────────────────────────────────────

describe('schema-mode model — valibot (Tier A.1)', () => {
  const UserSchema = valibotSchema<{ name: string; age: number }>(
    v.object({
      name: v.pipe(v.string(), v.minLength(1)),
      age: v.number(),
    }),
    v.safeParse,
  )

  it('exposes per-field signals from valibot schema', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
    }
    expect(u.name()).toBe('Alice')
  })

  it('async safeParseAsync passed by mistake throws at definition time', () => {
    const AsyncSchema = valibotSchema<{ name: string }>(
      v.object({ name: v.string() }),
      v.safeParseAsync,
    )
    expect(() =>
      model({
        schema: AsyncSchema,
        initial: { name: 'X' },
      }),
    ).toThrow(/async|Promise/i)
  })
})

// ─── Tier A.1: ArkType ──────────────────────────────────────────────────────

describe('schema-mode model — arktype (Tier A.1)', () => {
  const UserType = type({
    name: 'string > 0',
    age: 'number',
  })
  const UserSchema = arktypeSchema<{ name: string; age: number }>(
    UserType as unknown as (data: unknown) => unknown,
  )

  it('exposes per-field signals from arktype schema', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
    }
    expect(u.name()).toBe('Alice')
  })

  it('set with invalid input throws', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      set: (next: { name: string; age: number }) => void
    }
    expect(() => u.set({ name: '', age: 30 })).toThrow(/Schema validation failed/)
  })
})

// ─── Tier A.2: Raw zod via Standard Schema auto-detection ───────────────────

describe('schema-mode model — Standard Schema (Tier A.2)', () => {
  const RawSchema = z.object({
    name: z.string().min(1),
    age: z.number(),
  })

  it('auto-detects raw zod schema via the `~standard` property', () => {
    expect('~standard' in (RawSchema as object)).toBe(true)
    const User = model({
      schema: RawSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as Record<string, { (): unknown }>
    expect(u.name!()).toBe('Alice')
    expect(u.age!()).toBe(30)
  })

  it('Standard Schema path validates set / patch', () => {
    const User = model({
      schema: RawSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as unknown as Record<string, unknown> & {
      set: (next: { name: string; age: number }) => void
      name: { (): string }
    }
    u.set({ name: 'Bob', age: 40 })
    expect(u.name()).toBe('Bob')
    expect(() => u.set({ name: '', age: 30 })).toThrow(/Schema validation failed/)
  })
})

// ─── Tier B: User-authored adapter ──────────────────────────────────────────

describe('schema-mode model — user-authored adapter (Tier B)', () => {
  type UserShape = { name: string; age: number }
  // Minimal user-authored adapter mimicking a "yup-like" library API.
  const customAdapter = {
    _infer: undefined as unknown as UserShape,
    validator: async () => ({}) as never,
    parse: (value: unknown) => {
      const u = value as UserShape
      const issues: { path: string; message: string }[] = []
      if (typeof u?.name !== 'string' || u.name.length === 0) {
        issues.push({ path: 'name', message: 'name must be non-empty string' })
      }
      if (typeof u?.age !== 'number') {
        issues.push({ path: 'age', message: 'age must be number' })
      }
      if (issues.length > 0) return { ok: false as const, issues }
      return { ok: true as const, value: u }
    },
  }

  it('works end-to-end with a user-authored adapter', () => {
    const User = model({
      schema: customAdapter,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as unknown as Record<string, unknown> & {
      name: { (): string }
      age: { (): number }
      set: (next: UserShape) => void
    }
    expect(u.name()).toBe('Alice')
    expect(u.age()).toBe(30)
    u.set({ name: 'Bob', age: 40 })
    expect(u.name()).toBe('Bob')
    expect(() => u.set({ name: '', age: 30 })).toThrow(/name must be non-empty/)
  })
})

// ─── Schema mode + chainable composition ────────────────────────────────────

describe('schema-mode model — chainable views/actions', () => {
  const UserSchema = zodSchema(
    z.object({
      name: z.string().min(1),
      age: z.number(),
    }),
  )

  it('chained .views() and .actions() see schema $-helpers via self', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
      .views((self) => ({
        greeting: () => `Hi, ${self.name()}`,
      }))
      .actions((self) => ({
        // self.patch is callable inside actions (schema-mode adds helpers).
        rename: (next: string) =>
          (self.patch as (p: Partial<{ name: string; age: number }>) => void)({
            name: next,
          }),
      }))
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      greeting: () => string
      rename: (n: string) => void
    }
    expect(u.greeting()).toBe('Hi, Alice')
    u.rename('Bob')
    expect(u.name()).toBe('Bob')
    expect(u.greeting()).toBe('Hi, Bob')
  })

  it('actions calling patch with invalid value throws + leaves state intact', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
      .actions((self) => ({
        rename: (next: string) =>
          (self.patch as (p: Partial<{ name: string; age: number }>) => void)({
            name: next,
          }),
      }))
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      rename: (n: string) => void
    }
    expect(() => u.rename('')).toThrow(/Schema validation failed/)
    expect(u.name()).toBe('Alice')
  })
})

// ─── Reserved-name collision check ──────────────────────────────────────────

describe('schema-mode model — reserved mutation-helper names', () => {
  it('throws at .create() time when schema declares a field named `set`', () => {
    const SchemaWithSet = zodSchema(
      z.object({ set: z.string() }) as unknown as z.ZodType<{ set: string }>,
    )
    const M = model({ schema: SchemaWithSet, initial: { set: 'oops' } })
    expect(() => M.create()).toThrow(/collides with a reserved mutation helper/)
  })

  it('throws when schema field is `patch`', () => {
    const SchemaWithPatch = zodSchema(
      z.object({ patch: z.string() }) as unknown as z.ZodType<{ patch: string }>,
    )
    const M = model({ schema: SchemaWithPatch, initial: { patch: 'oops' } })
    expect(() => M.create()).toThrow(/collides with a reserved mutation helper/)
  })

  it('throws when schema field is `deepPatch` / `update` / `reset`', () => {
    for (const name of ['deepPatch', 'update', 'reset'] as const) {
      const S = zodSchema(
        z.object({ [name]: z.string() }) as unknown as z.ZodType<
          Record<string, string>
        >,
      )
      const M = model({ schema: S, initial: { [name]: 'oops' } })
      expect(() => M.create()).toThrow(
        /collides with a reserved mutation helper/,
      )
    }
  })

  it('throws when an .actions() factory tries to define a reserved name', () => {
    const Schema = zodSchema(z.object({ count: z.number() }))
    const Bad = model({ schema: Schema, initial: { count: 0 } }).actions(
      () => ({
        // `set` would shadow the installed schema-mode helper.
        set: () => {},
      }),
    )
    expect(() => Bad.create()).toThrow(
      /collides with a reserved schema-mode mutation helper/,
    )
  })

  it('plain mode (no schema) allows actions named `set` / `reset` — no collision', () => {
    // Reserved names only apply in schema mode; plain models have no
    // installed mutation helpers, so user actions named `reset` / `set`
    // are still fine.
    const Counter = model({ state: { count: 0 } }).actions((self) => ({
      reset: () => self.count.set(0),
      set: (n: number) => self.count.set(n),
    }))
    const c = Counter.create({ count: 5 }) as ReturnType<typeof Counter.create> & {
      reset: () => void
      set: (n: number) => void
      count: { (): number }
    }
    c.set(10)
    expect(c.count()).toBe(10)
    c.reset()
    expect(c.count()).toBe(0)
  })
})

// ─── deepPatch — recursive plain-object merge ──────────────────────────────

describe('schema-mode model — deepPatch (nested merge)', () => {
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
    const M = model({ schema: Schema, initial })
    const m = M.create() as ReturnType<typeof M.create> & {
      prefs: { (): typeof initial.prefs }
      deepPatch: (p: { prefs?: { theme?: string } }) => void
    }
    m.deepPatch({ prefs: { theme: 'dark' } })
    // `density` survives even though only `theme` was patched.
    expect(m.prefs()).toEqual({ theme: 'dark', density: 'cozy' })
  })

  it('REPLACES arrays (does not merge by index)', () => {
    const M = model({ schema: Schema, initial })
    const m = M.create() as ReturnType<typeof M.create> & {
      items: { (): typeof initial.items }
      deepPatch: (p: { items?: typeof initial.items }) => void
    }
    m.deepPatch({ items: [{ id: 99, label: 'replaced' }] })
    expect(m.items()).toEqual([{ id: 99, label: 'replaced' }])
  })

  it('validates merged result + throws on schema failure', () => {
    const M = model({ schema: Schema, initial })
    const m = M.create() as ReturnType<typeof M.create> & {
      deepPatch: (p: { prefs?: { theme?: string } }) => void
    }
    expect(() =>
      m.deepPatch({ prefs: { theme: 'midnight' as 'light' | 'dark' } }),
    ).toThrow(/Schema validation failed.*deepPatch/)
  })

  it('REPLACES class instances (Date) — does not recurse into prototype-bearing objects', () => {
    const DateSchema = zodSchema(z.object({ when: z.date(), tag: z.string() }))
    const M = model({
      schema: DateSchema,
      initial: { when: new Date('2020-01-01'), tag: 'a' },
    })
    const m = M.create() as ReturnType<typeof M.create> & {
      when: { (): Date }
      deepPatch: (p: { when?: Date }) => void
    }
    const newDate = new Date('2030-06-15')
    m.deepPatch({ when: newDate })
    expect(m.when().toISOString()).toBe(newDate.toISOString())
  })

  it('onValidationError suppresses throw + leaves state intact', () => {
    const errors: { op: string }[] = []
    const M = model({
      schema: Schema,
      initial,
      onValidationError: (_issues, op) => {
        errors.push({ op })
      },
    })
    const m = M.create() as ReturnType<typeof M.create> & {
      prefs: { (): typeof initial.prefs }
      deepPatch: (p: { prefs?: { theme?: string } }) => void
    }
    m.deepPatch({ prefs: { theme: 'midnight' as 'light' | 'dark' } })
    expect(errors.length).toBe(1)
    expect(errors[0]!.op).toBe('deepPatch')
    expect(m.prefs()).toEqual({ theme: 'light', density: 'cozy' })
  })
})

// ─── update — single-field transformer ─────────────────────────────────────

describe('schema-mode model — update (single-field transformer)', () => {
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
    const M = model({ schema: Schema, initial })
    const m = M.create() as ReturnType<typeof M.create> & {
      count: { (): number }
      update: (
        key: 'count' | 'items' | 'prefs',
        fn: (current: unknown) => unknown,
      ) => void
    }
    m.update('count', (n) => (n as number) + 1)
    expect(m.count()).toBe(1)
  })

  it('filters an array (covers "remove item")', () => {
    const M = model({ schema: Schema, initial })
    const m = M.create() as ReturnType<typeof M.create> & {
      items: { (): typeof initial.items }
      update: (
        key: 'count' | 'items' | 'prefs',
        fn: (current: unknown) => unknown,
      ) => void
    }
    m.update('items', (items) =>
      (items as typeof initial.items).filter((x) => x.id !== 1),
    )
    expect(m.items()).toEqual([{ id: 2, label: 'two' }])
  })

  it('appends to an array (covers "add item")', () => {
    const M = model({ schema: Schema, initial })
    const m = M.create() as ReturnType<typeof M.create> & {
      items: { (): typeof initial.items }
      update: (
        key: 'count' | 'items' | 'prefs',
        fn: (current: unknown) => unknown,
      ) => void
    }
    m.update('items', (items) => [
      ...(items as typeof initial.items),
      { id: 3, label: 'three' },
    ])
    expect(m.items()).toHaveLength(3)
    expect(m.items()[2]).toEqual({ id: 3, label: 'three' })
  })

  it('transforms a nested object (covers "object key edit")', () => {
    const M = model({ schema: Schema, initial })
    const m = M.create() as ReturnType<typeof M.create> & {
      prefs: { (): typeof initial.prefs }
      update: (
        key: 'count' | 'items' | 'prefs',
        fn: (current: unknown) => unknown,
      ) => void
    }
    m.update('prefs', (prefs) => ({
      ...(prefs as typeof initial.prefs),
      theme: 'dark',
    }))
    expect(m.prefs()).toEqual({ theme: 'dark', density: 'cozy' })
  })

  it('validates the transformed result + throws on schema failure', () => {
    const M = model({ schema: Schema, initial })
    const m = M.create() as ReturnType<typeof M.create> & {
      update: (
        key: 'count' | 'items' | 'prefs',
        fn: (current: unknown) => unknown,
      ) => void
    }
    // count is z.number().nonnegative() — negative violates the schema
    expect(() => m.update('count', () => -1)).toThrow(
      /Schema validation failed.*update/,
    )
  })

  it('onValidationError suppresses throw + state unchanged', () => {
    const errors: { op: string }[] = []
    const M = model({
      schema: Schema,
      initial,
      onValidationError: (_issues, op) => {
        errors.push({ op })
      },
    })
    const m = M.create() as ReturnType<typeof M.create> & {
      count: { (): number }
      update: (
        key: 'count' | 'items' | 'prefs',
        fn: (current: unknown) => unknown,
      ) => void
    }
    m.update('count', () => -1)
    expect(errors.length).toBe(1)
    expect(errors[0]!.op).toBe('update')
    expect(m.count()).toBe(0)
  })

  it('update inside an async action awaits + validates each step', async () => {
    const M = model({ schema: Schema, initial }).actions((self) => ({
      async asyncIncrement() {
        await Promise.resolve()
        ;(
          self.update as (
            key: 'count',
            fn: (c: unknown) => unknown,
          ) => void
        )('count', (n) => (n as number) + 1)
        await Promise.resolve()
        ;(
          self.update as (
            key: 'count',
            fn: (c: unknown) => unknown,
          ) => void
        )('count', (n) => (n as number) + 1)
      },
    }))
    const m = M.create() as ReturnType<typeof M.create> & {
      count: { (): number }
      asyncIncrement: () => Promise<void>
    }
    await m.asyncIncrement()
    expect(m.count()).toBe(2)
  })
})
