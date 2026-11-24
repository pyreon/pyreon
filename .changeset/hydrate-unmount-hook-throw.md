---
"@pyreon/runtime-dom": patch
"@pyreon/reactivity": patch
"@pyreon/compiler": patch
---

User code that throws during teardown no longer breaks the teardown around it, on the client-mount and the hydrate path alike: an `onUnmount` hook, the cleanup an `onMount` callback returns, an `onCleanup` registered in `onMount`, and a ref callback receiving `null`. Before, a throw from one of these could escape a `<For>` update as "Unhandled effect error" and leave every row on screen, or throw out of a root's unmount. Now it is logged (`[Pyreon] Error in onUnmount hook of <Name>`, `[Pyreon] Error in ref callback`, or the effect error handler for a scope cleanup) and reported through `reportError`. The remaining hooks, the other rows and the rest of the dispose still run. `EffectScope.stop()` continues past a cleanup that throws.

`diagnose` explains the new `[Pyreon] Error in onUnmount hook of <Name>` and `[Pyreon] Error in ref callback` messages: what threw, that the teardown continued, and how to make the hook or ref safe.
