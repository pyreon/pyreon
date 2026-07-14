---
"@pyreon/validation": patch
"@pyreon/mcp": patch
---

fix(validation): `isStandardSchema` accepts callable schemas (raw ArkType works framework-wide)

`isStandardSchema` bailed with `typeof value !== 'object'` before reading `~standard` — but **ArkType schemas are FUNCTIONS** (`type("string")(input)` validates) that also carry `~standard`. So a raw ArkType schema failed Standard-Schema detection, and every consumer that routes "is this a Standard Schema? then validate through it" (`@pyreon/store` / `@pyreon/state-tree` via `extractParseFn`, the `standardSchemaToValidator` bridge, `@pyreon/validate`, `@pyreon/feature`) silently SKIPPED validation for it — a store/state-tree declared with a raw ArkType schema either reported VALID while the schema would REJECT or threw at definition time (raw ArkType was unusable).

The guard now accepts a value whose `typeof` is `object` **or** `function`, as long as it carries a well-formed `~standard.validate`. Purely additive: object schemas (Zod/Valibot) behave exactly as before; only a function-carrying-`~standard` (ArkType) is newly accepted, and a plain function without `~standard` is still rejected. The return type narrows from the deprecated `StandardSchemaShape` to the canonical `StandardSchemaLike` (identical type — no consumer cascade). The sibling bridges (`standardSchemaToValidator` / `wrapStandardSchema`) already invoked `schema['~standard'].validate` (the Standard-Schema entrypoint, not a Zod-specific `.safeParse`), so only DETECTION was broken.

Regenerates the MCP api-reference validation region. Known residual (separate consumer bug, follow-up): `@pyreon/form`'s `resolveSchemaValidator` short-circuits `typeof === 'function'` before `isStandardSchema`, so a raw ArkType schema passed to `useForm({ schema })` is still mistreated as a `SchemaValidateFn`.
