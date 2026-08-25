---
'@pyreon/hotkeys': patch
'@pyreon/native-compiler': patch
'@pyreon/native-cli': patch
---

`useHotkey` now lowers to a real keyboard shortcut on iOS and Android

The manifest used to say touch platforms have no hardware-shortcut surface.
That was false — iPads with keyboards, Chromebooks, DeX and keyboard-equipped
tablets all reach one, and both toolkits expose it. What was missing was the
lowering.

```tsx
useHotkey('mod+s', () => save())
```

```swift
.background(Button("") { save() }.keyboardShortcut(KeyEquivalent("s"), modifiers: [.command])…)
```
```kotlin
Box(modifier = Modifier.focusRequester(__hkFocus).focusable().onPreviewKeyEvent { e -> … })
```

The two emits are structurally different because the toolkits are: SwiftUI's
`.keyboardShortcut` attaches to a CONTROL and fires its action, so the handler
becomes a hidden zero-size Button's action; Compose delivers key events only to
a FOCUSED node, so the root is wrapped focusable with a FocusRequester that
actually requests focus.

`mod` stays symbolic in the IR and resolves per platform — Command on iOS, Ctrl
on Android.

Three shapes are refused BY NAME rather than emitted wrong: a computed shortcut
(neither toolkit can bake one in), a handler taking the KeyboardEvent (no native
equivalent — silently ignoring it would run event-dependent logic wrongly), and
a comma-separated combo list (one binding cannot carry two).

Every Compose `Key` constant and SwiftUI `KeyEquivalent` in the mapping was
verified to resolve against the real artifacts, with negative controls: Compose
spells it `Key.Spacebar` not `Key.Space`, digits are `Key.Zero`…`Key.Nine`, and
`Key.Home` is the Android home BUTTON — `MoveHome`/`MoveEnd` are the caret pair.

Native app-runtime coverage: 35/37 → 36/37.
