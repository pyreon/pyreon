# @pyreon/dnd

Signal-driven drag and drop over `@atlaskit/pragmatic-drag-and-drop`.

A small Pyreon-native wrapper over Atlassian's `pragmatic-drag-and-drop` (the same library Trello / Jira ship with). pdnd handles the native-event lifecycle, hit-testing, and edge detection; `@pyreon/dnd` adapts every state field into a Pyreon signal (`isDragging` / `isOver` / `activeId` / `overEdge` / `dragData`) so consumers compose with `effect` / `computed` / JSX without re-bridging. Five hooks cover the common surfaces — single draggable, single drop target, sortable list with edge detection + auto-scroll + keyboard reordering, native-file drop with MIME / count filtering, and a global drag monitor for overlays / analytics.

## Install

```bash
bun add @pyreon/dnd @pyreon/core @pyreon/reactivity
# pragmatic-drag-and-drop is a runtime dependency, installed automatically
```

## Quick start — single draggable + drop target

```tsx
import { useDraggable, useDroppable } from '@pyreon/dnd'

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

function DropZone() {
  let el: HTMLElement | null = null
  const { isOver } = useDroppable({
    element: () => el,
    canDrop: (data) => data.type === 'card',
    onDrop: (data) => acceptCard(data.id as string),
  })

  return (
    <div ref={(node) => (el = node)} class={() => (isOver() ? 'bg-blue-50' : '')}>
      Drop here
    </div>
  )
}
```

## Hooks

### `useDraggable({ element, data, handle?, disabled?, onDragStart?, onDragEnd? })`

Make an element draggable. `data` may be an object OR a function for dynamic payloads. `disabled` is reactive (accepts a function). `handle` lets you scope drag initiation to a sub-element.

```ts
type Result = { isDragging: () => boolean }
```

### `useDroppable({ element, data?, canDrop?, onDragEnter?, onDragLeave?, onDrop? })`

Make an element a drop target. `canDrop(sourceData)` filters; return `false` to reject. `data` is attached to the drop event so handlers can read target metadata.

```ts
type Result = { isOver: () => boolean }
```

### `useSortable({ items, by, onReorder, axis? })`

Full sortable list with edge detection, auto-scroll, and keyboard reordering. `by` matches Pyreon's `<For by={...}>` pattern so the same key extractor flows through.

```tsx
const cols = signal<Column[]>([])

const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
  items: () => cols(),
  by: (c) => c.id,
  onReorder: (next) => cols.set(next),
  axis: 'vertical', // or 'horizontal'
})

;<ul ref={containerRef}>
  <For each={cols()} by={(c) => c.id}>
    {(col) => (
      <li
        ref={itemRef(col.id)}
        class={activeId() === col.id ? 'dragging' : ''}
        style={() =>
          overId() === col.id && overEdge() === 'top'
            ? 'border-top: 2px solid blue'
            : ''
        }
      >
        {col.name}
      </li>
    )}
  </For>
</ul>
```

Behaviour:

- Auto-scroll when dragging near container edges
- `overEdge` signal — `'top'`/`'bottom'` (vertical) or `'left'`/`'right'` (horizontal)
- Keyboard reordering with Alt+Arrow keys
- ARIA: `role="listitem"`, `aria-roledescription`, `tabindex`
- Fine-grained teardown: each **item** registration is disposed the moment its `itemRef` fires with `null` (or re-registers), and the **container** registration (auto-scroll + reorder drop-target + keyboard handler) is disposed on `containerRef(null)` / re-register — so a churning `<For>` list _and_ a `<Show>`-toggled container never leak listeners on detached elements.

### `useFileDrop({ element, onDrop, accept?, maxFiles?, disabled? })`

Native file-drop zone. `accept` mirrors `<input accept>` syntax (`['image/*', '.pdf']`); `maxFiles` enforces an upper bound; both filter the array passed to `onDrop`.

```ts
type Result = {
  isOver: () => boolean // files dragged over THIS zone
  isDraggingFiles: () => boolean // files dragged anywhere on the page
}
```

`isDraggingFiles` is useful for showing a "drop here" affordance the moment files enter the window — not just when they hover the specific zone.

### `useDragMonitor({ canMonitor?, onDragStart?, onDrop? })`

Page-global drag state — for overlays, analytics, or coordinating multiple drag-and-drop areas.

```ts
type Result = {
  isDragging: () => boolean
  dragData: () => DragData | null
}
```

```tsx
const { isDragging, dragData } = useDragMonitor({
  canMonitor: (data) => data.type === 'card',
  onDrop: (source, target) => track('reorder', { source, target }),
})

;<Show when={isDragging()}>
  <div class="global-drag-overlay">Dragging: {() => dragData()?.name}</div>
</Show>
```

## Types

```ts
type DragData = Record<string, unknown>
type DropEdge = 'top' | 'bottom' | 'left' | 'right'
type DropLocation = { edge: DropEdge | null; data: DragData }
```

## Common patterns

### Cross-list sortable (kanban columns)

Multiple `useSortable` instances pointing at different column signals — combine with `useDragMonitor` for cross-list logic.

### Disable while saving

```ts
useDraggable({
  element: () => el,
  data: { id },
  disabled: () => isSaving(), // reactive — re-evaluates on signal change
})
```

### Dynamic data

```ts
useDraggable({
  element: () => el,
  data: () => ({ id: item.id(), position: position() }),
})
```

## Gotchas

- **Hooks are SSR-safe** — they return zero-state accessors when `document` is undefined. Real registration happens at first browser tick.
- **`element: () => el` must return the SAME element across reads** until the component unmounts. Setup is single-shot (deferred via `queueMicrotask`, never re-invoked) — reassigning `el` to a new node mid-life is NOT re-registered; the hook stays bound to the original node. Unmount and remount to bind a new element.
- **`useSortable` requires `items` to be reactive** (a getter or signal call) — the hook needs to re-derive on insert / remove. Passing a captured array snapshot breaks reordering.
- **`canMonitor` / `canDrop` run on every drag event** — keep them cheap. For expensive checks, derive a flag in a `computed` upstream.
- **`useFileDrop` only fires on REAL file drags from the OS** — not from `useDraggable` (those go through pdnd's element adapter). The two adapters are isolated.
- **`onDrop` receives accepted files only** — files rejected by `accept` / `maxFiles` are silently filtered. Pair with `onDragEnter` / `isOver` if you need user feedback on rejection.
- **`@pyreon/dnd` does NOT bundle pdnd** — the pragmatic-drag-and-drop chunks come from your app's bundle graph. ~6KB minified for the element adapter (the common case).

## Performance

The signal-driven layer adds **near-zero overhead** over calling pdnd directly. A package-level benchmark (`bun run bench`) measures the _wrapper tax_ — the JS the ergonomic hook adds over a hand-rolled Pyreon+pdnd integration wiring the same reactive state — against the **real** pdnd build under happy-dom, with per-`(op × impl)` process isolation and a bootstrap CI95. `useDraggable` / `useDroppable` / `useSortable`-item mount→unmount lifecycles all tie the hand-rolled baseline (CI overlap); `useDragMonitor` adds ~one closure allocation per mount; per drag-event dispatch adds one optional-callback hop. Reactive DnD at ~raw-pdnd cost. (Real pointer-gesture timing is browser-dependent and out of scope for the micro-bench; author-judge disclosed.)

## Documentation

Full docs: [pyreon.dev/docs/dnd](https://pyreon.dev/docs/dnd) (or `docs/src/content/docs/dnd.md` in this repo).

## License

MIT
