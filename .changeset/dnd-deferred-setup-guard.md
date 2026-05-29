---
'@pyreon/dnd': patch
---

fix(dnd): guard deferred pdnd setup against a mount→unmount race (`useDraggable`/`useDroppable`/`useFileDrop`)

These hooks defer their pragmatic-drag-and-drop registration to a `queueMicrotask(setup)` so the element ref is populated, while registering `onCleanup` synchronously. If the hook unmounted BEFORE the microtask ran (fast `<Show>`/conditional toggle, keyed-list churn), `onCleanup` fired with the cleanup still undefined (a no-op) — then the microtask ran `setup()` and registered pdnd anyway. That registration (plus its document-level listeners) was created after cleanup already ran, so it leaked for the page lifetime.

A `disposed` flag is now set in `onCleanup`; `setup()` bails if disposed. Bisect-verified (`tests/use-draggable-race.test.ts`): disposing before the deferred setup runs registers pdnd 0 times post-fix vs 1 pre-fix; a normal mount still registers once. 116/116 dnd tests pass. (`useSortable` already registered synchronously and was unaffected.)
