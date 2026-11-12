---
'@pyreon/create-multiplatform': patch
---

The scaffolded Android `MainActivity` asks for light system bars (`enableEdgeToEdge` with `SystemBarStyle.light`), so the status-bar clock and icons are dark and readable over the light window background instead of white on white. The repo's own example Android hosts now pad for the system bars too (`Box(Modifier.safeDrawingPadding())`, as the scaffold already did): on Android 15+ they drew under the status bar.
