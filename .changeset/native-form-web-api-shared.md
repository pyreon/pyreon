---
'@pyreon/native-compiler': patch
---

`@pyreon/form` was device-proven on native — via source that cannot compile on web.

The web API types the accessors as FUNCTIONS (`values: () => TValues`,
`errors: () => …`), so shared source reads `form.values().email`. The native
emit only lowered the PROPERTY form, `form.values.email`. That made a form
non-shared in BOTH directions:

- `form.values().email` — correct web → **uncompilable native, zero warnings**
- `form.values.email` — compiles native → **type error on web**

There was no shape that worked on both, which is the entire premise of the
four-layer shared-code model. Worse, both device-proven examples were written
in the native-only shape, so every device gate passed while the promise those
examples exist to demonstrate — one source, three targets — was not being met
for forms. Device proof actively pointed away from the defect.

Fixed by normalising a zero-arg call on the accessor to the property form in
both backends, at BOTH sites that recognise it: the general member read, and
the `<Field>` binding special-case (which routes the setter through `setValue`
→ re-validation, and would otherwise fall through to a generic, unbuildable
field). Additive — the property form still works.

Both device-proven examples migrated to the web shape. That is provably safe
without re-running the device gate: the two forms produce **byte-identical**
native emit on both targets, verified per example per target, and identical
bytes cannot behave differently on a device.

Locked by a test asserting the web form type-checks on both targets, that it
routes through the runtime binding rather than a generic field, the
byte-identity that justified the migration, and a drift guard on the examples
themselves — a regression to the native-only shape would silently stop being
web-compatible while every native gate stayed green.
