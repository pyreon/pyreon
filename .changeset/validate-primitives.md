---
"@pyreon/validate": minor
---

Add missing primitives to the `s` validator: `date` (with `.min`/`.max`), `bigint`
(with `.min`/`.max`/`.positive`/`.negative`/`.multipleOf`), `null`, `undefined`,
`void`, `nan`, `symbol`, `any`, `unknown`. Each is fully type-inferred (`Infer<S>`
yields the exact TS type) and available on the `s.` namespace + as named exports.
Closes the primitive-coverage gap vs Zod/Valibot from the validation audit.
