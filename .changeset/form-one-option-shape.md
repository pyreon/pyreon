---
'@pyreon/form': minor
---

BREAKING: `useForm` has one option shape, `useForm({ initialValues, validators, onSubmit, … })`. The second shape, `useForm({ fields: [field('email', '', validate), …] })`, was a translation to the first and is removed, together with `field()` and the `FieldDefinition`, `InferFieldValues` and `UseFormFieldsOptions` types. `useField`, `<Form>`, `<FormProvider>` and context-based reads are unchanged.

Passing `fields` now throws a `[Pyreon]` error naming the replacement, and a missing `initialValues` throws instead of failing on `Object.entries(undefined)`.

Also BREAKING: `_resetDevtools` moved from `@pyreon/form/devtools` to the new `@pyreon/form/internal` subpath (no semver promise).

Upgrade: codemod form-use-form-fields (rewrites `fields: [email, password]` to `initialValues: { … }, validators: { … }` when the definitions are inline or declared in the same file) and codemod internal-exports-subpath (the `_resetDevtools` import).
