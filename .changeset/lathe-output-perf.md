---
'@pyreon/lathe': minor
'@pyreon/config': minor
---

`@pyreon/lathe`: generated output that costs what you use.

- One schema module per model (`schemas/<Model>.ts`, a `$ref` cycle sharing one; `schemas.ts` stays as the barrel) and `/* @__PURE__ */` on every emitted builder call and `api.endpoint(…)`. One GitHub hook: 94.4 KB -> 2.8 KB gzipped of generated code (Vite 8).
- Model types are written out as interfaces and each schema is typed as `Schema<Model>` instead of inferred: 26-65% fewer TypeScript instantiations on GitHub/Stripe. **Breaking:** object-only builders (`.extend`, `.pick`) no longer type-check on a generated schema.
- Query hooks take their data type from the endpoint, fixing 201 type errors on Stripe's generated queries and 38 on GitHub's.
- Untagged operations are grouped by path instead of one `default` module.
- New `responseValidation: 'strict' | 'warn' | 'off'` config option (also in `@pyreon/config`'s `LatheSection`).
- Fixes: faker factories that did not parse (inline objects in arrays/unions) or typecheck (`overrides` on non-object models), a recursion notice that never fired, `types.ts` emitting `export interface X {…} | {…}`, a discriminated union over named models, cycle-through-union type errors, and `format: uri` rejecting non-http URIs on `@pyreon/validate`.
- Faker generation is linear on cyclic graphs (Stripe 634 -> 144 ms CPU, a dense 2,000-model graph 40.6 s -> 0.1 s); the Vite plugin no longer generates twice on dev start; the CLI imports the native compiler only when a native module was generated.
