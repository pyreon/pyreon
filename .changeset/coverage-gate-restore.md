---
'@pyreon/compiler': patch
---

Export `ERROR_PATTERNS` from the browser-safe `diagnose` subpath so the error
catalog can be held to a contract as a whole rather than spot-checked entry by
entry. `diagnoseError` returns the first match, so an entry that throws, renders
an empty `fix`, or reads a capture group its own pattern cannot produce does not
just fail itself — it decides what every entry after it can answer.
