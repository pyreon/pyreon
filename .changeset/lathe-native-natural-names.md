---
'@pyreon/lathe': patch
---

Native modules (`target: 'multiplatform'`) name each model's schema after the model again — `export const Pet = s.object(…)` beside `export type Pet`, the same as the web output — instead of `pet_schema`. The `_schema` suffix existed only because Swift and Kotlin have one namespace, and `@pyreon/native-compiler` now separates a value from a same-named type itself. Regenerate to pick it up; anything importing `<model>_schema` from a generated `.native.tsx` module must switch to the model name.
