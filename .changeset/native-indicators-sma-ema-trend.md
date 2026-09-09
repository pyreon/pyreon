---
'@pyreon/native-compiler': minor
'@pyreon/charts': patch
---

feat(native): sma, ema and trend lower to iOS and Android

The three indicator overlays cross into the native chart engine — `sma`, `ema`
and `trend` emit real Swift and Kotlin rather than staying web-only, so a
multiplatform chart carries the same indicator set as its web sibling. Charts'
`engine/a11y.ts` gained the matching descriptions.

(Recovered entry: this work shipped in #3403 with an EMPTY changeset, which the
Changeset gate accepted because it counted activity by path with the content
unread — so the feature had no CHANGELOG line at all. The gate now rejects a
changeset that declares no package.)
