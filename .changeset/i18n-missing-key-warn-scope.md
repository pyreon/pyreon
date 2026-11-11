---
"@pyreon/i18n": patch
---

Fix the dev-only missing-key warning reading out-of-scope `namespace` and `keyPath` identifiers (a type error that failed the package build); it now reads them from the entry.
