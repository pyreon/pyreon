---
'@pyreon/form': patch
---

`useWatch(form, 'field')`, `useFormState(form, (s) => …)` and `form.resetField(name, { keepError, keepTouched })` now lower to iOS and Android.

- `useWatch` and `useFormState` used to be reproduced verbatim, with a warning, and did not compile. They are now computeds over the native form: the selector's `s.isValid`, `s.isSubmitting` and `s.isDirty` read the form's own flags.
- `resetField` reached a runtime that had no such method, and the compiler gave no warning. Both runtimes now have `resetField` and `isDirty`.
- The overloads with no native shape are refused by name: multi-field and whole-form `useWatch`, `useFormState` without a selector, and a selector that reads another summary field.

Also fixed: on Android, `form.isSubmitting()` lowered to the `MutableState` itself, not its value. In text, `{form.isSubmitting()}` printed the state object's `toString` (`MutableState(value=false)@…`) where the web prints `false`. It now reads `.value`.
