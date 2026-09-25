---
'@pyreon/lathe': patch
---

Generated interfaces keep an enum's literal union. `Pet.status` was typed
`string` although its schema accepts only `'available' | 'pending' | 'sold'`:
the emitted `s.enum([...])` inferred `string` (the array literal widened), and
the interface was written as `string` to agree with it. The schema is now
emitted as `s.enum([...] as const)`, so the schema's inferred type and the
interface both carry the union — for string, numeric, boolean, mixed and
`const` values, optional, nullable and array positions, on both validators.
Code assigning an arbitrary string to such a field now gets a type error it
should always have had.
