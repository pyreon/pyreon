---
title: Drag & Drop
description: Signal-driven drag and drop for Pyreon — draggable, droppable, sortable, file drop, cross-list boards, and keyboard-accessible reordering.
---

`@pyreon/dnd` is signal-driven drag and drop. It wraps [@atlaskit/pragmatic-drag-and-drop](https://atlassian.design/components/pragmatic-drag-and-drop) — the framework-agnostic engine behind Trello and Jira — and exposes it as a set of Pyreon hooks whose state is fine-grained signals and whose teardown is wired into Pyreon's component lifecycle.

<PackageBadge name="@pyreon/dnd" href="/docs/dnd" />

## Installation

:::code-group

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

`@pyreon/dnd` declares `@pyreon/core` and `@pyreon/reactivity` as **peer dependencies** — install them alongside (they're already present in any Pyreon app).

The `@atlaskit/pragmatic-drag-and-drop` engine (and its `-auto-scroll` and `-hitbox` companion packages) are regular **dependencies** of `@pyreon/dnd`, so your package manager installs them automatically. You never import them directly — you only touch the Pyreon hooks.

:::note
The three `@atlaskit/*` packages are runtime dependencies, not bundled into `@pyreon/dnd`'s output, so they tree-shake at your app's bundler the same way the hooks themselves do. Importing only `useDraggable` pulls in only the element adapter; `useFileDrop` pulls in only the external/file adapter; `useSortable` pulls in the auto-scroll + hitbox packages on top of the element adapter.
:::

<Example file="./examples/dnd/drag-to-reorder-usesortable-distilled" title="Drag-to-reorder — useSortable distilled" />

:::info
The interactive example above is a **distilled illustration** built with the raw HTML5 drag-and-drop API so it runs in the docs sandbox. `useSortable` (documented below) wraps this same reorder pattern with pointer-event dragging, auto-scroll, closest-edge detection, keyboard accessibility, and smoother motion — you don't write the `onDragStart` / `onDrop` plumbing yourself.
:::

## Why a hook layer over Pragmatic DnD?

Pragmatic DnD is a callback-and-cleanup API: `draggable({ element, onDragStart, onDrop })` returns a teardown function you're responsible for calling. `@pyreon/dnd` adapts that to how Pyreon apps actually work:

```tsx
// ❌ Raw Pragmatic DnD — manual element capture, manual state, manual cleanup
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'

let dragging = false // not reactive — your UI won't update
const cleanup = draggable({
  element: cardEl,
  onDragStart: () => { dragging = true },
  onDrop: () => { dragging = false },
})
// you must remember to call cleanup() on unmount
```

```tsx
// ✅ @pyreon/dnd — signal state, lifecycle-wired teardown
import { useDraggable } from '@pyreon/dnd'

let el: HTMLElement | null = null
const { isDragging } = useDraggable({
  element: () => el,
  data: { id: card.id, type: 'card' },
})

// isDragging() is a signal — JSX, effects, and computeds re-run automatically.
// Teardown is registered via onCleanup — it fires when the component unmounts.
<div ref={(r) => (el = r)} class={isDragging() ? 'opacity-50' : ''} />
```

Every hook in this package follows three conventions:

- **Elements are getters.** You pass `element: () => el` (and `handle: () => handleEl`), not the element itself. The hook captures the ref on the next microtask, so the element doesn't need to exist when the hook is called — it just has to exist by the time the component has mounted.
- **State is a signal accessor.** `isDragging`, `isOver`, `activeId`, etc. are all `() => T` accessors. Read them in JSX / effects / computeds for fine-grained reactivity — only the bound text node or class re-evaluates, never the whole component.
- **Cleanup is automatic.** Each hook registers its Pragmatic DnD teardown with `onCleanup`, so it's released when the owning component unmounts. You never manage the returned cleanup function yourself.

## `useDraggable`

Make an element draggable and track its drag state as a signal.

```tsx
import { useDraggable } from '@pyreon/dnd'
import type { DragData } from '@pyreon/dnd'

function DraggableCard(props: { card: Card }) {
  let el: HTMLElement | null = null
  let handleEl: HTMLElement | null = null

  const { isDragging } = useDraggable({
    element: () => el,
    data: { id: props.card.id, type: 'card' },
    handle: () => handleEl, // only this sub-element starts a drag
    disabled: () => props.card.locked, // reactive — re-evaluated on each drag attempt
    onDragStart: () => console.log('picked up', props.card.id),
    onDragEnd: () => console.log('released'),
  })

  return (
    <div ref={(r) => (el = r)} class={isDragging() ? 'card card--dragging' : 'card'}>
      <span ref={(r) => (handleEl = r)} class="drag-handle">
        ☰
      </span>
      {props.card.title}
    </div>
  )
}
```

### Dynamic drag data

`data` can be a value **or** a getter. Use a getter when the transferred payload depends on current state — it's resolved fresh each time the drag starts (`getInitialData`), not captured once at hook call time:

```tsx
const { isDragging } = useDraggable({
  element: () => el,
  data: () => ({ id: card.id, position: index(), selected: isSelected() }),
})
```

### Drag handle

By default the whole element is draggable. Pass `handle: () => handleEl` to restrict drag initiation to a sub-element (a grip icon, a title bar) while keeping the rest of the card interactive (buttons, links, inputs inside it stay clickable):

```tsx
<div ref={(r) => (cardEl = r)}>
  <header ref={(r) => (handleEl = r)}>☰ Drag me</header>
  <button onClick={edit}>Edit</button> {/* still clickable */}
</div>
```

:::tip
`disabled` is checked on **every** drag attempt (via Pragmatic DnD's `canDrag`), so a reactive `disabled: () => isLocked()` toggles draggability live — no need to re-create the hook.
:::

### `useDraggable` options

| Option        | Type                         | Required | Description                                                          |
| ------------- | ---------------------------- | -------- | -------------------------------------------------------------------- |
| `element`     | `() => HTMLElement \| null`  | yes      | Getter for the draggable element. Captured on the next microtask.    |
| `data`        | `T \| (() => T)`             | yes      | Payload transferred on drag. A getter is resolved fresh per drag.    |
| `handle`      | `() => HTMLElement \| null`  | no       | Restrict drag initiation to this sub-element.                        |
| `disabled`    | `boolean \| (() => boolean)` | no       | Disable dragging. A getter is re-evaluated on each drag attempt.     |
| `onDragStart` | `() => void`                 | no       | Fired when the drag begins.                                          |
| `onDragEnd`   | `() => void`                 | no       | Fired when the drag ends — on **either** a successful drop or cancel. |

### `useDraggable` result

| Property     | Type            | Description                                                          |
| ------------ | --------------- | -------------------------------------------------------------------- |
| `isDragging` | `() => boolean` | `true` while this element is being dragged (reactive signal accessor). |

## `useDroppable`

Make an element a drop target and track hover state.

```tsx
import { useDroppable } from '@pyreon/dnd'
import type { DragData } from '@pyreon/dnd'

function DropColumn(props: { onAdd: (id: string) => void }) {
  let el: HTMLElement | null = null

  const { isOver } = useDroppable({
    element: () => el,
    data: { columnId: props.id }, // attached to this target; readable by the monitor
    canDrop: (source) => source.type === 'card', // reject anything that isn't a card
    onDragEnter: (source) => console.log('card entered:', source.id),
    onDragLeave: () => console.log('left'),
    onDrop: (source) => props.onAdd(source.id as string),
  })

  return (
    <div ref={(r) => (el = r)} class={isOver() ? 'column column--over' : 'column'}>
      Drop a card here
    </div>
  )
}
```

The callbacks receive the **source** draggable's `data` (typed as `DragData`). Use `canDrop` to reject incompatible payloads — when it returns `false`, the target won't highlight, `onDragEnter` won't fire, and a drop won't land.

:::warning
The `source` payload reaching `canDrop` / `onDragEnter` / `onDrop` is typed `DragData` (`Record<string, unknown>`), not your draggable's `T` — Pragmatic DnD doesn't carry the source's generic across the boundary. Narrow it yourself (`source.type === 'card'`, `typeof source.id === 'string'`) before trusting fields.
:::

### `useDroppable` options

| Option        | Type                                  | Required | Description                                                                       |
| ------------- | ------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `element`     | `() => HTMLElement \| null`           | yes      | Getter for the drop-target element.                                               |
| `data`        | `T \| (() => T)`                      | no       | Data attached to this target — surfaced to a `useDragMonitor`'s `onDrop` target arg. |
| `canDrop`     | `(sourceData: DragData) => boolean`   | no       | Filter what can drop here. Omit to accept everything.                             |
| `onDragEnter` | `(sourceData: DragData) => void`      | no       | Fired when an accepted draggable enters.                                          |
| `onDragLeave` | `() => void`                          | no       | Fired when the draggable leaves.                                                  |
| `onDrop`      | `(sourceData: DragData) => void`      | no       | Fired when an accepted draggable is released over this target.                    |

### `useDroppable` result

| Property | Type            | Description                                                                  |
| -------- | --------------- | ---------------------------------------------------------------------------- |
| `isOver` | `() => boolean` | `true` while an **accepted** draggable is hovering this target (reactive).   |

## `useSortable`

A full reorderable list — pointer dragging, auto-scroll, closest-edge detection, keyboard reordering, and ARIA wiring — driven from a single reactive `items()` signal.

```tsx
import { signal, For } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'

function TodoList() {
  const items = signal([
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
    { id: '3', name: 'Charlie' },
  ])

  const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
    items,
    by: (item) => item.id,
    onReorder: (next) => items.set(next),
    axis: 'vertical',
  })

  return (
    <ul ref={containerRef}>
      <For each={items()} by={(item) => item.id}>
        {(item) => (
          <li
            ref={itemRef(item.id)}
            class={activeId() === item.id ? 'sortable sortable--dragging' : 'sortable'}
            style={
              overId() === item.id
                ? `border-${overEdge()}: 2px solid var(--accent)`
                : ''
            }
          >
            {item.name}
          </li>
        )}
      </For>
    </ul>
  )
}
```

### How the pieces connect

- `containerRef` goes on the scroll container (the `<ul>`). It registers auto-scroll, the reorder-finalizing drop target, and the keyboard handler.
- `itemRef(key)` returns a ref callback you spread onto each row — it must be called with the **same key** your `by` extractor returns and your `<For by>` uses. This makes each row both a draggable and a closest-edge drop target.
- `activeId()` is the key of the row currently being dragged — use it to dim/elevate the dragged row.
- `overId()` + `overEdge()` tell you which row the pointer is over and which **edge** (`'top'`/`'bottom'` for vertical, `'left'`/`'right'` for horizontal) the drop would land against. Render an insertion indicator from this pair.

When a drop completes, the hook computes the reordered array and calls `onReorder(next)` — you commit it (`items.set(next)`) and the keyed `<For>` reconciles the DOM. The hook never mutates your list directly.

:::warning
`onReorder` hands you a **new array** — it does not mutate `items()`. You own committing it. Drive the same `items` signal you passed in, and make sure `by` returns the same stable key your `<For by>` uses, or the list will tear on reorder.
:::

### Horizontal lists

Set `axis: 'horizontal'` for a row layout. This switches edge detection to `'left'`/`'right'` and remaps the keyboard shortcuts to `Alt+ArrowLeft` / `Alt+ArrowRight`:

```tsx
const { containerRef, itemRef } = useSortable({
  items,
  by: (item) => item.id,
  onReorder: (next) => items.set(next),
  axis: 'horizontal',
})
```

### Keyboard reordering & accessibility

`useSortable` is keyboard-operable out of the box. Each item ref:

- sets `role="listitem"` and `aria-roledescription="sortable item"`,
- sets `tabindex="0"` (only if you haven't set one already),
- tags the element with a `data-pyreon-sort-key` attribute for focus tracking.

A focused item can be moved with **`Alt+ArrowUp` / `Alt+ArrowDown`** (vertical) or **`Alt+ArrowLeft` / `Alt+ArrowRight`** (horizontal). Each press swaps the focused item with its neighbour, calls `onReorder`, and restores focus to the moved item after the DOM updates — so a keyboard user can reorder the whole list without touching a pointer.

:::tip
The Alt-key reorder is a **neighbour swap** (it exchanges the focused item with the adjacent one and stops at the list boundaries), distinct from the pointer drag which inserts relative to the closest edge. Both call your single `onReorder`.
:::

### Cross-list boards (`groupId`)

Two `useSortable` instances that share the same **`groupId`** form one drop universe — items can be dragged from one list into the other. This is the Trello / Notion / Linear board shape. Without `groupId`, each sortable is a private universe and rejects drags from other lists.

When an item crosses lists:

- the **destination** sortable's `onCrossListReceive(item, targetIndex)` fires — insert the moved item into that list at `targetIndex`;
- the **source** sortable's `onCrossListDrop(item)` fires — remove the item from that list.

```tsx
import { signal, For } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'

type Card = { id: string; title: string }

function Column(props: { title: string; cards: () => Card[]; setCards: (c: Card[]) => void }) {
  const { containerRef, itemRef, activeId } = useSortable<Card>({
    items: props.cards,
    by: (c) => c.id,
    onReorder: (next) => props.setCards(next),
    groupId: 'kanban-board', // ← same id across every column

    // An item left THIS column for a sibling — drop it from here.
    onCrossListDrop: (card) => props.setCards(props.cards().filter((c) => c.id !== card.id)),

    // An item arrived from a sibling column — insert it here.
    onCrossListReceive: (card, index) => {
      const next = [...props.cards()]
      next.splice(index, 0, card)
      props.setCards(next)
    },
  })

  return (
    <section class="column">
      <h3>{props.title}</h3>
      <ul ref={containerRef}>
        <For each={props.cards()} by={(c) => c.id}>
          {(card) => (
            <li ref={itemRef(card.id)} class={activeId() === card.id ? 'dragging' : ''}>
              {card.title}
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}

function Board() {
  const todo = signal<Card[]>([{ id: 'a', title: 'Write docs' }])
  const doing = signal<Card[]>([{ id: 'b', title: 'Ship dnd' }])
  const done = signal<Card[]>([])

  return (
    <div class="board">
      <Column title="To do" cards={todo} setCards={todo.set} />
      <Column title="Doing" cards={doing} setCards={doing.set} />
      <Column title="Done" cards={done} setCards={done.set} />
    </div>
  )
}
```

Dropping an item onto another column's **item** inserts it at that item's edge; dropping onto the column **background** appends it to the end of that list (`targetIndex === items().length`). The source/destination split means each column owns exactly one mutation — no shared board state, no double-inserts.

:::note
`onCrossListDrop` and `onCrossListReceive` only fire when `groupId` is set. A plain `useSortable` (no `groupId`) silently rejects drags from any other sortable, so the same-list reorder path is unaffected.
:::

### `useSortable` options

| Option               | Type                                   | Required | Description                                                                                  |
| -------------------- | -------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `items`              | `() => T[]`                            | yes      | Reactive list to sort (pass the `signal` directly — it's callable).                          |
| `by`                 | `(item: T) => string \| number`        | yes      | Stable key extractor. Must match the key your `<For by>` uses.                               |
| `onReorder`          | `(items: T[]) => void`                 | yes      | Called with the reordered array after a same-list drop or keyboard move. You commit it.      |
| `axis`               | `'vertical' \| 'horizontal'`           | no       | Sort axis. Default `'vertical'`. Controls edge detection + keyboard arrow mapping.           |
| `groupId`            | `string`                               | no       | Opt-in cross-list universe. Sortables sharing a `groupId` accept drags from one another.     |
| `onCrossListDrop`    | `(item: T) => void`                    | no       | Fired on the **source** when one of its items is dropped on a sibling group. Remove the item. |
| `onCrossListReceive` | `(item: T, targetIndex: number) => void` | no     | Fired on the **destination** when a sibling-group item drops on it. Insert at `targetIndex`. |

### `useSortable` result

| Property       | Type                                            | Description                                                                                  |
| -------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `containerRef` | `(el: HTMLElement \| null) => void`             | Ref for the scroll container — registers auto-scroll, reorder drop target, and keyboard handling. |
| `itemRef`      | `(key: string \| number) => (el: HTMLElement \| null) => void` | Factory — call with the item's key, spread the result as the row's `ref`.   |
| `activeId`     | `() => string \| number \| null`                | Key of the row currently being dragged (`null` when idle).                                   |
| `overId`       | `() => string \| number \| null`                | Key of the row the pointer is over (`null` when not over a row).                             |
| `overEdge`     | `() => DropEdge \| null`                         | Closest edge of the hovered row: `'top'`/`'bottom'` or `'left'`/`'right'`.                    |

:::tip
The ref callbacks accept `HTMLElement | null` because Pyreon's runtime calls a `ref` with `null` on unmount. The hook treats the `null` call as a no-op — per-item Pragmatic DnD registrations are disposed individually when an item unmounts or re-registers (so a churning `<For>` list never accumulates dead listeners), and the container-level registrations are released via `onCleanup` when the whole sortable unmounts.
:::

## `useFileDrop`

A native-file drop zone with MIME-type and count filtering. Built on Pragmatic DnD's external/file adapter, so it accepts files dragged in from the OS — not in-page draggables.

```tsx
import { useFileDrop } from '@pyreon/dnd'

function ImageUploader(props: { onFiles: (files: File[]) => void }) {
  let zone: HTMLElement | null = null

  const { isOver, isDraggingFiles } = useFileDrop({
    element: () => zone,
    accept: ['image/*', '.pdf'], // MIME globs OR extensions
    maxFiles: 5,
    disabled: () => props.uploading,
    onDrop: (files) => props.onFiles(files),
  })

  return (
    <div
      ref={(r) => (zone = r)}
      class={isOver() ? 'dropzone dropzone--over' : isDraggingFiles() ? 'dropzone dropzone--ready' : 'dropzone'}
    >
      {isOver()
        ? 'Release to upload'
        : isDraggingFiles()
          ? 'Drop files here'
          : 'Drag images or PDFs to upload'}
    </div>
  )
}
```

`useFileDrop` exposes **two** signals so you can stage the UI:

- `isDraggingFiles()` flips `true` the moment files are dragged **anywhere on the page** — use it to reveal/highlight every drop zone (a page-wide "drop ready" affordance).
- `isOver()` flips `true` only while files hover **this** element — use it for the active "release here" state.

### Filtering

`accept` filters the dropped files before `onDrop` fires. Each pattern is matched as:

- an **extension** if it starts with `.` (`'.pdf'` → matches files whose name ends in `.pdf`, case-insensitive),
- a **MIME glob** if it ends in `/*` (`'image/*'` → matches `image/png`, `image/jpeg`, …),
- an **exact MIME type** otherwise (`'application/pdf'`).

`maxFiles` truncates the result to the first N files. After filtering and truncation, `onDrop` only fires if **at least one** file remains — a drop of nothing-but-rejected files is silently dropped.

```tsx
// Accept up to 3 spreadsheets, by extension or exact MIME
useFileDrop({
  element: () => zone,
  accept: ['.csv', '.xlsx', 'application/vnd.ms-excel'],
  maxFiles: 3,
  onDrop: (files) => importSpreadsheets(files),
})
```

:::warning
`maxFiles` **truncates silently** — it keeps the first N files and discards the rest, it does not reject the whole drop. If you need to *reject* an over-count drop with a message, check `files.length` against your limit inside `onDrop` yourself and surface the error there.
:::

### `useFileDrop` options

| Option     | Type                         | Required | Description                                                                 |
| ---------- | ---------------------------- | -------- | --------------------------------------------------------------------------- |
| `element`  | `() => HTMLElement \| null`  | yes      | Getter for the drop-zone element.                                           |
| `onDrop`   | `(files: File[]) => void`    | yes      | Called with the filtered, count-limited files (only if ≥1 survives).        |
| `accept`   | `string[]`                   | no       | Extensions (`'.pdf'`), MIME globs (`'image/*'`), or exact MIME types.       |
| `maxFiles` | `number`                     | no       | Keep at most this many files (excess silently truncated).                   |
| `disabled` | `boolean \| (() => boolean)` | no       | Disable drops. A getter is re-evaluated on each drag-over.                  |

### `useFileDrop` result

| Property          | Type            | Description                                                |
| ----------------- | --------------- | ---------------------------------------------------------- |
| `isOver`          | `() => boolean` | Files are hovering **this** drop zone (reactive).          |
| `isDraggingFiles` | `() => boolean` | Files are being dragged **anywhere on the page** (reactive). |

## `useDragMonitor`

Observe **every** drag on the page without owning a draggable or a drop target. Use it for global overlays, cross-region coordination, and analytics.

```tsx
import { useDragMonitor } from '@pyreon/dnd'
import { Show } from '@pyreon/core'

function GlobalDragOverlay() {
  const { isDragging, dragData } = useDragMonitor({
    canMonitor: (data) => data.type === 'card', // ignore non-card drags
    onDragStart: (data) => analytics.track('drag_start', { id: data.id }),
    onDrop: (source, target) => analytics.track('drag_drop', { from: source.id, to: target.columnId }),
  })

  return (
    <Show when={isDragging()}>
      <div class="drag-overlay">Moving: {() => String(dragData()?.id ?? '')}</div>
    </Show>
  )
}
```

`canMonitor` filters which drags this monitor reacts to — return `false` to ignore a drag entirely (it won't flip `isDragging`, won't set `dragData`, and won't fire the callbacks). It's optional; omit it to monitor everything.

`onDrop` receives **two** payloads: the dragged source's `data`, and the drop target's `data` (the object you passed as `useDroppable`'s / `useSortable`'s `data`). When a drag ends with no drop target (a cancel, or a release over empty space), the target arg is an empty object `{}` rather than `undefined` — so destructuring it is always safe.

### `useDragMonitor` options

| Option        | Type                                              | Required | Description                                           |
| ------------- | ------------------------------------------------- | -------- | ----------------------------------------------------- |
| `canMonitor`  | `(data: DragData) => boolean`                     | no       | Filter which drags to observe. Omit to observe all.   |
| `onDragStart` | `(data: DragData) => void`                        | no       | Fired on any monitored drag start.                    |
| `onDrop`      | `(sourceData: DragData, targetData: DragData) => void` | no  | Fired on any monitored drop. `targetData` is `{}` if there was no drop target. |

### `useDragMonitor` result

| Property     | Type                      | Description                                                  |
| ------------ | ------------------------- | ------------------------------------------------------------ |
| `isDragging` | `() => boolean`           | `true` while any monitored element is being dragged.         |
| `dragData`   | `() => DragData \| null`  | The current monitored drag's data, or `null` when not dragging. |

:::note
`useDragMonitor` registers immediately (it has no element to wait for), unlike the element-bound hooks which defer their setup to the next microtask. The monitor sees drags from `useDraggable` and `useSortable` — anything registered via Pragmatic DnD's element adapter on the page.
:::

## Server-side rendering

Every hook is **SSR-safe**. On the server (`typeof document === 'undefined'`) each hook short-circuits before touching the DOM and returns inert results:

| Hook              | Server return                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| `useDraggable`    | `{ isDragging: () => false }`                                             |
| `useDroppable`    | `{ isOver: () => false }`                                                 |
| `useSortable`     | no-op `containerRef` / `itemRef`; `activeId` / `overId` / `overEdge` → `null` |
| `useFileDrop`     | `{ isOver: () => false, isDraggingFiles: () => false }`                   |
| `useDragMonitor`  | `{ isDragging: () => false, dragData: () => null }`                        |

So an SSR page renders cleanly — your `ref` callbacks still wire up, but no Pragmatic DnD registration happens until the component hydrates in the browser, where the hook re-runs with a live `document`. There's nothing to guard manually.

## Lifecycle & timing

The element-bound hooks (`useDraggable`, `useDroppable`, `useFileDrop`, `useSortable`) **defer their registration to the next microtask** (`queueMicrotask`). This is why you can call the hook before the element exists — the hook reads `options.element()` on the microtask, by which time your `ref` callback has populated it. If a component unmounts before that microtask fires, the hook detects it (its `onCleanup` already ran) and skips registration, so there's never a leaked target.

:::tip
Because cleanup is wired into Pyreon's lifecycle, the natural way to "stop" a drag interaction is to unmount the component (e.g. behind a `<Show>`). There's no `dispose()` to call — the hooks have no public teardown method.
:::

## TypeScript

All option/result interfaces and the shared types are exported:

```ts
import type {
  DragData, // Record<string, unknown> — the transferred payload shape
  DropEdge, // 'top' | 'bottom' | 'left' | 'right'
  DropLocation, // { edge: DropEdge | null; data: DragData }
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

`useDraggable<T>` and `useDroppable<T>` are generic over your `DragData` subtype, so you can type the payload at the call site:

```tsx
type CardData = { id: string; type: 'card'; column: string }

const { isDragging } = useDraggable<CardData>({
  element: () => el,
  data: { id, type: 'card', column },
})
```

`useSortable<T>` is generic over your **item** type (`T`), not a `DragData` shape — the item value flows through `by`, `onReorder`, `onCrossListDrop`, and `onCrossListReceive` fully typed.

:::warning
The generic only constrains what *this* draggable produces. A drop handler (`useDroppable`'s `canDrop`/`onDrop`, `useDragMonitor`'s `onDrop`) receives the source data as the wide `DragData` type — Pragmatic DnD erases the source's generic across the drag boundary. Narrow incoming data with a discriminant field (`data.type === 'card'`) before reading typed fields off it.
:::

## API Reference

### Hooks

| Export             | Signature                                                          | Description                                                            |
| ------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `useDraggable`     | `<T extends DragData>(options: UseDraggableOptions<T>) => UseDraggableResult` | Make an element draggable; tracks `isDragging`.         |
| `useDroppable`     | `<T extends DragData>(options: UseDroppableOptions<T>) => UseDroppableResult` | Make an element a drop target; tracks `isOver`.         |
| `useSortable`      | `<T>(options: UseSortableOptions<T>) => UseSortableResult`         | Reorderable list with auto-scroll, edges, keyboard, and cross-list support. |
| `useFileDrop`      | `(options: UseFileDropOptions) => UseFileDropResult`               | Native-file drop zone with MIME/count filtering.                      |
| `useDragMonitor`   | `(options?: UseDragMonitorOptions) => UseDragMonitorResult`        | Observe every drag on the page (options optional).                    |

### Shared types

| Type           | Definition                                          | Notes                                                          |
| -------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| `DragData`     | `Record<string, unknown>`                           | The transferred payload. Default generic for the data-bearing hooks. |
| `DropEdge`     | `'top' \| 'bottom' \| 'left' \| 'right'`            | Closest-edge result for sortable hover.                        |
| `DropLocation` | `{ edge: DropEdge \| null; data: DragData }`        | Drop-position descriptor (edge + target data).                 |

### Option & result types

| Type                    | Shape                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `UseDraggableOptions<T>` | `{ element; data; handle?; disabled?; onDragStart?; onDragEnd? }`                           |
| `UseDraggableResult`    | `{ isDragging: () => boolean }`                                                              |
| `UseDroppableOptions<T>` | `{ element; data?; canDrop?; onDragEnter?; onDragLeave?; onDrop? }`                         |
| `UseDroppableResult`    | `{ isOver: () => boolean }`                                                                  |
| `UseSortableOptions<T>` | `{ items; by; onReorder; axis?; groupId?; onCrossListDrop?; onCrossListReceive? }`          |
| `UseSortableResult`     | `{ containerRef; itemRef; activeId; overId; overEdge }`                                      |
| `UseFileDropOptions`    | `{ element; onDrop; accept?; maxFiles?; disabled? }`                                         |
| `UseFileDropResult`     | `{ isOver: () => boolean; isDraggingFiles: () => boolean }`                                  |
| `UseDragMonitorOptions` | `{ onDragStart?; onDrop?; canMonitor? }`                                                     |
| `UseDragMonitorResult`  | `{ isDragging: () => boolean; dragData: () => DragData \| null }`                            |
