---
"@pyreon/form": minor
---

Route nested schema errors to registered dot-path **leaf** fields (auto-split) —
finishing the runtime residual left by first-class dot-path leaf fields.

A DECLARATIVE schema (a raw Standard Schema or a `@pyreon/validation` typed
adapter — never a plain function) over a dot-path-leaf form now receives the
NESTED value shape, transiently rebuilt from the flat value model via
`nestValues` (only when the form declares dot-path leaf fields). So a REAL
nested schema like `z.object({ address: z.object({ city: z.string().min(1) }) })`
validates correctly, and its per-leaf-path error (`address.city`) auto-splits to
the registered LEAF field.

Routing now prefers the **most-specific** registered field:
`matchSchemaErrorForField(schemaErrors, name, fieldNames)` takes the field set,
so an ancestor object field no longer claims a nested key owned by a registered
leaf (or a deeper registered object ancestor). The both-registered tie-break
(object `address` + leaf `address.city`) resolves to **leaf-wins**; the ancestor
no longer double-claims (dev-warns, since holding "city" in two places is
confusing). When only the ancestor object field is registered, the nested error
still routes to it (the documented fallback, preserved), and a key matching no
field is still flagged as an orphan (form invalid + `submitError` + dev-warn) —
never silently dropped. A plain `SchemaValidateFn` always receives the FLAT
`TValues` (its type contract), so imperative schemas and every top-level /
object-field form are unchanged.

This closes the documented "a nested error surfaces on the ANCESTOR field, not a
per-leaf field" gap. The value model stays FLAT end-to-end (`values()` /
`onSubmit` keep the dot-path keys). Typed deep-path inference (`NestValues<T>`)
is still deferred — a nested declarative schema over a dot-path-leaf form needs
an `as never` cast today, since `schema` is typed against the flat keys; its type
cascade breaks generic wrappers like `@pyreon/feature`.

Bisect-verified: reverting the `fieldNames` leaf-preference makes the
`address.city` error land on the ancestor; reverting the nesting makes the real
nested schema's leaf error vanish and a valid nested payload fail validation.
