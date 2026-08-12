---
"@pyreon/form": patch
---

fix(form): run the schema on value-change paths for schema-only fields (not just on blur)

A schema-only field (no per-field validator) only ran the form `schema` from the blur (`setTouched`) and `trigger()` paths. Every value-change-driven validation instead called `validateField`, which for a validator-less field just clears the error and never consults the schema. Two consequences:

- `validateOn: 'change'` never surfaced schema errors on a schema-only form.
- Severe: after a failed submit (`submitCount > 0`, in any mode including blur), typing a still-invalid value blind-cleared the field error and flipped `isValid` to `true` while the schema still rejected — re-enabling submit and letting invalid data through until the next `handleSubmit`.

Fix: on the value-change paths (`setValue` change/post-submit branch and change-mode initial validation), a schema-only field now re-runs `runSchemaForField` — exactly as the blur path and `trigger()` already do. Fields with a per-field validator keep `validateField` (validator precedence). Bisect-verified.
