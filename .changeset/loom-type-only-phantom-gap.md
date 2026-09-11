---
'@pyreon/loom': patch
---

Fix `phantom-type-dep` never firing for a package with no runtime imports.

`detectPhantoms` opened each package with `if (!prod) continue`, which skipped
the whole package — and the TYPE-only scan below it — whenever `imports.prod`
had no entry for that name. A package whose runtime imports are all relative,
or all already declared, has no entry there at all, so its undeclared
`import type` specifiers were never checked.

That is exactly the shape where `phantom-type-dep` is the only finding
available: a types-heavy package, or one whose bare specifiers are all
type-only, was silently exempt from the detector written for it.

The prod map now defaults to empty instead of skipping the package, so the
type-only pass runs regardless. No change for packages that already had
runtime imports.
