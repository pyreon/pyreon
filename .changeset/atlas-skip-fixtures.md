---
'@pyreon/atlas': patch
---

Discovery skips `*.fixture.*` files by default, alongside tests, specs and stories. A test fixture is often a real component built only to be measured, and the catalog and the generated contract listed it as one of the project's components.
