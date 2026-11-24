---
'@pyreon/core': patch
'@pyreon/runtime-dom': patch
'@pyreon/compiler': patch
---

`<Defer when>` takes a value or an accessor, like `<Show when>` (#4830). `when={hasData}` with a component-local signal or computed, and `when={open()}`, threw `props.when is not a function` and never loaded the chunk, because the compiler turns both into a reactive prop that already reads the value. The same fix applies to `<Transition show>`, `<KeepAlive active>` and `<TransitionGroup items>` (an array `items` used to fall back silently to the plain-container shape).

A `<Defer>` chunk that fails to load goes to the enclosing `<ErrorBoundary>`, both when the trigger is already true at mount and on a later load (#4831). The boundary's `reset()` remounts the `Defer`, which retries. Without a boundary the failure is reported to `registerErrorHandler`, logged in development, and the slot renders nothing. It used to be rethrown from a reactive re-run that no boundary sees.

`<ErrorBoundary>` now catches errors from the subtree it encloses. Before, the handler came from the top of a module-level stack, which is the boundary mounted last: a component that threw next to a mounted boundary rendered that sibling's fallback, and an async component's rejection went to whichever boundary mounted last. The boundary is now found through the component tree (context). An error thrown while a boundary already shows its fallback goes to the next boundary out.

The compiler tracks signals in a component declared inside a callback (`test('…', () => { function Page() {…} })`) the same way as at module level, in both backends. Before, every `const` inside a call-argument callback was untracked, including a nested component's body, so the same component compiled differently in a test file.
