---
"@pyreon/form": patch
---

fix(form): detect callable Standard Schemas (raw ArkType) before the SchemaValidateFn fallback

`useForm({ schema })` is documented to accept a RAW Standard Schema (zod / valibot / arktype / `@pyreon/validate`'s `s`) directly — no adapter, no `as never` cast. But `resolveSchemaValidator` short-circuited `typeof schema === 'function'` → treat as a hand-written `SchemaValidateFn` BEFORE it ever tried `isStandardSchema`. **ArkType schemas are callables** (`type({...})` returns a function that carries `~standard`), so a raw ArkType schema hit the function arm and was invoked as the whole-form validator with the wrong signature — silently reporting VALID for invalid input. Zod/valibot (object schemas) were unaffected.

Reordered the resolver so `isStandardSchema` is checked BEFORE the bare-function fallback: a callable-that-is-a-Standard-Schema (ArkType) is now recognized as a schema and routed through `standardSchemaToValidator`. This completes the chain started by `@pyreon/validation` #2243 (`isStandardSchema` accepts callables). A genuine hand-written `SchemaValidateFn` (a function WITHOUT `~standard`) still hits the function fallback; the typed-adapter and zod/valibot object paths are unchanged.
