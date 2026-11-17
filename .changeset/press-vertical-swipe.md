---
'@pyreon/primitives': patch
'@pyreon/native-compiler': patch
---

`<Press>` gains `onSwipeUp` and `onSwipeDown`: a vertically dominant swipe of at least 40 px/pt/dp, beside the horizontal pair. On the web the polyfill sets `touch-action` (`pan-x`, or `none` with a horizontal handler) so the browser does not take the drag as a scroll. On iOS the vertical branch rides the same high-priority `DragGesture` behind a vertical-dominance guard. On Android it is a second direction-locked detector, `detectVerticalDragGestures`. Device-proven on both platforms together with `<Gesture onRotate>` and the live pan, pinch and rotate values.
