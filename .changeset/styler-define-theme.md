---
'@pyreon/styler': minor
---

`defineTheme` exists now — the typed identity helper the multiplatform docs
had described ("identity on web") while nothing exported it, so a SHARED
multiplatform source using the styling vocabulary could not build for web at
all. On web it returns the token object unchanged (pass it to your theme
provider); the PMTC native compiler parses the declaration at compile time
and resolves `styled()` / rocketstyle token interpolations against it.
