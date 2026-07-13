---
"@pyreon/form": minor
---

First-class dot-path (nested) LEAF fields. A field key containing a dot
(`'address.city'`) now declares a first-class leaf field, addressable exactly
like a top-level one — `register('address.city')`, `useField('address.city')`,
`setFieldValue('address.city', …)`, `validators: { 'address.city': … }`,
`errors()['address.city']`, `trigger('address.city')`, and blur validation all
route to it. Per-field validators and a **flat-keyed** schema
(`s.object({ 'address.city': … })`) route their error to the exact **leaf**;
a **nested** schema over a single object field still routes to the **ancestor**
object field. Two new exported pure helpers, `nestValues` and `flattenValues`,
convert between the flat form value shape and a nested API payload.

Fixes:

- **Bug**: `orphanSchemaErrorKeys` flagged an exact dot-path leaf key
  (`address.city`) as an "orphan" because its top segment (`address`) is not a
  field — so a leaf field + schema produced a spurious `submitError` and dev
  warning even though the error had already routed to the leaf. It now checks
  exact-field and deep-ancestor membership before flagging.
- **Security**: `nestValues` is hardened against prototype pollution — a crafted
  flat key like `'__proto__.polluted'` / `'constructor.prototype.x'` is dropped
  (the standard post-CVE `lodash.set` posture) instead of walking into a
  prototype.

The value model stays FLAT (`values()` / `getValues()` / `onSubmit` keep the
dot-path keys, so field-name types stay honest — no `NestValues<T>` type
cascade). Not breaking. Remaining follow-ups: typed nested-value inference and
auto-splitting a nested-schema error to per-leaf fields.
