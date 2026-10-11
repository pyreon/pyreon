---
"@pyreon/lathe": patch
---

Declare native lowering providers as optional peers so Lathe keeps their plugin subpaths external. Cold builds no longer try to bundle partially built plugins, and native verification uses the consuming project's installed providers.
