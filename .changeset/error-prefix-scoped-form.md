---
'@pyreon/lint': patch
---

`pyreon/no-error-without-prefix` now accepts the scoped `[Pyreon <scope>]` form.

The rule recognised `[Pyreon]` and `[@pyreon/<pkg>]` but not `[Pyreon Router]` /
`[Pyreon ISR]` / `[Pyreon manifest]` — the same convention with a space instead of a
slash, which this repo uses deliberately. Those messages already satisfy the rule's
stated purpose exactly (identified AND package-named), so requiring the literal token
would have forced `[Pyreon] [Pyreon Router] …`, which is worse for the reader than
what it replaces.

Every remaining finding of this rule in the repo was one of those false positives.
