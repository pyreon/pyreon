---
'@pyreon/runtime-dom': patch
'@pyreon/reactivity': patch
---

The devtools hook (`window.__PYREON_DEVTOOLS__`) answers two inspector questions for a mounted component, computed when asked:

- `getComponentProps(id)` returns a shallow, bounded preview of its props, with values rendered like graph values and reactive props read without tracking.
- `reactive.nodesForComponent(id)` returns the signals, computeds and effects it created during setup and `onMount`, as graph node ids.

The registry's reference to the props object and the scope is dropped on unmount. Both are development only; production output is unchanged.
