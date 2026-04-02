---
title: Drag & Drop
description: Signal-driven drag and drop for Pyreon — draggable, droppable, sortable, file drop, keyboard accessible
---

# @pyreon/dnd

Signal-driven drag and drop. Wraps [@atlaskit/pragmatic-drag-and-drop](https://atlassian.design/components/pragmatic-drag-and-drop) with reactive signal state and Pyreon lifecycle integration.

## Installation

::: code-group

```bash [npm]
npm install @pyreon/dnd
```

```bash [bun]
bun add @pyreon/dnd
```

```bash [pnpm]
pnpm add @pyreon/dnd
```

```bash [yarn]
yarn add @pyreon/dnd
```

:::

Peer dependencies: `@pyreon/core`, `@pyreon/reactivity`

`@atlaskit/pragmatic-drag-and-drop` is bundled — no separate install needed.

## Quick Start

```tsx
import { useDraggable, useDroppable } from '@pyreon/dnd'

function DraggableCard(props: { card: Card }) {
  let el: HTMLElement | null = null
  const { isDragging } = useDraggable({
    element: () => el,
    data: { id: props.card.id, type: 'card' },
  })

  return (
    <div ref={(r) => el = r} class={isDragging() ? 'opacity-50' : ''}>
      {props.card.title}
    </div>
  )
}

function DropZone(props: { onDrop: (data: DragData) => void }) {
  let el: HTMLElement | null = null
  const { isOver } = useDroppable({
    element: () => el,
    onDrop: props.onDrop,
  })

  return (
    <div ref={(r) => el = r} class={isOver() ? 'bg-blue-50' : ''}>
      Drop here
    </div>
  )
}
```

## useDraggable

Make an element draggable with signal-driven state.

```tsx
import { useDraggable } from '@pyreon/dnd'

let cardEl: HTMLElement | null = null
let handleEl: HTMLElement | null = null

const { isDragging } = useDraggable({
  element: () => cardEl,
  data: { id: card.id, type: 'card' },
  handle: () => handleEl,        // optional drag handle
  disabled: () => isLocked(),    // reactive disable
  onDragStart: () => highlight(),
  onDragEnd: () => unhighlight(),
})
```

### Options

| Option       | Type                                 | Default | Description                           |
| ------------ | ------------------------------------ | ------- | ------------------------------------- |
| `element`    | `() => HTMLElement \| null`          | —       | Element getter (required)             |
| `data`       | `T \| (() => T)`                     | —       | Data to transfer on drag (required)   |
| `handle`     | `() => HTMLElement \| null`          | —       | Optional drag handle element          |
| `disabled`   | `boolean \| (() => boolean)`         | `false` | Whether dragging is disabled          |
| `onDragStart`| `() => void`                         | —       | Called when drag starts               |
| `onDragEnd`  | `() => void`                         | —       | Called when drag ends (drop or cancel)|

### Result

| Property     | Type          | Description                        |
| ------------ | ------------- | ---------------------------------- |
| `isDragging` | `() => boolean` | Whether this element is being dragged |

## useDroppable

Make an element a drop target with signal-driven state.

```tsx
import { useDroppable } from '@pyreon/dnd'

let zoneEl: HTMLElement | null = null

const { isOver } = useDroppable({
  element: () => zoneEl,
  canDrop: (data) => data.type === 'card',
  onDrop: (data) => addCard(data.id),
  onDragEnter: (data) => showPreview(data),
  onDragLeave: () => hidePreview(),
})
```

### Options

| Option        | Type                           | Default | Description                      |
| ------------- | ------------------------------ | ------- | -------------------------------- |
| `element`     | `() => HTMLElement \| null`    | —       | Element getter (required)        |
| `data`        | `T \| (() => T)`               | —       | Data to attach to drop target    |
| `canDrop`     | `(sourceData: DragData) => boolean` | —  | Filter what can be dropped       |
| `onDragEnter` | `(sourceData: DragData) => void` | —     | Called when a draggable enters    |
| `onDragLeave` | `() => void`                   | —       | Called when a draggable leaves    |
| `onDrop`      | `(sourceData: DragData) => void` | —     | Called on drop                   |

### Result

| Property | Type             | Description                              |
| -------- | ---------------- | ---------------------------------------- |
| `isOver` | `() => boolean`  | Whether something is dragged over target |

## useSortable

Full-featured sortable list with auto-scroll, edge detection, and keyboard support.

```tsx
import { useSortable } from '@pyreon/dnd'

const items = signal([
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
  { id: '3', name: 'Charlie' },
])

const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
  items,
  by: (item) => item.id,
  onReorder: (newItems) => items.set(newItems),
  axis: 'vertical',
})

// In JSX
<ul ref={containerRef}>
  <For each={items()} by={item => item.id}>
    {(item) => (
      <li
        ref={itemRef(item.id)}
        class={activeId() === item.id ? 'dragging' : ''}
        style={overId() === item.id && overEdge() === 'top'
          ? 'border-top: 2px solid blue'
          : ''}
      >
        {item.name}
      </li>
    )}
  </For>
</ul>
```

### Options

| Option      | Type                                    | Default      | Description                              |
| ----------- | --------------------------------------- | ------------ | ---------------------------------------- |
| `items`     | `() => T[]`                             | —            | Reactive list of items (required)        |
| `by`        | `(item: T) => string \| number`         | —            | Key extractor, matches `<For by>` (required) |
| `onReorder` | `(items: T[]) => void`                  | —            | Called with reordered items (required)    |
| `axis`      | `'vertical' \| 'horizontal'`           | `'vertical'` | Sort axis                                |

### Result

| Property       | Type                              | Description                                   |
| -------------- | --------------------------------- | --------------------------------------------- |
| `containerRef` | `(el: HTMLElement) => void`       | Attach to the scroll container                |
| `itemRef`      | `(key) => (el: HTMLElement) => void` | Attach to each sortable item              |
| `activeId`     | `() => string \| number \| null`  | Key of the currently dragging item            |
| `overId`       | `() => string \| number \| null`  | Key of the item being hovered over            |
| `overEdge`     | `() => DropEdge \| null`         | Closest edge: `'top'`/`'bottom'` or `'left'`/`'right'` |

### Features

- **Auto-scroll**: scrolls the container when dragging near its edges
- **Edge detection**: `overEdge` shows where the drop would occur relative to the hovered item
- **Keyboard reordering**: `Alt+ArrowUp/Down` (vertical) or `Alt+ArrowLeft/Right` (horizontal)
- **Accessibility**: sets `role="listitem"`, `aria-roledescription="sortable item"`, `tabindex="0"` on items

## useFileDrop

Native file drag-and-drop with MIME type and count filtering.

```tsx
import { useFileDrop } from '@pyreon/dnd'

let dropZone: HTMLElement | null = null

const { isOver, isDraggingFiles } = useFileDrop({
  element: () => dropZone,
  accept: ['image/*', '.pdf'],
  maxFiles: 5,
  onDrop: (files) => upload(files),
  disabled: () => isUploading(),
})

<div
  ref={(el) => dropZone = el}
  class={isOver() ? 'drop-active' : isDraggingFiles() ? 'drop-ready' : ''}
>
  {isDraggingFiles() ? 'Drop files here' : 'Drag files to upload'}
</div>
```

### Options

| Option     | Type                         | Default | Description                                |
| ---------- | ---------------------------- | ------- | ------------------------------------------ |
| `element`  | `() => HTMLElement \| null`  | —       | Element getter (required)                  |
| `onDrop`   | `(files: File[]) => void`   | —       | Called with filtered files (required)       |
| `accept`   | `string[]`                   | —       | MIME types (`'image/*'`) or extensions (`'.pdf'`) |
| `maxFiles` | `number`                     | —       | Maximum number of files                    |
| `disabled` | `boolean \| (() => boolean)` | `false` | Whether drop is disabled                   |

### Result

| Property          | Type             | Description                                |
| ----------------- | ---------------- | ------------------------------------------ |
| `isOver`          | `() => boolean`  | Files are dragged over this element        |
| `isDraggingFiles` | `() => boolean`  | Files are being dragged anywhere on page   |

## useDragMonitor

Global drag state tracking for overlays, analytics, and coordination between drag areas.

```tsx
import { useDragMonitor } from '@pyreon/dnd'

const { isDragging, dragData } = useDragMonitor({
  canMonitor: (data) => data.type === 'card',
  onDragStart: (data) => showOverlay(),
  onDrop: (source, target) => logAnalytics(source, target),
})

<Show when={isDragging()}>
  <div class="global-drag-overlay">
    Dragging: {() => dragData()?.name}
  </div>
</Show>
```

### Options

| Option       | Type                                        | Default | Description                     |
| ------------ | ------------------------------------------- | ------- | ------------------------------- |
| `canMonitor` | `(data: DragData) => boolean`               | —       | Filter which drags to monitor   |
| `onDragStart`| `(data: DragData) => void`                  | —       | Called on any drag start         |
| `onDrop`     | `(source: DragData, target: DragData) => void` | —   | Called on any drop               |

### Result

| Property    | Type                      | Description                           |
| ----------- | ------------------------- | ------------------------------------- |
| `isDragging`| `() => boolean`           | Whether any element is being dragged  |
| `dragData`  | `() => DragData \| null`  | Data of the currently dragging element|

## Accessibility

- `useSortable` sets `role="listitem"`, `aria-roledescription="sortable item"`, and `tabindex="0"` on each item
- Keyboard reordering with `Alt+Arrow` keys — no mouse required
- Focus is preserved after keyboard reorder

## SSR

All hooks return inert results on the server (`typeof document === 'undefined'`). Signals return static false/null values. No DOM access occurs.

## TypeScript

```ts
import type {
  DragData,
  DropEdge,
  DropLocation,
  UseDraggableOptions,
  UseDraggableResult,
  UseDroppableOptions,
  UseDroppableResult,
  UseSortableOptions,
  UseSortableResult,
  UseFileDropOptions,
  UseFileDropResult,
  UseDragMonitorOptions,
  UseDragMonitorResult,
} from '@pyreon/dnd'
```
