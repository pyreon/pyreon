---
'@pyreon/feature': patch
'@pyreon/native-compiler': patch
---

`@pyreon/feature` declares the native frontend it already had

`defineFeature({ name, schema })` with the literal field-type map has been
lowering to a Codable struct plus a module-scope const (`name`,
`initialValues`) on both targets — but the manifest still said the package had
NO native emit, so the compiler's derived web-only set kept warning about it and
the coverage registry counted it as an open gap.

The declaration half now says what it does, and the runtime half (the generated
CRUD hooks, the fetcher, validator/form integration) is scoped honestly as the
part that stays web. A runtime schema (Zod / Valibot / ArkType) is still not
introspected and warns by name.

Native app-runtime coverage: 34/37 → 35/37.
