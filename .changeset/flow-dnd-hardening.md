---
'@pyreon/flow': minor
'@pyreon/dnd': minor
---

**@pyreon/flow**

- Gestures are owned by ONE pointer. A `pointercancel` / `lostpointercapture` (an OS-interrupted touch) now ends the in-flight node drag, connection draw, rubber band or pan instead of leaving it live for the next unrelated move; a second finger no longer starts a pan or drives an active drag. The MiniMap pan honours `pointercancel` too.
- Redo accepts Ctrl+Shift+Z whatever case `e.key` reports (Windows / Linux send `'Z'`) and Ctrl+Y; letter shortcuts compare case-insensitively.
- **Behaviour change:** `onConnect` fires only for a user connection (a handle drag). Programmatic `addEdge` / `addEdges` / `paste` no longer fire it — observe them through `onEdgesChange` (`type: 'add'`). This matches React Flow and the native runtimes.
- **Behaviour change:** removing a sub-flow parent (`removeNode(s)`, `deleteSelected`) removes its descendants and their edges instead of orphaning them.
- `paste()` re-parents copied children onto the copied parent (keeping their relative position) and is one checkpoint / one write per collection.
- **Behaviour change:** `fromJSON()` validates untrusted input — duplicate node/edge ids keep the first, dangling edges are dropped, a node without a valid position is placed at the origin — each with a `[Pyreon]` dev warning. Edges also get `defaultEdgeOptions` applied.
- `toJSON()` no longer throws on function-valued node/edge `data` (one-level copies instead of `structuredClone`).
- Measuring one node no longer re-derives every edge's geometry (per-node measurement gate), and a ResizeObserver delivery reads every node before committing all measurements in one batch.
- `getEdge` is O(1); `updateNode` patches one index and writes nothing for an unknown id.
- New `historyLimit` config (default 50).

**@pyreon/dnd**

- `useDraggable` / `useDroppable` / `useFileDrop` return a `ref` callback that registers an element that mounts LATER, follows a swapped element, and disposes on unmount; `element` is now optional. A signal-backed `element` getter re-resolves; a getter still `null` at setup warns in dev.
- **Behaviour change:** `useDroppable`'s `onDrop(sourceData, { edge, data })` receives the drop location (captured before `overEdge` resets). New second generic `TSource` types `canDrop` / `onDragEnter` / `onDrop`'s source data.
- `useSortable`: keyboard pickup mode (Space/Enter pick up, arrows move, Space/Enter drop, Escape cancel — all announced) alongside Alt+Arrow; new `disabled` option; a consumer-set item role is kept and a non-list container gets `role="list"`; the keyboard-instructions node moved OUT of the container (it was an invalid child of `<ul>` and defeated `<For>`'s bulk clear); a stale `itemRef(key)(null)` / `itemHandleRef(key)(null)` from a replaced row no longer disposes the live row; the focus-restore frame is cancelled on cleanup.
- `useFileDrop`: new `onReject(files, reason)` and `'*'` / `'*/*'` accept wildcards.
