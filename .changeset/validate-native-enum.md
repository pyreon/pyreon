---
'@pyreon/validate': minor
---

`s.nativeEnum(MyEnum)` — validate a VALUE of a TS native `enum` (or a `const` value-object), Zod's `z.nativeEnum`. Output type is the enum's value union (`E[keyof E]`). Correctly filters out the numeric reverse-mappings TS auto-generates (a numeric `enum { A }` compiles to `{ A: 0, 0: 'A' }`, so `'A'` is NOT accepted as input — only `0` is); `getValidEnumValues` is exported for reuse. Also fixes a latent type bug: `PyreonIssue` now declares `code?: string` (it was always set at runtime by `makeIssue`/`makeCheckIssue` but missing from the type, so reading `issue.code` failed to typecheck).
