---
'@pyreon/native-compiler': minor
---

`useForm({ schema })` now wires the schema into the native form

The schema DECLARATION always lowered — `zodSchema(z.object({…}))` emits a struct
/ data class whose `parse()` enforces every captured constraint. Nothing
connected it to a form: `useForm({ schema })` dropped the option SILENTLY, so
`isValid` was true on native for input the web rejects.

Each schema now also emits a per-field `validateField`, reusing the same
constraint generator `parse()` uses, and a form naming that schema gets one
validator entry per string field. An explicit per-field `validators` entry still
wins. A `schema:` naming no visible declaration warns by name instead of
silently producing nothing.

Found by the iOS device gate — the first thing anywhere to run a schema-validated
form on a device.
