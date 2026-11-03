---
'@pyreon/toast': minor
---

`toast(msg, { action: { label, onClick } })` shows an action button on the native card (iOS and Android). Like the web, a tap runs `onClick` and leaves the toast up. The handler is released when its toast is dismissed, expires, is cleared or is pushed out by the stack limit. `PyreonToastItem` gains `actionLabel`, `add` gains `actionLabel` / `onAction`, and `runAction(id)` is new. An `onClick` that takes the web's `{ id, dismiss }` context does not lower yet and is warned by name.
