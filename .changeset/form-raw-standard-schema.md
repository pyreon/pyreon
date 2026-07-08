---
"@pyreon/form": minor
---

`useForm({ schema })` now accepts a **raw Standard Schema** (zod ≥3.24 / valibot ≥1 / arktype ≥2 / `@pyreon/validate`'s `s`) directly — no `zodSchema()` adapter and no `as never` cast. The validation contract and Standard Schema bridge moved to `@pyreon/validation` (the universal validation gate); `@pyreon/form` depends on it and re-exports `ValidationError` / `ValidateFn` / `SchemaValidateFn` for back-compat, so existing `import { ValidationError } from '@pyreon/form'` keeps working.
