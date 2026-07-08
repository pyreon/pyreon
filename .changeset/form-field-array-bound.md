---
"@pyreon/form": minor
---

Form-bound field arrays: `useFieldArray(form, name)` — a new overload where items live IN the form as registered fields (`${name}.${index}[.${sub}]`, built on `registerField` + the nested-path `values()` assembly). Unlike the standalone `useFieldArray(initial)`, item values reach `values()` / `onSubmit` (as `name: [...]`) and per-item validators participate in `isValid`. Supports homogeneous scalar OR object items; `append` / `prepend` / `insert` / `remove` / `move` / `swap` / `replace` with stable `{ key, name }` items for keyed `<For>` rendering (`form.register(`${item.name}.qty`)`). Closes the "field arrays aren't wired into the form" gap that pushed real apps (e.g. the invoice example) to hand-rolled stores. The standalone `useFieldArray(initial)` is unchanged.
