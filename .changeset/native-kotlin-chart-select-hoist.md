---
'@pyreon/native-compiler': patch
---

A Kotlin chart host with an `onSelect` / `onSelectIndex` handler no longer fails to compile on Android. Its items are now evaluated once, in composable scope, instead of being re-emitted inside the `pointerInput` tap handler — where the themed palette's `isSystemInDarkTheme()` is a `@Composable` call Compose rejects ("@Composable invocations can only happen from the context of a @Composable function").
