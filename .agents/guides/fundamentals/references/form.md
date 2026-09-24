# @pyreon/form

## API

- `field()` + `useForm({ fields, onSubmit })` infers `FormState`. Also `useField('name')` (from context), `<Form of={form}>`, `<Submit>` (auto-disables), `useFieldArray()` (stable `.key` — render with `<For by={(i) => i.key}>`), `useWatch`, `useFormState`, `trigger`, `getValues`, `dirtyFields`, `touchedFields`, `getFieldState`.
- Type helpers `FormValues`/`FieldNames`/`FieldValue`, and standalone `NestValues<T>` (not threaded through `useForm`).
- `validateOn` defaults to `'blur'`. Async validators are version-tracked. Server errors go through `setFieldError`/`setErrors` (they do not touch `touched`).
- `reset(values?, { keepErrors?, keepTouched?, keepDirty?, keepSubmitCount? })` resets to new values (named values become the new baseline; the rest revert). `resetField(field, { keepError?, keepTouched? })`.
- Dynamic fields: `registerField(name, initial, validator?)` / `unregisterField(name)` add and remove first-class fields at runtime. Fields are never registered silently.

## Accessibility

- `register(field)` returns an id plus reactive `aria-invalid`/`aria-describedby`. Options: `{ type: 'checkbox' }` → `checked`; `{ type: 'number' }` → `valueAsNumber`; `{ type: 'file' }` → a value-less bag whose `onInput` writes the `FileList`.
- `errorProps`/`labelProps` produce matching ids.
- A failed `handleSubmit` focuses the first errored `register()`-bound field (`focusOnError`, default on). `form.focusFirstError()` is exposed and SSR-safe.

## Schemas

- `schema` accepts a plain `SchemaValidateFn`, a `@pyreon/validation` adapter (`zodSchema(…)`), or a raw Standard Schema (zod, valibot, arktype, `s`).
- `resolveSchemaValidator` checks `isStandardSchema` before the bare-function fallback, so a callable schema (raw ArkType) is treated as a schema; a plain function without `~standard` is a `SchemaValidateFn`.
- Error routing never drops an error (`matchSchemaErrorForField(schemaErrors, name, fieldNames)`, `orphanSchemaErrorKeys` in `src/use-form.ts`):
  - A dot-path key (`address.city`) goes to the most specific registered field: the leaf `address.city` if registered, else the nearest ancestor object field (`address`).
  - A key matching no field (a typo, or the path-less `""` whole-form error) marks the form invalid, sets `submitError` and dev-warns.
- Dot-path leaf fields: a key with a dot (`'address.city'`) is a first-class leaf field for `register`, `useField`, `setFieldValue`, `validators`, `errors()`.
  - A declarative schema (Standard Schema or adapter, never a plain function) receives the nested value shape rebuilt with `nestValues`, and its per-leaf errors route to the leaf.
  - A plain `SchemaValidateFn` always receives the flat values.
  - `values()`/`onSubmit` stay flat (dot-path keys). Convert with `nestValues(form.values())` / `flattenValues(serverData)`.
  - Declaring both `address` and `address.city` dev-warns; the leaf wins.
- Limitation: types are flat dot-path keys, not a nested shape, so a nested declarative schema needs an `as never` cast.

## Performance

- The keystroke path has no per-field `effect()`: validation runs inline from `setValue`. `values()`/`getValues()` are epoch-cached.
