---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/validate': patch
'@pyreon/validation': patch
'@pyreon/feature': patch
---

**Native schema parsing now returns each library's own web result shape.** This CHANGES the fields native code reads — read it before upgrading an app that validates on iOS/Android.

The native lowering gave both schema libraries zod's shapes, which neither of them has:

- `@pyreon/validate` — on the web `s.object(…).parse(x)` and `.safeParse(x)` are the SAME method: both return `{ ok: true, value } | { ok: false, issues }` and neither throws. Natively `.safeParse` returned zod's `{ success, data }` (since 0.53.0) and `.parse` THREW. Both now return `{ ok, value, issues }` (an issue's `path` an array of keys), never throwing.
- `@pyreon/validation` — an adapter (`zodSchema(…)`, `valibotSchema(…)`, `arktypeSchema(…)`) is `{ _infer, validator, parse }`; its `parse` returns `{ ok, value } | { ok: false, issues }` (an issue's `path` a dot-string) and never throws, and it has NO `safeParse`. Natively `adapter.safeParse` returned `{ success, data }` and `adapter.parse` threw. `adapter.parse` now returns the adapter's own result (inline `zodSchema(z.object({ … })).parse(x)` lowers too), and `adapter.safeParse` is declined with a warning that names the fix — on the web it is `undefined`.

- `@pyreon/feature` — `Todo.schema` is the schema the author passed, but every `<ns>.object({ … })` feature schema was treated as zod. An `s.object` feature schema's `.safeParse` / `.parse` now return `{ ok, value, issues }`; a valibot `v.object` schema (which has no `.safeParse` method on the web) is reported by name instead of lowering to one; a zod schema keeps `{ success, data }`. The false "`s` has NO native lowering" warning on a `@pyreon/validate` feature schema is gone.

So code that compiled for native against the old shapes did not work on the web, and code written for the web did not compile for native. Shared source should read `r.ok` / `r.value` / `r.issues`. If you wrote `.success` / `.data` (validate) or wrapped `.parse` in `try`/`catch` for native, switch to `const r = X.parse(input); if (r.ok) use(r.value)`.

Two honest limits remain: a native parse stops at the first failing field, so `issues` has at most one entry; and the issue `message` is the platform's own text (`Field 'sku' violated constraint 'min length 1'`), not the web validator's, so branch on `ok` and read `path`. A RAW zod/valibot schema (`z.object(…)` with no adapter) does not lower and keeps its library's own `parse` (throws) / `safeParse` (`{ success, data, error }`) on the web.

The manifests and docs that described the old `{ success, data }` / throwing behaviour are corrected.
