---
'@pyreon/i18n': patch
---

Fix the missing-key warning passing `namespace` and `keyPath` locals that no longer exist after messages started compiling once per key; it now reads them from the compiled entry. `@pyreon/meta` failed to build on `main` because of it.
