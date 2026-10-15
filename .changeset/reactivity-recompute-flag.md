---
'@pyreon/reactivity': patch
---

Notifying effects is faster on V8 (Chrome, Node): telling a computed's notify apart from an effect's is now a field check instead of a `WeakSet` lookup. One signal driving many effects is 13% faster, batched writes 14% and computed diamonds 9%; JavaScriptCore is unchanged.
