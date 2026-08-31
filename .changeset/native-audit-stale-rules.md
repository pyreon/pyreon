---
'@pyreon/compiler': patch
---

The native audit no longer reports working code as broken.

A top-level `interface` **is** compiled to native — both emitters produce a
`struct` / `data class` for plain, optional-field, nested-object and
array-field shapes, and PMTC warns by name for the shapes it cannot take
(`extends`, generics, a method member). The rule claimed it was "silently
dropped" and told authors to rewrite it as a type alias. That arm is removed;
`enum` and `class` are still reported, with the message corrected to say PMTC
warns about them at build time.

The web-only package set is now DERIVED from the manifests, alongside the
native compiler's copy, instead of being hand-maintained beside it. The hand
list had drifted both ways: five packages that declare a `nativeFrontend` and
partially cross were flagged, and seventeen genuinely web-only packages were
not. The warning now quotes each package's own `rationale` rather than one
blanket sentence.
