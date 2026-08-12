---
"@pyreon/feature": patch
---

fix(feature): edit-mode `useForm` no longer gets stuck (and populates) when the backend returns server-only keys

`useForm({ mode: 'edit', id })` auto-fetches the record and populated the form by iterating EVERY key of the server response and calling `form.setFieldValue(key, …)`. But `@pyreon/form`'s `setFieldValue` THROWS on a field the form doesn't have — and a real backend returns server-only keys (`id`, `createdAt`, `updatedAt`, relations) that aren't schema fields. The throw fired inside the populate `batch()`, aborting before `isSubmitting.set(false)` → the form was left permanently `isSubmitting: true` (submit disabled, appears frozen) with the fields unpopulated, plus an unhandled promise rejection. The populate loop now skips keys that aren't registered form fields. Also guards the dev-only Zod-detection against a nullish `schema` (a JS-caller edge that crashed at `defineFeature` time). Bisect-verified.
