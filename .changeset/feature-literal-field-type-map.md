---
'@pyreon/feature': minor
---

`defineFeature` reads the literal field-type map, the one schema form that crosses to native

`@pyreon/native-compiler` introspects `schema: { id: 'string', done: 'boolean' }`
and emits a Codable struct from it. A runtime Zod / Valibot / ArkType schema is
NOT introspected there and warns by name — so the literal map is the form the
multiplatform docs prescribe for a feature that has to run on all three targets.

On the web that form produced ZERO fields: no auto form fields, no table
columns, no create defaults. The one shape that crosses was inert on the target
it was written for.

`extractFields` now recognizes it, gated on EVERY value being a known field-type
name so a real schema can never be mistaken for one — and `FeatureConfig.schema`
accepts it, so the documented shape typechecks instead of needing a cast.
