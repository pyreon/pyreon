---
'@pyreon/hotkeys': patch
'@pyreon/native-compiler': patch
---

Correct `@pyreon/hotkeys`'s multiplatform rationale, which was factually wrong

The manifest said *"touch platforms have no hardware-shortcut surface"*, and the
native compiler quotes that rationale verbatim in the warning it prints when you
import the package — so the claim was reaching users as guidance.

It is false. Both targets expose a hardware-shortcut surface, and both the
control-bound and view-level iOS shapes typecheck against the real iOS SDK:

```swift
Button("s") {}.keyboardShortcut("s", modifiers: .command)   // iOS 14+
Color.clear.onKeyPress(.init("s")) { .handled }             // iOS 17+
```

Compose has `Modifier.onPreviewKeyEvent`. iPads with keyboards, Chromebooks,
DeX and keyboard-equipped tablets all reach them.

The rationale now says what is actually true: no lowering is implemented yet.
That is an unbuilt lowering, not a platform limitation — a distinction that
decides whether anyone attempts it.

No emitted code changes.
