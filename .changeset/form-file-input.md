---
"@pyreon/form": minor
---

Add file input support: `register(field, { type: 'file' })` returns a value-less props bag (a file input can't be value-controlled) whose `onInput` writes the input's `FileList` (`target.files`) to the field — so `field.value()` is a `FileList | null` (read `files?.[0]` for a single file). The file value flows into `values()` / `onSubmit` like any other field.
