---
'@pyreon/native-compiler': minor
---

The cleanup function returned from `onMount` now runs on iOS and Android when the view goes away: SwiftUI `.onDisappear`, Compose `DisposableEffect`'s `onDispose`. It used to be stripped with a warning, so a subscription opened on mount was never closed natively.

A cleanup that reads a variable declared inside the mount body is still reported and not emitted. On the web the returned closure captures it, but native runs mount and unmount as separate hooks, so keep that value in a signal instead.
