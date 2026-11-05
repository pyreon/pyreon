---
'@pyreon/native-compiler': minor
'@pyreon/reactivity': patch
---

`effect()` in a component body now runs on iOS and Android. Until now it was dropped with a warning.

The body runs when the view appears. It runs again whenever a signal, computed, store field or prop it reads changes, through `.onAppear` and `.onChange(of:)` on iOS and a keyed `DisposableEffect` on Android. A returned cleanup function runs before each re-run and when the view goes away, and it can use the locals of the run that created it. The re-run triggers are read from the body ahead of time, so a signal read only in a branch that did not run still triggers a re-run. The body checks its own conditions again, so a guarded effect does the same work.

An `onMount` whose cleanup uses a local from the mount body (`const id = setInterval(…); return () => clearInterval(id)`) now lowers the same way, running once. Before, its cleanup was dropped with a warning.

`untrack(fn)`, `batch(fn)` and `signal.peek()` now lower on iOS and Android. Each lowers to what it evaluates to, because native has no dependency tracking or batching for them to control. Before, each was copied into the output as written, and the native build failed.
