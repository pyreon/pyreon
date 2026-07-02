---
title: "Drag & Drop — API Reference"
description: "Signal-driven drag and drop over @atlaskit/pragmatic-drag-and-drop — draggable, droppable, sortable, file drop, monitor"
---

# @pyreon/dnd — API Reference

> **Generated** from `dnd`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [dnd](/docs/dnd).

Signal-driven drag and drop for Pyreon. A thin wrapper over Atlassian's `pragmatic-drag-and-drop` (the engine behind Trello / Jira): pdnd owns the native-event lifecycle, hit-testing, and edge detection; `@pyreon/dnd` adapts every state field into a Pyreon signal accessor (`isDragging` / `isOver` / `activeId` / `overId` / `overEdge` / `dragData`) and wires every pdnd teardown into `onCleanup`. Five hooks cover the common surfaces — single draggable, single drop target, sortable list with edge detection + auto-scroll + keyboard reordering + opt-in cross-list boards, native-file drop with MIME / count filtering, and a page-global drag monitor.

## Features

- useDraggable / useDroppable / useSortable / useFileDrop / useDragMonitor — five hooks over pragmatic-drag-and-drop
- Every drag-state field is a fine-grained signal accessor (isDragging / isOver / activeId / overId / overEdge / dragData)
- Sortable: auto-scroll near container edges, closest-edge detection, Alt+Arrow keyboard reordering, ARIA wiring
- Cross-list boards via groupId — onCrossListDrop (source removes) + onCrossListReceive (destination inserts)
- Native file drop with accept (extension / MIME glob / exact MIME) and maxFiles filtering + page-wide isDraggingFiles
- Automatic teardown via onCleanup — per-item pdnd registrations disposed individually in churning &lt;For&gt; lists
- SSR-safe: every hook short-circuits on the server and returns inert zero-state accessors

## Complete example

A full, end-to-end usage of the package:

```tsx
import { signal, For } from '@pyreon/reactivity'
import { useDraggable, useDroppable, useSortable } from '@pyreon/dnd'

// Single draggable — element is a GETTER, state is a signal accessor:
function Card(props: { card: { id: string; title: string } }) {
  let el: HTMLElement | null = null
  const { isDragging } = useDraggable({
    element: () => el,
    data: { id: props.card.id, type: 'card' },
  })
  return (
    <div ref={(node) => (el = node)} class={() => (isDragging() ? 'opacity-50' : '')}>
      {props.card.title}
    </div>
  )
}

// Drop target — canDrop filters, sourceData is DragData (narrow it yourself):
function DropZone() {
  let el: HTMLElement | null = null
  const { isOver } = useDroppable({
    element: () => el,
    canDrop: (data) => data.type === 'card',
    onDrop: (data) => acceptCard(data.id as string),
  })
  return <div ref={(node) => (el = node)} class={() => (isOver() ? 'bg-blue-50' : '')}>Drop here</div>
}

// Sortable list — keyed like <For by>, hook computes the reorder, YOU commit it:
const cols = signal<Column[]>([])
const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
  items: () => cols(),
  by: (c) => c.id,
  onReorder: (next) => cols.set(next),
  axis: 'vertical',
})

;<ul ref={containerRef}>
  <For each={cols()} by={(c) => c.id}>
    {(col) => (
      <li
        ref={itemRef(col.id)}
        class={activeId() === col.id ? 'dragging' : ''}
        style={() => (overId() === col.id && overEdge() === 'top' ? 'border-top: 2px solid blue' : '')}
      >
        {col.name}
      </li>
    )}
  </For>
</ul>
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`useDraggable`](#usedraggable) | hook | Make an element draggable with signal-driven state. |
| [`useDroppable`](#usedroppable) | hook | Make an element a drop target with signal-driven hover state. |
| [`useSortable`](#usesortable) | hook | Full reorderable list — pointer dragging, auto-scroll near container edges, closest-edge detection, Alt+Arrow keyboard r |
| [`useFileDrop`](#usefiledrop) | hook | Native-file drop zone over pdnd's external/file adapter — accepts files dragged in from the OS, not in-page draggables. |
| [`useDragMonitor`](#usedragmonitor) | hook | Observe every element drag on the page without owning a draggable or drop target — for global overlays, analytics, or co |

## API

### useDraggable `hook`

```ts
<T extends DragData = DragData>(options: UseDraggableOptions<T>) => UseDraggableResult
```

Make an element draggable with signal-driven state. `element` is a GETTER (`() => el`) captured on the next microtask, so the element only has to exist by mount time — not at hook-call time. `data` is the transferred payload: pass a plain object for static payloads or a function for dynamic ones (resolved fresh at each drag start via pdnd's `getInitialData`). `handle` scopes drag initiation to a sub-element; `disabled` accepts a reactive `() => boolean` re-evaluated on every drag attempt via `canDrag`. Returns `{ isDragging }` — a signal accessor that is `true` while THIS element is dragged. `onDragEnd` fires on both drop and cancel.

**Example**

```tsx
let el: HTMLElement | null = null
const { isDragging } = useDraggable({
  element: () => el,
  data: () => ({ id: card.id, position: position() }), // getter → resolved per drag start
  handle: () => handleEl,        // only this sub-element starts a drag
  disabled: () => isSaving(),    // reactive — checked on every drag attempt
  onDragEnd: () => console.log('released (drop OR cancel)'),
})

