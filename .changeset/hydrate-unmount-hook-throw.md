---
"@pyreon/runtime-dom": patch
---

A component whose `onUnmount` hook, or the cleanup its `onMount` callback returned, throws no longer breaks the teardown around it. A hydrated component ran these hooks unguarded, so removing a `<For>` row whose component threw escaped as "Unhandled effect error" and left the rows on screen. Hydrated and mounted components now log `[Pyreon] Error in onUnmount hook of <Name>`, report it through `reportError` (`phase: 'unmount'`), run the remaining hooks and finish the teardown. Previously a client-mounted component did this only for `onUnmount`, not for an `onMount` cleanup.
