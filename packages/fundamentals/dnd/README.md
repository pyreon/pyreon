# @pyreon/dnd

Signal-driven drag and drop for the Pyreon framework. Wraps [@atlaskit/pragmatic-drag-and-drop](https://github.com/atlassian/pragmatic-drag-and-drop) with reactive signal state.

## Install

```bash
bun add @pyreon/dnd
```

## Features

- 5 hooks covering all drag-and-drop use cases
- Signal-driven state (isDragging, isOver, activeId, etc.)
- Auto-scroll when dragging near container edges
- Closest-edge detection for precise drop indicators
- Keyboard accessibility (Alt+Arrow to reorder)
- File drop with MIME type and count filtering
- Global drag monitoring for overlays and analytics

## Hooks

### useDraggable

Make an element draggable with reactive state.

```tsx
const { isDragging } = useDraggable({
  element: () => cardEl,
  data: { id: card.id, type: "card" },
  handle: () => handleEl,   // optional drag handle
  disabled: () => locked(),  // reactive disable
})

<div ref={(el) => cardEl = el} class={isDragging() ? "opacity-50" : ""}>
  <div ref={(el) => handleEl = el}>⠿</div>
  {card.title}
</div>
```

### useDroppable

Make an element a drop target with filtering.

```tsx
const { isOver } = useDroppable({
  element: () => zoneEl,
  canDrop: (data) => data.type === "card",
  onDrop: (data) => addCard(data.id),
  onDragEnter: () => highlight(),
  onDragLeave: () => unhighlight(),
})

<div ref={(el) => zoneEl = el} class={isOver() ? "bg-blue-50" : ""}>
  Drop here
</div>
```

### useSortable

Full-featured sortable list with edge detection and keyboard support.

```tsx
const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
  items: columns,
  by: (col) => col.id,
  onReorder: (newItems) => columns.set(newItems),
  axis: "vertical",  // or "horizontal"
})

<ul ref={containerRef}>
  <For each={columns()} by={c => c.id}>
    {col => (
      <li
        ref={itemRef(col.id)}
        class={activeId() === col.id ? "dragging" : ""}
        style={overId() === col.id && overEdge() === "top" ? "border-top: 2px solid blue" : ""}
      >
        {col.name}
      </li>
    )}
  </For>
</ul>
```

Features:
- Auto-scroll when dragging near container edges
- `overEdge` signal shows "top"/"bottom" (vertical) or "left"/"right" (horizontal)
- Keyboard reordering with Alt+Arrow keys
- Accessible: `role="listitem"`, `aria-roledescription`, `tabindex`

### useFileDrop

Native file drag-and-drop with filtering.

```tsx
const { isOver, isDraggingFiles } = useFileDrop({
  element: () => dropZone,
  accept: ["image/*", ".pdf"],
  maxFiles: 5,
  onDrop: (files) => upload(files),
  disabled: () => uploading(),
})

<div
  ref={(el) => dropZone = el}
  class={isOver() ? "drop-active" : isDraggingFiles() ? "drop-ready" : ""}
>
  {isDraggingFiles() ? "Drop files here" : "Drag files to upload"}
</div>
```

### useDragMonitor

Global drag state tracking for overlays and coordination.

```tsx
const { isDragging, dragData } = useDragMonitor({
  canMonitor: (data) => data.type === "card",
  onDragStart: (data) => showOverlay(),
  onDrop: (source, target) => logAnalytics(source, target),
})

<Show when={isDragging()}>
  <div class="global-drag-overlay">
    Dragging: {() => dragData()?.name}
  </div>
</Show>
```

## License

MIT
