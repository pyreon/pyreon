---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-kotlin': patch
---

A form `onSubmit` that references the form ITSELF — `onSubmit: () => form.setFieldValue('note', '')`, the "clear the field after submit" idiom — now compiles on Android. The Kotlin emit passed `onSubmit` as a constructor argument inside `remember { PyreonForm(…) }`, making the handler body a self-reference in the form's own initializer (`unresolved reference 'form'`), so the shape built on iOS and failed to compile on Android. The emit now assigns `form.onSubmit` after the declaration — mirroring what Swift already did from `.onAppear` — and `PyreonForm.onSubmit` becomes a settable `var`.
