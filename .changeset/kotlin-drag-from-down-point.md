---
'@pyreon/native-compiler': patch
'@pyreon/native-cli': patch
---

`<PlotChart navigator>` and `<PlotChart brush>` on Android now classify the gesture from the touch-DOWN point. Compose's `detectDragGestures` reports the point where touch slop was crossed, and slop (8dp) is wider than the navigator handle's grab (6dp), so dragging the left handle was read as a band drag and the brush anchored one slop past the press. Both surfaces are emitted as `awaitEachGesture { awaitFirstDown(); drag(id) { … } }`; the CLI adds the matching imports. Inside the drag the movement is read from `positionChange()` BEFORE `consume()` — Compose reports the unconsumed movement, so the other order reads zero on every step and the window never moves.
