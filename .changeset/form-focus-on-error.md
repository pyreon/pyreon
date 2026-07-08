---
"@pyreon/form": minor
---

Accessible error recovery: on a failed `handleSubmit`, focus now moves to the first errored + `register()`-bound field (react-hook-form's `shouldFocusError`, defaulted on). Opt out with `useForm({ focusOnError: false })`. Also exposes `form.focusFirstError()` for custom submit flows. SSR-safe; skips fields not bound via `register()`.
