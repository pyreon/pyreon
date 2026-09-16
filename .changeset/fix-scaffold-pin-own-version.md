---
'@pyreon/create-multiplatform': patch
---

Pin every scaffolded `@pyreon/*` dependency to `^<own version>` instead of `latest`.

`latest` resolves each dependency independently at install time, so a
partially published release silently scaffolds a MIXED stack — after 0.51.0
the four native packages were still at 0.50.0, and a scaffolded app got
0.51.0 JS over a 0.50.0 native runtime with no signal to the user. A caret
range pinned to the scaffolder's own version fails the install loudly
instead, which is the correct outcome for an incomplete release.
`@pyreon/create-zero` has always derived its ranges this way; this copies
the mechanism (`src/own-version.ts`) rather than adding a cross-package
dependency.
