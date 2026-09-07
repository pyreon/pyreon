---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-cli': patch
---

`<PlotChart navigator>` — the slider dataZoom — lowers natively. The strip is now an engine module (`navigator.ts`: `renderNavigator` over the first series across every row, `navigatorHit` for what a press grabs — band, left or right handle — and `navigatorDrag` for the window a drag produces) that the web host consumes unchanged and that generates into `PyreonChartEngine.swift/.kt`. On iOS and Android the drag rides a dedicated overlay above the strip (a clear SwiftUI layer / a Compose Box with `detectDragGestures`), so it never competes with the plot's pinch and pan, and it writes the same host window the pinch, the presets and the row slice read. The Android build now imports `detectDragGestures` (and `detectTransformGestures` for the pinch) for the real Gradle build — both live outside the star-imported packages and the stub gate could not see them missing.
