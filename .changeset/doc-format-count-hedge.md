---
'@pyreon/cli': patch
'@pyreon/document-primitives': patch
'@pyreon/meta': patch
'@pyreon/native-compiler': patch
---

Docs now state the real count of `@pyreon/document` output formats (20) everywhere, and the native compiler's `Date` notes match what it does.

The `@pyreon/document-primitives` description and README still said "14+ formats". The doctor's doc-claims gate now refuses the "N+" form of every count claim it checks, not only the claims that listed a hedge pattern, and it reads the document-primitives README and `llms-full.txt` too. The native compiler's warning for an unsupported `Date.*` static now names `Date.parse` and `Date.UTC` as supported, since both lower.
