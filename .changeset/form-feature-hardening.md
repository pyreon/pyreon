---
'@pyreon/form': minor
'@pyreon/feature': minor
---

@pyreon/form hardening:

- **Behaviour change:** `handleSubmit` no longer re-throws an error thrown by `onSubmit`. The error is recorded in `submitError` and the returned promise resolves, so `<Form>` / `<form onSubmit={form.handleSubmit}>` no longer produce an unhandled rejection on every failed submit. Programmatic callers that want the rejection pass `form.handleSubmit({ rethrow: true })` (new `SubmitOptions` type).
- `handleSubmit` is re-entrancy safe: concurrent calls (double Enter, double click during a slow async validator) share one in-flight submit, so `onSubmit` runs once. `<Submit>` is also disabled while validating.
- `field.reset()`, `form.reset()` and `setInitialValues()` now invalidate in-flight async validation (field validators and schema runs); `form.reset()` also aborts the validation `AbortSignal`. A pending "username taken" check can no longer write its error onto a freshly reset or re-based field.
- A `''` validator result is valid everywhere: `aria-invalid` / `aria-describedby`, `useField().hasError` / `showError`, `trigger()` and `focusFirstError()` now agree with `validate()`.
- `debounceMs` now debounces schema validation of schema-only fields (it used to apply only to per-field validators).
- Dirty tracking compares `Date` by time, `Map` / `Set` by content and other class instances (`File`, …) by identity; values of different prototypes are never equal. A changed date field is now marked dirty.
- A schema that throws on blur / change / `trigger()` is surfaced as `submitError` with a dev warning instead of being swallowed; `trigger()` returns `false`.
- **Behaviour change:** `register(name, { type: 'number' })` stores `undefined` (not the raw string) for an empty or unparsable number input.
- `useWatch(form)` now includes fields added with `registerField()` after the watch was created (and drops unregistered ones).
- Error messages use the `[Pyreon]` prefix; `useField().register` gains the `{ type: 'file' }` overload.

@pyreon/feature hardening:

- `<F.Field>` binds number fields with `{ type: 'number' }` (stores a number, not `"42"`) and date fields as `Date` values, so `z.number()` / `z.date()` schemas accept them. Required fields carry `aria-required`; `z.string().email()` / `.url()` render `type="email"` / `type="url"`; number inputs get `inputmode="decimal"`.
- Edit-mode `useForm` no longer lets a failed record load leave an enabled blank form that PUTs blanks over the record: the error is surfaced (`loadError`, `submitError`, `onError`), the form is disabled and submitting is refused (also while the load is in flight). The returned form now exposes `isLoading` and `loadError` (new `FeatureFormState` type).
- **Behaviour change:** the edit-mode load re-bases the form (`setInitialValues`) instead of calling `setFieldValue`, so loaded values are not dirty and not validated; it goes through the query cache under the `useById` key, and ISO date strings are converted to `Date` for date fields.
- `useUpdate` removes the optimistic partial record when a failed update had no cached record to restore.
- `useById` accepts an accessor id (`useById(() => props.id)`) and refetches when it changes.
- `defaultInitialValues` honours `.default(x)`, uses `[]` for arrays and `undefined` for dates; `FieldInfo` gains `defaultValue` and `format`.
- `<F.Table>` sortable headers render a keyboard-reachable `<button>` with a live `aria-sort` on the `<th>`.
