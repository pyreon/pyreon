---
'@pyreon/feature': minor
---

`defineFeature` now lowers a Zod-style object literal schema on iOS and Android. `schema: z.object({ id: z.string(), done: z.boolean() })` emits the same schema struct and `name` + `initialValues` binding as the literal field-type map, instead of drawing the Tier-2 diagnostic. The declaration carries each field's type only, so a chain method it cannot carry (`.min()`, `.email()`, `.optional()`, …) is reported by name and is not enforced on device; `.int()` is carried (a number field is a native `Int`). A non-scalar validator field (`z.array(…)`) is dropped by name while its siblings survive, and a schema held in a variable, `v.pipe(…)` or ArkType still falls through.
