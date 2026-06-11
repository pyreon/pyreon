---
'@pyreon/sync': patch
---

Fix `syncedAwareness` lifecycle: a view's `dispose()` now detaches only its own observer instead of destroying the doc-shared `Awareness`.

Previously `syncedAwareness(doc).dispose()` ran `aw.destroy()` + `removeAwarenessStates` + a WeakMap delete on the **doc-shared** awareness instance. Because the awareness is one-per-`Y.Doc` (shared by every transport and every presence view), and `dispose` is auto-called via `onCleanup` on component unmount, a single component unmounting — or disposing one of several presence views — silently destroyed presence for the whole doc: the transports and any sibling view were stranded.

The awareness lifecycle is now **doc-owned**: `dispose()` is listener-detach only, and `YjsCrdtDoc.destroy()` performs the teardown (new `destroyDocAwareness` helper — announce departure + `aw.destroy()` + WeakMap-delete). Departure on disconnect remains the transport's job, and the relay's socket-close purge is the real ghost-cursor guarantee. Bisect-locked by new multi-view + `doc.destroy()` specs.
