---
"@pyreon/feature": minor
---

`defineFeature({ schema: z.object({ … }) })` now crosses to iOS and Android with its validators: `Todo.schema.safeParse(x)` lowers to the schema struct `@pyreon/validation` emits, so `.min()`, `.max()`, `.email()`, `.url()`, `.uuid()`, `.regex()`, `.int()` and `.optional()` are enforced on device and the result carries the web's `{ success, data }`. Previously the native declaration held field types only and those constraints were reported as lost. `.parse()` (it throws) and constraints no struct can carry (`.refine()`, `.transform()`, `.default()`) are still reported by name.
