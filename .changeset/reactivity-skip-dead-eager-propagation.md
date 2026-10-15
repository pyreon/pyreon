---
'@pyreon/reactivity': patch
---

Reading through a chain or diamond of computeds is faster. When a computed re-evaluates during a read and its only subscriber is another computed that is already marked dirty, there is nothing to propagate, and it no longer opens and closes a batch window to find that out. Deep computed chains are 12–17% faster and diamonds 18–22% faster, on both V8 and JavaScriptCore.
