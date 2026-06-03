---
"@pyreon/lint": patch
---

fix(lint): `no-bare-signal-in-jsx` no longer false-positives on attribute values

The rule fired on every `JSXExpressionContainer` inside JSX, so it flagged
attribute signal reads (`<input value={value()} checked={checked()}>`) the same
as text children (`<div>{count()}</div>`). But the compiler `_rp()`/`_bind()`-
wraps signal reads in ATTRIBUTE position — those ARE reactive; only an
already-called signal in TEXT position is captured once. The over-fire forced a
`.pyreonlintrc.json` exemption for `@pyreon/ui-primitives` + `@pyreon/elements`
(both use `attr={signal()}` pervasively in their headless primitives).

The rule now marks text-child containers via a WeakSet when visiting each
element/fragment (oxc passes no parent) and reports only those — attribute
values are skipped, while TEXT nested inside an attribute (`prop={<div>{x()}</div>}`)
still reports correctly. The two package exemptions are removed (shipped source
of both is clean after the fix). Bisect-verified.
