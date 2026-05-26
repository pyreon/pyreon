---
'@pyreon/validate': patch
---

feat(validate): introduce `@pyreon/validate` — Pyreon DX overlay on Standard Schema

New package: a tiny (~1-2KB gz) DX layer that runs on top of any [Standard Schema](https://standardschema.dev)-compliant validator (Zod 3.24+, Valibot 1.0+, ArkType 2.0+, typia, …). Pyreon does NOT ship its own validator runtime — use whichever library you prefer; `@pyreon/validate` adds three things on top that the spec deliberately omits, plus Pyreon-native bridges:

**`withField(schema, meta)` — field metadata channel.** Attach `label`, `hint`, `placeholder`, `i18nLabel`/`i18nHint`/`i18nPlaceholder`, `autoFocus`, `autoComplete`, `defaultValue` to any Standard Schema. The returned schema is the same reference — Pyreon mutates a Symbol-keyed non-enumerable slot in place. Mutation (rather than cloning) is required because ArkType's `Type` instances are callable functions whose `~standard.validate` does `this(input)` — a shallow clone breaks that contract. Symbol-keyed non-enumerable mutation is invisible to `JSON.stringify`, `for…in`, `Object.keys`, library-internal comparators. Safe.

**`parseReactive(schema, source)` — signal-driven re-validation.** Returns `Computed<ParseResult>` that re-derives on every signal/accessor change. Sync variant; `parseReactiveAsync` handles schemas with async refinements. `watchValid(schema, source, callback)` fires only on validity transitions (not every error-message change).

**`formatErrors(issues, t)` — i18n-key-aware error rendering.** Pyreon issues carry optional `{ key, params, fallback }`; `formatErrors(issues, t)` resolves keys via the `t` function from `useI18n()`, falling back to `fallback` then `message`. Bare Standard Schema issues (no i18n key) fall through to `message` — works with raw Zod/Valibot/ArkType output too.

Existing `@pyreon/validation`'s `zodSchema()` / `valibotSchema()` / `arktypeSchema()` adapters remain unchanged — no breaking change for current users. `@pyreon/validate` is purely additive.

Out of scope (explicit follow-up PRs):
- Form integration: `useForm` reading per-field metadata from a schema (requires per-lib sub-schema extraction).
- `@pyreon/feature` migration: `defineFeature` preferring `getMeta()` over the `nameToLabel` heuristic.
- Compiler-emit: `@pyreon/compiler:analyzeValidate()` emitting typia-class specialized validators per schema (the "much faster" follow-up).
