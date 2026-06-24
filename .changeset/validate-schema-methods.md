---
'@pyreon/validate': minor
---

feat(validate): schema transform/refine completeness — `.pipe()` / `.superRefine()` / `.preprocess()` / `.nonoptional()`.

Closes the remaining Zod-parity gaps in the transform/refine surface:

- **`.pipe(target)`** — validate with `this`, then feed the (validated, transformed) output into `target`. Ideal for `coerce → validate` chains (`s.string().transform(Number).pipe(s.number().positive())`). Short-circuits if `this` fails; async-aware. Output type is `target`'s.
- **`.superRefine(fn)`** — like `.refine`, but the callback gets a `ctx` and may add ANY number of issues (or none) via `ctx.addIssue({ message, path? })` — for cross-field validation reporting multiple problems at once. Runs only if `this` passed.
- **`s.preprocess(fn, schema)`** — transform the raw input BEFORE `schema` validates it (Zod's `z.preprocess`), e.g. trim/coerce before the type-check.
- **`.nonoptional(message?)`** — reject `undefined` (Zod 4), re-requiring a present value after an `.optional()`.

All four are **wrapper schemas** (`PipeSchema` / `SuperRefineSchema` / `PreprocessSchema` / `NonOptionalSchema`) with a custom `_compileType` — zero changes to the shared compile pipeline. New exports: `preprocess` (+ on the `s` namespace), `SuperRefineCtx` type. 12 tests; superRefine's `addIssue` and preprocess's pre-validation transform are bisect-verified.
