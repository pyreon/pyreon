---
'@pyreon/form': patch
---

Every read accessor now tracks (#4824). `useFieldArray().values()` read `items.peek()` and each `item.value.peek()`, so a `computed` / effect / JSX accessor built on it was evaluated once and never again — after `append`, `remove`, `update` or an item's `value.set`. The same mistake was in `useForm`'s `values()`, `getValues()`, `getValues(name)` and `errors()`, and `dirtyFields()` / `touchedFields()` did not see a field added by `registerField()`. All of them now read through the tracking call (and the registered field set), so a derived "is this list dirty?" computed updates. `values()` still returns a cached object that keeps its reference until a value changes, and it no longer returns a stale snapshot after a direct `form.fields.x.value.set(...)`. Inside an effect that also writes the array, read it with `untrack(() => arr.values())`.
