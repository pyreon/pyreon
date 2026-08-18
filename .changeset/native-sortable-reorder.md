---
'@pyreon/dnd': minor
'@pyreon/native-compiler': minor
---

`useSortable` lowers to a native reorder engine — list drag-and-drop crosses to iOS and Android

`@pyreon/dnd` wraps pragmatic-drag-and-drop, which is DOM pointer machinery, so
the package as a whole stays web. But list REORDER — the highest-value case, and
the one users actually reach for on a phone — is gesture-shaped rather than
DOM-shaped, and both platforms have first-class support for it.

`useSortable({ items, by, onReorder })` now lowers to a co-located
`PyreonSortableState<T>` engine on both targets: SwiftUI `.draggable` /
`.dropDestination`, Compose long-press drag. The engine ships as co-located
Swift and Kotlin source under `packages/fundamentals/dnd/native/`, verified by
the co-source gate.

The rest of the surface is honest about staying web: `useDraggable` /
`useDroppable` are element-getter hooks, `useDragMonitor` is page-global, and
`useFileDrop` is an OS file-picker concept. Each still warns BY NAME rather than
emitting a call that does not exist natively.

The lowering requires the full contract — `items`, a single-param `by`
(`(item) => item.id`), and an arrow `onReorder`. Anything else warns naming the
exact prop and the exact shape it needs, instead of silently degrading.
