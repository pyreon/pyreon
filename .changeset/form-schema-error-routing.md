---
"@pyreon/form": patch
---

Fix a silent validation bypass: a whole-form schema error keyed by a path that didn't match a top-level field was dropped, so `validate()` reported the form valid and `onSubmit` fired with invalid data. The zod/valibot/arktype adapters flatten a nested issue to a dot-path key (`address.city`) and path-less errors land under `""` — neither matched a top-level field. Now a nested error routes to its ancestor object field (`address.city` → `address`), and any key matching no field marks the form invalid + sets `submitError` + dev-warns. Both the submit and blur validation paths are fixed.
