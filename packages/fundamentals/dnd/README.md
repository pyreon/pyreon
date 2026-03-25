# @pyreon/dnd

Signal-driven drag and drop for the Pyreon framework. Wraps [@atlaskit/pragmatic-drag-and-drop](https://github.com/atlassian/pragmatic-drag-and-drop) with reactive signal state.

## Install

```bash
bun add @pyreon/dnd
```

## Hooks

### useDraggable

```tsx
const { isDragging } = useDraggable({
  element: () => cardEl,
  data: { id: card.id, type: "card" },
})

<div ref={(el) => cardEl = el} class={isDragging() ? "opacity-50" : ""}>
  {card.title}
</div>
```

### useDroppable

```tsx
const { isOver } = useDroppable({
  element: () => zoneEl,
  onDrop: (data) => handleDrop(data),
  canDrop: (data) => data.type === "card",
})

<div ref={(el) => zoneEl = el} class={isOver() ? "bg-blue-50" : ""}>
  Drop here
</div>
```

### useSortable

```tsx
const { containerRef, itemRef, activeId } = useSortable({
  items: columns,
  by: (col) => col.id,
  onReorder: (newItems) => columns.set(newItems),
})

<ul ref={containerRef}>
  <For each={columns()} by={c => c.id}>
    {col => <li ref={itemRef(col.id)} class={activeId() === col.id ? "dragging" : ""}>{col.name}</li>}
  </For>
</ul>
```

### useFileDrop

```tsx
const { isOver, isDraggingFiles } = useFileDrop({
  element: () => dropZone,
  accept: ["image/*", ".pdf"],
  maxFiles: 5,
  onDrop: (files) => upload(files),
})
```

### useDragMonitor

```tsx
const { isDragging, dragData } = useDragMonitor({
  canMonitor: (data) => data.type === "card",
  onDrop: (source, target) => logDrop(source, target),
})
```

## License

MIT