;<div ref={(node) => (el = node)} class={() => (isDragging() ? 'opacity-50' : '')}>
  {card.title}
</div>
```

**Common mistakes**

- Passing the element itself instead of a getter — `element: el` captures `null` (refs are not populated at hook-call time); pass `element: () => el` so the deferred microtask setup reads the mounted node
- Passing an object `data` and expecting it to track current state — the object form is captured once at hook-call time; use the function form `data: () => ({ id: item.id(), position: position() })` for dynamic payloads (resolved fresh at each drag start)
- Passing a captured boolean for `disabled` when you want live toggling — `disabled: isSaving()` snapshots once; `disabled: () => isSaving()` is re-evaluated on every drag attempt
- Swapping the ref to a NEW DOM node after mount — registration happens exactly once on the next microtask; a later element change is not re-registered (unmount/remount the component instead)
- Treating `onDragEnd` as drop-only — it fires on BOTH a successful drop and a cancelled drag

**See also:** `useDroppable` · `useSortable` · `useDragMonitor`

---

### useDroppable `hook`

```ts
<T extends DragData = DragData>(options: UseDroppableOptions<T>) => UseDroppableResult
```

Make an element a drop target with signal-driven hover state. `canDrop(sourceData)` filters incoming drags — when it returns `false` the target won't highlight, `onDragEnter` won't fire, and a drop won't land. `data` (value or getter) is attached to the target so a `useDragMonitor`'s `onDrop` can read target metadata. Returns `{ isOver }` — `true` only while an ACCEPTED draggable hovers this target. All callbacks receive the source's `data` as the wide `DragData` (`Record<string, unknown>`) — pdnd erases the source's generic across the drag boundary.

**Example**

```tsx
let el: HTMLElement | null = null
const { isOver } = useDroppable({
  element: () => el,
  data: { columnId: props.id },                 // readable by useDragMonitor's onDrop target arg
  canDrop: (source) => source.type === 'card',  // reject anything that isn't a card
  onDrop: (source) => props.onAdd(source.id as string),
})

;<div ref={(node) => (el = node)} class={() => (isOver() ? 'bg-blue-50' : '')}>
  Drop a card here
</div>
```

**Common mistakes**

- Trusting `sourceData` as your draggable's typed `T` — it arrives as `DragData` (`Record<string, unknown>`); narrow with a discriminant (`source.type === 'card'`, `typeof source.id === 'string'`) before reading fields
- Expensive `canDrop` predicates — it runs on every drag event; derive a cheap flag in an upstream `computed` for costly checks
- Expecting `isOver` to flip for rejected drags — it only tracks ACCEPTED draggables; when `canDrop` returns `false`, `onDragEnter` never fires and there's no highlight

**See also:** `useDraggable` · `useDragMonitor`

---

### useSortable `hook`

```ts
<T>(options: UseSortableOptions<T>) => UseSortableResult
```

Full reorderable list — pointer dragging, auto-scroll near container edges, closest-edge detection, Alt+Arrow keyboard reordering, and ARIA wiring (`role="listitem"`, `aria-roledescription`, `tabindex`) — driven from a reactive `items()` getter. `by` extracts the stable key and MUST match your `<For by>` key. On drop the hook computes the reordered array and calls `onReorder(next)` — it never mutates your list; you commit it. `groupId` opts two sortables into one cross-list drop universe (Trello-style boards): the destination's `onCrossListReceive(item, index)` inserts, the source's `onCrossListDrop(item)` removes. Returns `containerRef` (scroll container), `itemRef(key)` (per-row ref factory), and the `activeId` / `overId` / `overEdge` signal accessors.

**Example**

```tsx
const items = signal([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }])

const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
  items,                              // reactive getter — signals are callable
  by: (item) => item.id,              // MUST match the <For by> key
  onReorder: (next) => items.set(next), // hook hands you a NEW array; you commit
  axis: 'vertical',                   // 'horizontal' flips edges + arrow keys
})

;<ul ref={containerRef}>
  <For each={items()} by={(item) => item.id}>
    {(item) => (
      <li
        ref={itemRef(item.id)}
        class={activeId() === item.id ? 'dragging' : ''}
        style={() => (overId() === item.id ? `border-${overEdge()}: 2px solid blue` : '')}
      >
        {item.name}
      </li>
    )}
  </For>
