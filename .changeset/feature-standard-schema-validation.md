---
"@pyreon/feature": minor
---

fix(feature): validation now works for Valibot / ArkType (any Standard Schema), not just Zod

`defineFeature`'s `createValidator` only recognised Zod (it gated on `safeParseAsync`), so a Valibot or ArkType schema silently received **no** form validation despite the documented "Zod / Valibot / ArkType" support — the form reported valid while the schema rejected (the silent-schema-drop class). It now routes any Standard Schema (`~standard`) through `@pyreon/validation`'s `standardSchemaToValidator`, and — unlike `isStandardSchema` — accepts **callable** schemas, so ArkType's `type(...)` (a function carrying `~standard`) is detected too. Errors surface on the right field.

Honest boundary: field **introspection** (`extractFields` → auto form fields, table columns, create-form defaults) remains **Zod-only** — there is no cross-library shape-introspection standard. A non-Zod feature now emits a one-time dev warning naming the fix (supply `initialValues` explicitly; build tables via `@pyreon/table` directly) instead of the confusing downstream `[@pyreon/form] Field … does not exist` crash. The query hooks (`useList`/`useById`/`useSearch`/`useCreate`/`useUpdate`/`useDelete`) and `useStore` are schema-agnostic and work with every validator.

All new tests exercise the real composed primitives (real `QueryClient` + `mount` + `@pyreon/form` + `@pyreon/table`) with real Zod, Valibot, and ArkType schemas.
