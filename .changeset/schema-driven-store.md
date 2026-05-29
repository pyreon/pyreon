---
'@pyreon/store': minor
'@pyreon/validation': minor
---

`@pyreon/store` adds a **schema-driven `defineStore` overload** that derives signals + types from a validation library — works with **every** validation library through two complementary tiers.

## API

```ts
import { zodSchema } from '@pyreon/validation'
import { defineStore, computed } from '@pyreon/store'
import { z } from 'zod'

const UserSchema = zodSchema(
  z.object({
    name: z.string().min(1),
    age: z.number(),
  }),
)

const useUser = defineStore('user', {
  schema: UserSchema,
  initial: { name: '', age: 0 },
  setup: ({ state, set, patch, reset }) => ({
    // state.name: Signal<string>   ← inferred from schema
    // state.age:  Signal<number>
    greet: computed(() => `Hello, ${state.name()}`),
  }),
})

const u = useUser()
u.store.name() // Signal<string> read
u.store.greet() // computed
u.set({ name: 'Alice', age: 30 }) // full replace + validate
u.patch({ age: 31 }) // partial merge + validate
u.store.age.set(-1) // direct write — bypasses validation (escape hatch)
```

## Library support

**Tier A.1 — First-party adapters** (existing in `@pyreon/validation`, extended in this release with `parse()`):

- `zodSchema(zSchema)` — Zod (any version)
- `valibotSchema(vSchema, v.safeParse)` — Valibot
- `arktypeSchema(aType)` — ArkType

**Tier A.2 — Standard Schema** (auto-detected via `'~standard'`, no adapter needed):

- Zod 3.24+
- Valibot 1.0+
- ArkType 2.0+
- Effect Schema 0.66+
- Any future Standard Schema-compliant library

**Tier B — User-authored adapter** (any other library, 5-10 lines):

- yup, joi, ajv, io-ts, runtypes, Superstruct, custom validators

## What's new in `@pyreon/validation`

`TypedSchemaAdapter` gains an optional `parse` method that returns the **coerced parsed value** (not just errors). This is what schema-stores need so that `z.string().default('Alice')` / `z.transform(...)` actually write the transformed value to signals. The existing `validator` field is unchanged — `@pyreon/form` consumers see no behavior change. The three first-party adapters (`zodSchema`, `valibotSchema`, `arktypeSchema`) all gained sync `parse` implementations.

## Validation contract

- **`set(full)` and `patch(partial)` validate.** Invalid input throws (or invokes `onValidationError` if provided). State stays at its previous value on failure.
- **Initial is validated once at defineStore-time.** Bad initial throws immediately (fail-fast). Schema defaults + transforms apply.
- **Direct signal writes bypass validation.** `store.fieldName.set(v)` is an escape hatch for hot paths (~50-200µs per zod parse). For guaranteed validation, route through `set`/`patch`.
- **Async validators are unsupported.** Schemas whose validator returns a Promise are rejected at defineStore-time. Use `@pyreon/form` for async refinements.
- **Reserved key check.** Schema fields cannot collide with reserved `StoreApi` method names (`set`, etc.) — throws at construction with named key.

## What this PR does NOT do

- Existing `defineStore(id, setupFn)` API is **unchanged**. Schema mode is a purely additive overload.
- No new package dependency (`@pyreon/store` keeps its existing `@pyreon/reactivity`-only dep tree). Schema detection is duck-typed at runtime — `'_infer' in schema` for Tier A.1, `'~standard' in schema` for Tier A.2. The type-level `InferSchema<S>` helper has no runtime cost.
- Top-level fields only get signals. Nested objects stay as values inside the parent signal (use `patch({ nested: {...} })` to mutate) — recursive signal-ization would require library-specific introspection.

## Test coverage

27 new specs (cross-library matrix: zod adapter, valibot adapter, arktype adapter, raw zod via Standard Schema, user-authored adapter) covering: type-level inference, per-field signal reads, validated `set`/`patch`, `reset` to parsed initial, schema defaults/transforms, direct-write escape hatch, async-rejection, reserved-key collision, setup/field collision, `onValidationError` suppression, plugin compat, `subscribe` + `onAction` integration, singleton semantics. All 92 existing store tests + all 40 existing validation tests still pass. Bisect-verified-with-restore: disabling the schema-mode dispatch branch fails all 27 new specs; restored → 119/119 green.
