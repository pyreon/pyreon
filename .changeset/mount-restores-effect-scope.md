---
'@pyreon/runtime-dom': patch
---

A component mount no longer clears the current effect scope. `mountComponent` and `hydrateComponent` reset it to `null` after setup instead of restoring the previous scope, so when a parent's `onMount` synchronously mounted a child (a signal write that flips a `<Show>`), every effect that onMount created afterwards had no owner and kept running after the parent unmounted. The previous scope is now restored on every exit path.
