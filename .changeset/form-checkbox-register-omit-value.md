---
"@pyreon/form": minor
"@pyreon/core": patch
---

`useForm.register(field, { type: 'checkbox' })` and `useField.register({ type: 'checkbox' })` now return `FieldRegisterCheckboxProps` (a new exported type) instead of `FieldRegisterProps<T>`. The checkbox shape OMITS `value` and includes `checked` as a required field — `<input type="checkbox" {...register(field, { type: 'checkbox' })}>` now type-checks cleanly without a cast.

Pre-fix, register's return type included `value: Signal<boolean>` for checkbox fields. JSX's `<input value={...}>` only accepts `string | number | (() => string | number)`, so the spread caused a TS2322 error and consumers had to wrap with `as unknown as InputAttributes`. Runtime behavior is unchanged — checkboxes have always read `checked` for their form value, and HTML's `<input type="checkbox" value=...>` carries arbitrary metadata, not the form-level boolean.

The `register` field in `FormState['register']` and `UseFieldResult['register']` is now a typed overload — pass `{ type: 'checkbox' }` for checkbox shape, omit or pass `{ type?: 'number' }` for the standard `FieldRegisterProps<T>` shape.

Companion fix in `@pyreon/core`'s `InputAttributes` and `TextareaAttributes`: widened `readOnly` from `boolean | undefined` to `boolean | (() => boolean) | undefined`, mirroring `disabled`. Both props are reactive in the runtime; the asymmetric type was a bug — `register()` always emitted `readOnly: Accessor<boolean>` (a callable), which couldn't satisfy the narrower type. No runtime change.
