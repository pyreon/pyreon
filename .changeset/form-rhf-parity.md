---
'@pyreon/form': minor
---

react-hook-form-parity additions + a competitor benchmark suite.

New, strictly-typed accessors on `FormState` (all additive — no breaking
changes):

- **`trigger(field?)`** — validate a single field, a subset (array), or — with
  no argument — the whole form, on demand. Runs validators immediately
  (bypassing `debounceMs`) and returns whether the validated set is valid.
  Reuses the exact same per-field validation path as auto-validation, so a
  schema-only field gets its schema error applied too.
- **`getValues(field?)`** — read one field's value (`getValues('email')`) or
  all values (`getValues()`, same as `values()`).
- **`dirtyFields()` / `touchedFields()`** — the changed / visited fields as a
  `Partial<Record<keyof TValues, boolean>>` record. Reactive.
- **`getFieldState(field)`** — a field's live `FieldState` signals (the same
  object as `form.fields[field]`), as a typed method.
- **`isSubmitted`** (`Accessor<boolean>`, `submitCount > 0`) and
  **`isSubmitSuccessful`** (`Signal<boolean>`, true only after the most recent
  submit's `onSubmit` ran without a validation failure or throw; cleared by
  `reset()`). Both also surfaced on `useFormState`'s summary.

Benchmarks (`packages/fundamentals/form/bench/`, real installed competitor
deps) prove the perf position vs the most popular libraries:

- Headless core vs TanStack Form (`form-bench.ts`): Pyreon's per-field signal
  write beats TanStack's store clone+notify on the keystroke hot path by
  **~17.7×** (`update-field` 193ns vs 3.48µs) and `reset` by ~4×. TanStack
  edges Pyreon on once-per-form `setup` (1.4×) and full-values `read` (15.8×) —
  the inverse face of the same plain-object-store trade-off that makes its
  writes 17.7× slower.
- Re-renders vs Formik + react-hook-form (`form-rerender-bench.ts`): typing 10
  keystrokes into 1 field of a 20-field form triggers **0** Pyreon component
  re-renders (signals patch the bound node, values stay reactive) = RHF's 0
  (uncontrolled refs, but values not reactively bound) < Formik's 10
  (controlled — re-renders the form every keystroke).

Known gap (deliberate, tracked): nested / deep typed field paths
(`user.address.city`) — `TValues` keys are flat; the composable `field()` +
flat model is the current design.
