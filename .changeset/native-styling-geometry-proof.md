---
'@pyreon/native-compiler': patch
---

Device-assert the STATIC rocketstyle cascade through geometry — on Android.

The existing badge test proves a REACTIVE dimension re-renders and is careful to
claim nothing about colour. The static side — dimension → emitted modifier →
rendered layout — had no device coverage: a `size` that emitted no modifier, or
one the platform ignored, looked identical to a working one.

The counter gains a `size`-dimensioned component whose `narrow`/`wide` values
drive `width`, so the cascade's result is measurable. Compose's
`getBoundsInRoot()` reads real layout bounds, and the Android instrumented test
asserts ~120dp / ~240dp.

NO iOS assertion, deliberately, and the reason is in the iOS test file: XCUITest
exposes an element's ACCESSIBILITY frame, which hugs the content rather than the
layout frame. Measured on iPhone 17 Pro, the same shape reported 52.7/36.0pt
with the ids on Texts (the glyph widths of "narrow" and "wide") and 9.7/13.0pt
on Stacks — never the 120/240 the modifier requested. Any tolerance band wide
enough to pass would admit a dropped modifier, so the assertion was written,
measured, found to be measuring the font, and removed. A screenshot-diff
instrument is the tracked follow-up.

Matrix: the styling row's 0.2 now covers two mechanisms — reactive re-render on
both platforms, static cascade geometry on Android.
