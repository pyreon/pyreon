---
'@pyreon/dnd': minor
---

Audit-gap release — accessibility, performance, and pdnd capability passthroughs:

- **Screen-reader announcements** (via `@pyreon/a11y`, new dependency): `useSortable` announces drag start / drop / keyboard reorder ("Picked up Alice", "Moved Alice to position 2 of 3"); new `label: (item) => string` option names items. A visually-hidden Alt+Arrow instructions node is auto-created and linked to items via `aria-describedby` (a consumer-supplied `aria-describedby` wins).
- **`createSelector`-backed `isActive(key)` / `isOverKey(key)`** on `UseSortableResult` — O(2) notifies per drag change instead of the O(N) every-row subscription the `activeId() === key` idiom caused; docs updated to the selector idiom. `onDragEnter`/`onDragLeave` signal writes are now batched (every other path already was).
- **Custom drag preview**: `useDraggable({ preview: { render(container), offset } })` → pdnd `setCustomNativeDragPreview` with `'pointer-outside' | 'center' | 'preserve-offset'` presets.
- **Droppable edges + stickiness**: `useDroppable({ edges, sticky })` + returned `overEdge()` accessor (closest-edge hitbox on plain drop zones).
- **Per-item drag handles**: `useSortable().itemHandleRef(key)` scopes drag initiation to a grip element.
- New real-Chromium specs: announcements, O(2) selector proof, preview/edge/handle behavior, and the previously mock-only cross-list (`groupId`) path.
