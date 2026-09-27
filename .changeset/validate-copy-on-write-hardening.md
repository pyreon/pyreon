---
'@pyreon/validate': minor
'@pyreon/validation': minor
'@pyreon/compiler': patch
---

**`@pyreon/validate` — schemas are now immutable (copy-on-write). BEHAVIOUR CHANGE.** Every chainable method (`.min()`, `.email()`, `.refine()`, `.catch()`, `.field()`, `.describe()`, …), every `@pyreon/validate/mini` action, `schema.check(...)` and `pipe()` now return a NEW schema and never mutate the receiver. Previously they pushed onto the receiver and returned it, so `const name = s.string().min(1); s.object({ name: name.max(3) })` silently tightened every other schema sharing `name` — and, once one had been parsed, the result depended on parse order. Code that called a chain method for its side effect (`schema.min(2)` without using the return value) must now use the returned schema.

`withField()` likewise returns a new schema instead of mutating its input: two labels on one shared base no longer overwrite each other, and frozen schemas no longer throw. A Pyreon schema is cloned; a Zod / Valibot / ArkType schema is wrapped in a transparent Proxy (ArkType stays callable).

Also in `@pyreon/validate`:
- `.uuid()` accepts RFC 9562 versions 1–8 plus the nil and max UUIDs (v6/v7/v8 were rejected).
- `.ip()` / `.cidr()` / `validateIp` use a split-based IPv6 parser: compressed forms like `2001:db8::1:2` / `fe80::1:2:3` and embedded IPv4 (`::ffff:192.0.2.1`) are now accepted. New export `isIPv6`.
- `.url()` accepts single-character hosts (`https://a`); it stays http(s)-only on purpose.
- `formatErrorsByPath` and `toJsonSchema` no longer drop fields named `constructor` / `toString` / `__proto__`.
- `toFormValidator` supports async schemas: it returns a Promise of the error record when the schema is async (return type widened to `Record | Promise<Record>`).
- `parseReactive` / `parseReactiveAsync` are typed with the schema's output (`ParseResult<Output<S>>`) instead of `unknown`.
- `watchValid` now reports validity for async schemas once they settle (it never called back before).
- New `configure({ jit: false })` for CSP without `'unsafe-eval'`; a refused `new Function` is also remembered after the first failure (one dev warning, no CSP violation per schema).
- An async `.refine()` inside an object/array now files its issue at the field path (it landed at the root), and is invoked once per parse instead of twice.
- `@pyreon/validate/server`'s `isDisposableEmail` matches subdomains of a listed domain.
- `safeParse` docs corrected: it returns `{ ok, value | issues }`, not Zod's `{ success, data | error }`.

**`@pyreon/validation`:**
- Error records (`issuesToRecord`, `standardSchemaToValidator`, all adapters) have a null prototype, so a field named `constructor` / `toString` / `__proto__` keeps its error (the form used to report it valid).
- `valibotSchema(schema, fn)` and `arktypeSchema(schema)` infer the form's value type from the schema; an explicit type argument still works.
- `zodSchema` / `zodField` validate synchronously when the schema is sync (falling back to `safeParseAsync` only when Zod reports an async schema), so a sync schema no longer allocates a Promise per validation.
- `arktypeSchema` recognises ArkType's error collection by its brand instead of "any array with a `summary` key".

**`@pyreon/compiler`:** the build-emitted `.url()` / `.uuid()` verdict regexes mirror the runtime's updated ones.
