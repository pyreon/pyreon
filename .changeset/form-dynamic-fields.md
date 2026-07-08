---
"@pyreon/form": minor
---

Add explicit runtime field registration for dynamic / data-driven forms: `form.registerField(name, initialValue?, validator?)` and `form.unregisterField(name)`. A registered field is fully first-class — it reaches `values()` / `onSubmit` and participates in validity — and unregistering cleanly removes its contribution to the invalid/dirty counts. This is the explicit escape hatch from the static-by-default model (there is still no *silent* auto-registration, which would drop data). Dynamic fields are runtime-typed (not in the static `TValues`); read them via `getValues()[name]` / `fields[name]`. Internally the per-field setup was extracted into a reusable `createFieldState` so registered fields get identical wiring.
