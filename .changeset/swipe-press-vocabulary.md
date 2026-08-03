---
'@pyreon/primitives': minor
---

`<Press>` gains the swipe vocabulary: `onSwipeLeft` / `onSwipeRight` fire on a horizontally-dominant ≥40px pointer delta. On web a pointer-delta polyfill (a swipe suppresses the same gesture's click, so one gesture is never both a swipe and a press); via PMTC, iOS lowers to a simultaneous `DragGesture` (taps still fire `onPress`) and Android to `pointerInput { detectHorizontalDragGestures }` (direction-locked — taps and vertical scrolls pass through).
