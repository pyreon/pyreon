---
"@pyreon/form": patch
"@pyreon/charts": patch
---

Fix two DX walls surfaced by #942's HN-clone audit:

**W10 — `useForm({ schema, validateOn: 'blur' })` now actually validates on blur.**
Previously `setTouched()` only ran the per-field `validators[name]` function;
the form-level `schema` only fired in `validate()` on submit. So a schema-only
form (the canonical zod / valibot / arktype shape) with `validateOn: 'blur'`
silently behaved like `'submit'` — the option name lied. Fix: when a schema
is configured and the field has no per-field validator, `setTouched()` now
runs the schema and applies ONLY this field's resulting error (other fields
are left untouched so users aren't surprised with errors on fields they
haven't visited). Versioned to discard stale results from interleaved
blurs. 5 new specs in `tests/schema-blur.test.tsx`; bisect-verified.

**W12 — `@pyreon/charts` now fails LOUD when the tslib alias is missing.**
ECharts imports `tslib` for TypeScript helpers (`__extends`, `__assign`, …);
tslib's CJS factory shape causes the named-helper destructure to read
`undefined` unless the consumer's vite.config has the `chartsViteAlias()`
alias. Without it, charts silently rendered as empty divs — the error
was buried in a signal nobody read, taking ~25 minutes to diagnose.
Now: (a) `getCore()` detects the tslib helper name in the error message
and rewraps with a prescriptive "Add `chartsViteAlias()` to your
vite.config" hint with the actual code snippet, (b) `<Chart>` surfaces
the error to `console.error` AND renders an inline error display in dev.
5 new specs in `tests/tslib-alias-detection.test.ts`; bisect-verified.
