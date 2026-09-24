---
'@pyreon/flow': patch
'@pyreon/native-compiler': patch
---

Native flow view fixes found while device-testing the React Flow parity work.

- A raised node (selected, dragged, or with a `zIndex`) no longer covers the connection handles and resize handles on iOS and Android. They now take their own node's stacking, as on the web, where they are the node's children.
- The auto-pan loop on iOS now runs only while the pointer is in the edge band, not for the whole drag. Android had the same fix.
- Native edge labels (the built-in label and `<EdgeText>`) use the web's 11px size. They were 12pt on iOS and the platform default on Android.
- `flow.updateNode(id, { zIndex: 5 })` and `updateEdge(id, { zIndex: 3 })` now compile on Android. An integer literal was emitted into a `Double` field.
- `<ViewportPortal>` on iOS and Android now gets one accurate warning (that it was dropped), not also an import-time warning saying the build fails.
- Android flow animations (`animateViewport`, `fitView`, an animated `layout`) ran their frames on a background `Timer` thread, so `onViewportChange` / `onNodesChange` listeners were called off the main thread and any that touched a View crashed with `CalledFromWrongThreadException`. Frames now go through `PyreonFlowFrames.scheduler`, which `PyreonFlowView` sets to the main looper the first time it renders. Hand-written Kotlin that animates a flow before any view exists can call `pyreonFlowUseMainThreadFrames()`.
