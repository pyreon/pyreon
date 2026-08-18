---
'@pyreon/feature': minor
---

Add `feature.Field` — render one schema field without hand-writing its markup.

`defineFeature` has always derived `fields: FieldInfo[]` from the schema (name, type, optionality, enum values, a human label) and nothing consumed it, so every app hand-wrote markup the schema had already described. `<Feature.Field form={form} name="title" />` now renders the label, a control typed from the schema (string → text, number → number, boolean → checkbox, enum → select with its values), and the error — wired through the form's own `register` / `labelProps` / `errorProps`, so label↔control association and the error's `role="alert"` come for free.

Deliberately PER-FIELD rather than a whole-form renderer. A generated form is excellent right up until a designer wants one field different, at which point an all-or-nothing component is worse than the markup it replaced. Every derived value has an override (`label`, `type`, `options`, `placeholder`, `class`, `inputClass`), and a field you do not want generated is written by hand next to the ones you do.

An unknown `name` throws naming the field and listing the real ones, rather than rendering an empty row that reads as a styling bug.

Type inference is duck-typed on Zod, so a `z.string().email()` renders `type="text"` — the component does not guess an input type from the field NAME, which would mistype a field called `emailVerified`. Pass `type` explicitly.
