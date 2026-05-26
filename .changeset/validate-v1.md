---
'@pyreon/validate': major
---

feat(validate): Pyreon's own validator library — Standard Schema-native, hybrid chainable + function-comp API

**This is a major rev that turns `@pyreon/validate` from a DX overlay (its previous shape — `withField` / `parseReactive` / `formatErrors` only) into a full Pyreon-owned validator runtime. The DX layer stays — it now works on top of Pyreon's own schemas AND any other Standard Schema validator (Zod 3.24+, Valibot 1.0+, ArkType 2.0+, typia, etc.).**

## What ships

### Hybrid API surface — chainable + function-comp

```ts
// Chainable (Zod-like, familiar):
import { s } from '@pyreon/validate'

const userSchema = s.object({
  name: s.string().min(2).max(50).field({ label: 'Name' }),
  email: s.string().email().field({ i18nLabel: 'auth.email' }),
  age: s.number().int().between(0, 150).optional(),
})

type User = s.Infer<typeof userSchema>

// Function-comp (Valibot-like, tree-shake-friendly):
import { object, string, number, email, min, max, int, between, optional } from '@pyreon/validate'

const userSchema = object({
  name: string().min(2).max(50).field({ label: 'Name' }),
  email: string().email().field({ i18nLabel: 'auth.email' }),
  age: number().int().between(0, 150).optional(),
})
```

Both produce identical schema instances. Internally a single `Schema<T>` class with an `_ops` list; chainable methods append; the compiler turns the ops into a single closure on first parse — chain-friendly DX, no method-dispatch cost per parse.

### v1 surface

- **Primitives**: `string`, `number`, `boolean`, `literal`, `enum` (exported as `enum_` to avoid the reserved-word collision; `s.enum` alias works)
- **Composition**: `object`, `array`
- **Modifiers**: `optional`, `nullable`, `nullish`, `default`, `transform`, `refine`, `brand`, `describe`, `field`
- **String checks**: `min`, `max`, `length`, `nonEmpty`, `regex`, `email`, `url`, `uuid`, `iso.date`, `iso.dateTime`, `iso.time`, `startsWith`, `endsWith`, `includes`
- **Number checks**: `min`, `max`, `int`, `finite`, `positive`, `negative`, `nonNegative`, `nonPositive`, `between`, `multipleOf`
- **Array checks**: `min`, `max`, `length`, `nonEmpty`
- **Parse entry points**: `.parse(input)` → `Result<T, Issue[]>` (no throw); `.parseOrThrow(input)` → `T` (throws `ValidationError`); `.safeParse(input)` (Zod-compat alias); `.parseAsync(input)` for async refines; `~standard.validate(input)` for Standard Schema interop
- **Type helpers**: `Infer<S>`, `Input<S>`, `Output<S>`
- **DX layer (unchanged from prior shape)**: `withField` / `getMeta` / `resolveMetaField`, `parseReactive` / `parseReactiveAsync` / `watchValid`, `formatError` / `formatErrors` / `formatErrorsByPath`

### Standard Schema-native

Every schema implements `StandardSchemaV1` directly. This means:

- Existing `@pyreon/form` (which accepts StdSchema via `bindSchema()` in `@pyreon/validation`) works with Pyreon-validate schemas with zero adapter overhead.
- DX helpers (`withField` / `parseReactive` / `formatErrors`) work on Pyreon-validate schemas AND any other StdSchema validator — full backward compat for users who already have Zod / Valibot / ArkType schemas.
- A future compiler-emit PR can target any Standard Schema validator (Pyreon-validate or external) — the `_compiled` sidecar contract is generic.

### Issues carry i18n keys natively

Every built-in check emits issues with pre-populated `code` / `key` / `params` / `fallback`. `s.string().min(2).parse('a')` produces:

```ts
{
  ok: false,
  issues: [{
    code: 'too_small',
    key: 'validate.string.too-short',
    params: { min: 2, actual: 1 },
    fallback: 'Must be at least 2 characters',
    message: 'Must be at least 2 characters',
    path: [],
  }]
}
```

Apps pipe `result.issues` through `formatErrors(issues, t)` from `@pyreon/i18n` to get translated strings.

### Tests + validation

- **113 tests** covering primitives × checks × composition × modifiers × parse paths × hybrid-API parity × cross-lib StdSchema compat (Pyreon-validate schemas plugged into `@pyreon/validation`'s `wrapStandardSchema`).
- **Typecheck + lint + repo-wide gates** all green.
- **3 bisect-verified specs**: string type-check disabled → 4 specs fail; optional/nullish modifier prelude disabled → 4 specs fail; object unknown-key stripping disabled → 1 spec fails.
- Bundle size **4.41 KB gz** (locked at 5.5 KB with 25% headroom).

### Out of scope (deliberate v1 deferrals)

- **PR #2 — Compiler-emit.** `@pyreon/compiler:analyzeValidate()` emits typia-class specialized validators per schema at build time, working against any Standard Schema validator. Plan documented in `.claude/plans/synchronous-chasing-puffin.md`.
- **PR #3 — Composition surface.** `tuple`, `record`, `union`, `discriminate`, `intersection`; primitive `date`, `bigint`, `null`/`undefined`/`void`; modifiers `.pick`, `.omit`, `.partial`, `.required`, `.extend`, `.merge`, `.coerce`.
- **PR #4 — `@pyreon/feature` migration.** `defineFeature` defaults to Pyreon-validate schemas; existing Zod adapter remains.
- **PR #5 — `@pyreon/zero` loader integration.** Loaders / search-param validators take Pyreon-validate or any StdSchema directly.

## Supersedes PR #952

PR #952 introduced `@pyreon/validate` as a DX-only overlay on top of any Standard Schema validator. This PR keeps every line of that DX code (it's verbatim — `withField` / `parseReactive` / `formatErrors` and their 53 tests) AND adds the actual validator runtime. PR #952 is closed in favor of this PR.
