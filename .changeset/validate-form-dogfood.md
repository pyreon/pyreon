---
'@pyreon/validate': minor
---

`toFormValidator(schema, t?)` — adapt a `@pyreon/validate` schema into a `@pyreon/form` `schema` validator: a `(values) => Record<field, errorMessage>` function. Runs `schema.safeParse` and maps each issue path to a per-field error via `formatErrorsByPath` (so i18n keys resolve through `t` like every other error); valid input → `{}`. Designed for a flat object schema whose field names match the form's fields. Proven end-to-end by a new dogfood integration test in `@pyreon/form` driving a real `useForm` with an `s.object` schema (field errors, submit gating, blur, error-clearing).
