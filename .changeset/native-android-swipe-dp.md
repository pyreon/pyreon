---
'@pyreon/native-compiler': patch
---

`<Press onSwipeLeft / onSwipeRight>` on Android now needs a 40 dp horizontal drag, as documented, instead of 40 raw pixels (about 13 dp on a 3x screen, so swipes fired three times as easily as on iOS). The emitted threshold is `40.dp.toPx()` inside `pointerInput`.
