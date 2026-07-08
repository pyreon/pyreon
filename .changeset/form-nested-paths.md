---
"@pyreon/form": minor
---

Nested / array field paths: dotted field keys (`address.city`, `items.0.qty`) now assemble into a nested object / array in `values()` / `getValues()` / `onSubmit` (`{ address: { city } }`, `{ items: [{ qty }] }`). `register` / `useField` / `setFieldValue` already accept any string key, so combined with `registerField('items.0.qty', …)` you get per-leaf state + per-leaf validation for nested and array data. A flat form (no dotted keys) is byte-identical to before — assembly only runs when dotted keys exist. Exposed as the pure `assembleNested` helper. (Compile-time `FieldPath<T>` autocomplete is a future enhancement; the runtime path support is complete.)
