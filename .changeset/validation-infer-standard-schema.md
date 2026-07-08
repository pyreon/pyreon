---
"@pyreon/validation": patch
---

`InferSchema<S>` now resolves the field types of a **raw Standard Schema** (a `zod` / `valibot` / `arktype` object passed directly, without a `zodSchema()`-style wrapper). Standard Schema's `types` phantom is optional per the spec (`types?: { input; output }`), and the conditional matched a *required* `types` — so it never hit for any real schema and every raw-schema consumer silently collapsed to the `Record<string, unknown>` fallback.

This makes the universal-schema path in `@pyreon/store` and `@pyreon/state-tree` actually **strictly typed**: `defineStore(id, { schema: z.object({ … }), initial })` (raw schema, any Standard-Schema library) now infers its field types end-to-end, with no cast. The Pyreon-adapter path (`zodSchema(…)` via `_infer`) was already correct and is unchanged. Locked by `schema-infer.types.test.ts` (raw zod/valibot/arktype all infer their exact shape).
