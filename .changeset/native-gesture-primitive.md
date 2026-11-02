---
'@pyreon/primitives': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
'@pyreon/native-cli': patch
---

Add the `<Gesture>` primitive and transform props (#3985).

`<Gesture onPan onPinch onRotate>` reports continuous gestures with cumulative values (`dx`/`dy`/`x`/`y`, `scale`/`centerX`/`centerY`, `degrees`) and a `start` / `change` / `end` phase. Pan, pinch and rotate run at the same time, and nothing is reported until the pointer passes the touch slop, so a button inside the region still receives taps. It lowers to pointer events on the web, simultaneous `DragGesture` / `MagnifyGesture` / `RotateGesture` on iOS (`PyreonGesture`), and one `pointerInput` loop on Android (`PyreonGesture`).

Every primitive now accepts `translateX`, `translateY`, `scale` and `rotate`. Values can be signal reads and update in place: CSS `transform` on the web, `.offset` / `.scaleEffect` / `.rotationEffect` on iOS, `Modifier.offset` / `.scale` / `.rotate` on Android. The order is the same on every target (rotate, then scale, then translate).

The native compiler now honours a closure parameter's declared type when it widens signals to `Double`, so `x.set(e.dx)` in a gesture handler no longer leaves `x` an `Int`.
