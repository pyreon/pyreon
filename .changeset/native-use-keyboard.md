---
'@pyreon/hooks': minor
'@pyreon/hotkeys': patch
'@pyreon/native-compiler': minor
---

`useKeyboard(key, handler)` now lowers to SwiftUI and Compose instead of failing the native build. It becomes the same hardware-keyboard binding `useHotkey` produces: a hidden zero-size button with `.keyboardShortcut` on iOS, and a focusable `onPreviewKeyEvent` handler on Android. The key must be a literal, the handler inline, and a native binding fires only when the key is pressed with no modifier. `event: 'keyup'`, `target`, a handler that reads the event, and an uppercase letter (Shift+letter on the web) are named warnings that drop the binding, not silent differences.

The key-name maps, the event-suppression rule and the SwiftUI/Compose emit now live in the compiler (`keyBindingDecl`, exported from the plugin API) and are shared by `@pyreon/hotkeys` and `@pyreon/hooks`, so the two cannot disagree about what a key is. The `useHotkey` output is unchanged.
