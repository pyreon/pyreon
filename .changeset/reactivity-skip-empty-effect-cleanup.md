---
'@pyreon/reactivity': patch
---

Re-running an effect that has nothing to clean up skips the cleanup step. One signal driving 100 effects is 11% faster on V8 and 8% faster on JavaScriptCore.
