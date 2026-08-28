---
'@pyreon/native-compiler': patch
---

`<Stack align="stretch">` / `<Inline align="stretch">` now warn by name on
native. Both emitters approximate `stretch` as `start` — a documented mapping
that lived only in a comment — so children hug their content on device while the
web build of the same source stretches them to fill. Diagnostic only; the emit
is unchanged, since the approximation is still the best available mapping.
