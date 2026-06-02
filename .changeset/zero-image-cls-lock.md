---
"@pyreon/zero": patch
---

docs(zero): clarify `<Image raw>` CLS contract + lock the default `<Image>` aspect-ratio reservation

The default `<Image>` already prevents CLS by reserving `aspect-ratio` +
`max-width` on its container — but that contract was only covered by a
local *copy* of the style-assembly logic in tests, so a regression in the
real `useImage` hook would not have been caught. Adds a regression test
asserting the **real** `useImage().containerStyle` carries the
reserved-box declarations.

Also clarifies the `raw` mode JSDoc: raw is still CLS-safe (the
`width`/`height` attributes drive `aspect-ratio` via the UA stylesheet);
the *explicit* `aspect-ratio` CSS is deliberately omitted so it can't
fight a custom absolute-positioned layout.

No runtime behavior change.
