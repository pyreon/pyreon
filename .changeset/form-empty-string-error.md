---
'@pyreon/form': patch
---

A validator returning `''` made the form permanently unsubmittable

`''` is the natural "valid" branch when the invalid branch returns a message:

```ts
username: (v) => (v.length < 3 ? 'At least 3 characters' : '')
```

It was counted as an error. That produced the worst possible failure shape:
`errors()` reads `''` so the UI renders **no message**, `validate()` returns
`false`, `isValid()` stays false, and `handleSubmit()` silently never calls
`onSubmit`. A form that cannot submit and does not say why.

`undefined` and `''` now both mean valid, applied at all four places that
decided error presence — including the incremental `_invalidCount` that backs
`isValid`, so a submit button is not left disabled while the form submits fine.

Found from the other end: a tri-target e2e showed a login screen that accepted
input and did nothing on submit, on web, while both native targets device-proved
the same flow.
