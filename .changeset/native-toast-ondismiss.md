---
'@pyreon/toast': minor
---

`toast(msg, { onDismiss: () => … })` now lowers on iOS and Android. The native queue fires the callback exactly once when the toast leaves by any path: dismissed, expired, cleared, or evicted past `maxToasts`, matching the web. A handler that takes parameters, or one that is not an inline function, is warned by name and dropped; the toast still shows. The Kotlin queue also now releases the action handler of a toast evicted on arrival (`maxToasts = 0`), which it previously kept.
