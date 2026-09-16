---
'@pyreon/document': patch
---

Fix attribute/style breakouts across the `html`, `email` and `svg` renderers — funnel, not enumeration

PR #3435 guarded `TableColumn.width` breaking out of a `style` attribute. The FIELD
was fixed; the CLASS was not. Every user-controllable value reaching an attribute or
style position broke out identically — `col.align` one line above the guarded `width`,
the image `width`/`height` ATTRIBUTES, the divider/spacer/button geometry, and (because
the `email` renderer had no sanitizing funnel at all) the whole of its `heading`, `text`
and `section` emit. `email`'s heading interpolated `level` into the TAG NAME.

Every style-position value in all three renderers now goes through one shared funnel
(`styleDecls` / `cssDecl`, both `sanitizeStyle`-backed), and every numerically-typed
field (`width`, `height`, `thickness`, `borderRadius`, `size`, `lineHeight`, `gap`,
`level`) is coerced with `sanitizeNumber`, which emits nothing when the value is not
finite. A numeric STRING still renders, so a JSON document tree keeps working. `svg`
additionally stops poisoning every later coordinate with a non-numeric spacer height.