</ul>
```

**Common mistakes**

- Passing a captured array snapshot as `items` — the hook re-derives on every drop / keypress, so `items` must be a reactive getter (`items: () => cols()` or the signal itself); a snapshot breaks reordering
- Mismatched keys — `by` must return the same stable key your `<For by>` uses, or the list tears on reorder
- Expecting the hook to mutate your list — `onReorder(next)` hands you a NEW array; commit it yourself (`items.set(next)`) or nothing visibly reorders
- Expecting cross-list drops without `groupId` — `onCrossListDrop` / `onCrossListReceive` only fire when `groupId` is set; without it each sortable is a private universe that rejects drags from other sortables
- Forgetting `containerRef` on the scroll container — auto-scroll, the reorder-finalizing drop target, and the Alt+Arrow keyboard handler all register there
- Calling `itemRef` with a different key than `by` returns — the drop-time reorder lookup finds items by that key (`findIndex` against `by(item)`), so a mismatch makes reorders silently no-op and mistracks per-key disposal

**See also:** `useDraggable` · `useDragMonitor`

---

### useFileDrop `hook`

```ts
(options: UseFileDropOptions) => UseFileDropResult
```

Native-file drop zone over pdnd's external/file adapter — accepts files dragged in from the OS, not in-page draggables. `accept` filters like `<input accept>`: leading `.` matches the extension (case-insensitive), trailing `/*` is a MIME glob, anything else is an exact MIME type. `maxFiles` truncates to the first N. Returns TWO signal accessors: `isOver` (files hovering THIS zone) and `isDraggingFiles` (files dragged anywhere on the page — for a page-wide 'drop ready' affordance). `onDrop` receives the filtered, truncated files and only fires when at least one file survives.

**Example**

```tsx
let zone: HTMLElement | null = null
const { isOver, isDraggingFiles } = useFileDrop({
  element: () => zone,
  accept: ['image/*', '.pdf'],   // MIME glob OR extension
  maxFiles: 5,                   // silently truncates to the first 5
  onDrop: (files) => upload(files),
})

;<div
  ref={(node) => (zone = node)}
  class={() => (isOver() ? 'drop-active' : isDraggingFiles() ? 'drop-ready' : '')}
>
  Drop files here
</div>
```

**Common mistakes**

- Expecting it to catch in-page draggables — `useFileDrop` uses pdnd's external/file adapter and only fires for REAL file drags from the OS; `useDraggable` items go through the isolated element adapter
- Relying on `onDrop` for rejection feedback — files rejected by `accept` / `maxFiles` are silently filtered, and `onDrop` does not fire at all when zero files survive; check counts inside `onDrop` (or pair with `isOver`) to surface errors
- Writing `accept: ['pdf']` — extensions need the leading dot (`'.pdf'`); a bare string is treated as an exact MIME type and matches nothing
- Expecting `maxFiles` to reject an over-count drop — it TRUNCATES to the first N and discards the rest; enforce hard limits inside `onDrop` yourself

**See also:** `useDroppable` · `useDragMonitor`

---

### useDragMonitor `hook`

```ts
(options?: UseDragMonitorOptions) => UseDragMonitorResult
```

Observe every element drag on the page without owning a draggable or drop target — for global overlays, analytics, or coordinating multiple drag areas. `canMonitor(data)` filters which drags this monitor reacts to (a `false` return means `isDragging` / `dragData` don't flip and no callback fires). `onDrop(sourceData, targetData)` receives the dragged source's data plus the drop target's `data` — `targetData` is an empty object `{}` (not `undefined`) when the drag ends with no drop target. Unlike the element-bound hooks, the monitor registers immediately (no microtask defer).

**Example**

```tsx
const { isDragging, dragData } = useDragMonitor({
  canMonitor: (data) => data.type === 'card',
  onDrop: (source, target) => track('reorder', { from: source.id, to: target.columnId }),
})

;<Show when={isDragging()}>
  <div class="global-drag-overlay">Dragging: {() => String(dragData()?.id ?? '')}</div>
</Show>
```

**Common mistakes**

- Expecting `targetData` to be `undefined` on a cancelled drag — it is an empty object `{}` when there was no drop target, so destructuring is always safe but truthiness checks are not
- Expensive `canMonitor` predicates — they run on every drag event; keep them cheap or derive a flag upstream
- Expecting `dragData()` to survive after the drop — it resets to `null` the moment the drag ends; capture what you need inside `onDrop`

**See also:** `useDraggable` · `useDroppable` · `useSortable`

---

## Package-level notes

> **Deferred registration:** The element-bound hooks (`useDraggable` / `useDroppable` / `useFileDrop`) defer pdnd registration to the next microtask so `ref` callbacks are populated first — call the hook in the component body and let the ref land. `useDragMonitor` registers immediately (it has no element to wait for).

> **SSR-safe:** Every hook short-circuits when `document` is undefined and returns inert zero-state accessors (`isDragging: () => false`, no-op refs). Real registration happens client-side only — nothing to guard manually.

> **pdnd not bundled:** The three `@atlaskit/pragmatic-drag-and-drop*` packages are regular dependencies (installed automatically, never imported directly by consumers) and tree-shake per hook — `useDraggable` pulls only the element adapter (~6KB min), `useFileDrop` only the external/file adapter, `useSortable` adds auto-scroll + hitbox.

> **No dispose():** Cleanup is wired into Pyreon's `onCleanup` — teardown fires when the owning component unmounts. There is no public teardown method; unmount the component (e.g. behind `<Show>`) to stop a drag interaction.
