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
 *   - `$set` validates + replaces atomically
 *   - `$patch` validates merged + writes only changed
 *   - `$reset` restores parsed initial
 *   - Direct signal write bypasses validation (documented escape hatch)
 *   - Bad initial throws at create-time (or invokes onValidationError)
 *   - Async validator rejected at create-time
 *   - Schema defaults / transforms apply (parsed value written to signals)
 *   - Reserved-key collision throws
 *   - Chained .views() / .actions() compose with schema mode
 *   - $set / $patch / $reset available on self inside actions
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

  it('$set validates and replaces atomically', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      age: { (): number }
      $set: (next: { name: string; age: number }) => void
    }
    u.$set({ name: 'Bob', age: 40 })
    expect(u.name()).toBe('Bob')
    expect(u.age()).toBe(40)
  })

  it('$set with invalid input throws (state unchanged)', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      $set: (next: { name: string; age: number }) => void
    }
    expect(() => u.$set({ name: '', age: 30 })).toThrow(/Schema validation failed/)
    expect(u.name()).toBe('Alice')
  })

  it('$patch validates merged + writes only changed fields', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      age: { (): number }
      $patch: (partial: Partial<{ name: string; age: number }>) => void
    }
    u.$patch({ age: 31 })
    expect(u.age()).toBe(31)
    expect(u.name()).toBe('Alice')
  })

  it('$reset restores parsed initial', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      name: { (): string }
      age: { (): number }
      $set: (next: { name: string; age: number }) => void
      $reset: () => void
    }
    u.$set({ name: 'Bob', age: 99 })
    u.$reset()
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

  it('onValidationError suppresses throw on $set', () => {
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
      $set: (next: { name: string; age: number }) => void
    }
    u.$set({ name: '', age: 30 }) // would normally throw
    expect(errors.length).toBe(1)
    expect(errors[0]!.op).toBe('$set')
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

  it('$set with invalid input throws', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as ReturnType<typeof User.create> & {
      $set: (next: { name: string; age: number }) => void
    }
    expect(() => u.$set({ name: '', age: 30 })).toThrow(/Schema validation failed/)
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

  it('Standard Schema path validates $set / $patch', () => {
    const User = model({
      schema: RawSchema,
      initial: { name: 'Alice', age: 30 },
    })
    const u = User.create() as unknown as Record<string, unknown> & {
      $set: (next: { name: string; age: number }) => void
      name: { (): string }
    }
    u.$set({ name: 'Bob', age: 40 })
    expect(u.name()).toBe('Bob')
    expect(() => u.$set({ name: '', age: 30 })).toThrow(/Schema validation failed/)
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
      $set: (next: UserShape) => void
    }
    expect(u.name()).toBe('Alice')
    expect(u.age()).toBe(30)
    u.$set({ name: 'Bob', age: 40 })
    expect(u.name()).toBe('Bob')
    expect(() => u.$set({ name: '', age: 30 })).toThrow(/name must be non-empty/)
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
        // self.$patch is callable inside actions (schema-mode adds helpers).
        rename: (next: string) =>
          (self.$patch as (p: Partial<{ name: string; age: number }>) => void)({
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

  it('actions calling $patch with invalid value throws + leaves state intact', () => {
    const User = model({
      schema: UserSchema,
      initial: { name: 'Alice', age: 30 },
    })
      .actions((self) => ({
        rename: (next: string) =>
          (self.$patch as (p: Partial<{ name: string; age: number }>) => void)({
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
