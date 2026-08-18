---
'@pyreon/native-compiler': minor
'@pyreon/url-state': patch
---

PMTC: `useUrlState` lowers NUMBER and BOOLEAN defaults, not just strings

`useUrlState('page', 1)` previously warned and stayed web — only a string
default lowered to the native router's query. Number and boolean defaults now
lower on both targets, with a codec that mirrors the web's `inferSerializer`
rather than deferring to each platform's own string→number initializer.

That distinction is the substance of the change. The web decodes with `+raw`
(JS `ToNumber`), whose grammar neither `Double(_:)` nor `toDoubleOrNull()`
matches — `""` is `0` in JS and `nil`/`null` on both targets, `"0b101"` is `5`
in JS and unparseable on both, `"inf"` is `NaN` in JS but infinity in Swift,
and `"1.5f"` is `NaN` in JS but `1.5` in Kotlin. Since the inputs that expose
those cases are exactly the ones this feature exists for — a pasted deep link —
the emit reproduces the JS grammar itself, identically on both targets.
Booleans decode by exact `'true'` match, as the web does, so `?open=1` is
`false` on every platform.

An integer default lowers to `Int` and a fractional one to `Double`, following
the same `inferTypeFromInitial` rule every other PMTC lowering uses, so
`` `Page ${page()}` `` renders "Page 1" rather than "Page 1.0". `set` mirrors
JS `String(v)`, so a whole `Double` round-trips as `?zoom=1`, not `?zoom=1.0`.

A file that binds only string parameters emits byte-identically to before —
each helper is emitted only when a binding of that type exists.

Still web, and still warned by name: array and object defaults (the web infers
a comma-join and a `JSON.parse`, neither of which has a native type to decode
into at this call site), non-literal defaults and keys, and the
`clearOnDefault` / `debounce` / custom-serializer options.
