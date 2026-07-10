---
"@pyreon/form": patch
---

Value-integrity fixes across the form core — four release-audit defects, each with a proven failure scenario:

- **Unrecognized `schema` now THROWS instead of silently disabling validation.** `useForm({ schema: { safeParse: (x) => x } as never })` (a zod<3.24 schema without `~standard` support, or a typo'd object) previously resolved to NO validator — `validate()` returned `true`, `errors()` stayed `{}`, and `onSubmit` fired with unvalidated data. `resolveSchemaValidator` now throws the same `[Pyreon] \`schema\` must be a SchemaValidateFn, a TypedSchemaAdapter…` guidance `@pyreon/store` gives for the identical input. Plain functions, `@pyreon/validation` adapters, raw Standard Schemas, and absent/`undefined` schemas are unaffected.

- **`reset(values)` re-basing is now durable (react-hook-form `defaultValues`-replacement parity).** The per-field dirty compare and `field.reset()` captured the ORIGINAL initial at setup, ignoring the baseline moved by `reset(values)` / `setInitialValues`: after `reset({ name: 'saved' })`, typing `'x'` then back to `'saved'` reported `isDirty() === true` forever (unsaved-changes guards misfired on the exact reset-to-saved-server-data flow), and `resetField('name')` / a later plain `reset()` reverted to the ORIGINAL initial. All baseline reads now go through the live `currentInitials` record (one source of truth); `getValues()`'s fallback was reconciled onto it too (it read the stale `initialValues` while `getSubmitValues` read `currentInitials`). `_dirtyCount` stays consistent across baseline moves.

- **Explicit `null`/`undefined` field values are no longer swallowed by the initial.** `values()` and the submit payload used `fields[name]?.value.peek() ?? initial`, so `setFieldValue('age', null)` silently reported the original initial — with file inputs (`FileList | null`), a server-prefilled file field cleared to `null` submitted the stale initial. Both reads now branch on FIELD EXISTENCE, never on value nullishness.

- **Dynamic-field re-registration can no longer resurrect a stale async validation.** `registerField` seeded the per-field validation version at 0, so an unregister + re-register of the same name reused the old field's version space — a still-in-flight OLD async validator whose captured version collided wrote its stale error onto the fresh field. Every version (seed and per-run bump, for field validators AND per-field schema runs) now comes from one monotonic form-level counter, so a version value is never reused.
