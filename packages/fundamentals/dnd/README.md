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
  const { ref, isDragging } = useDraggable({
    data: { id: props.card.id, type: 'card' },
  })

  return (
    <div ref={ref} class={() => (isDragging() ? 'opacity-50' : '')}>
      {props.card.title}
    </div>
  )
}

function DropZone() {
  const { ref, isOver } = useDroppable({
    canDrop: (data) => data.type === 'card',
    onDrop: (data, { edge }) => acceptCard(data.id as string, edge),
  })

  return (
    <div ref={ref} class={() => (isOver() ? 'bg-blue-50' : '')}>
      Drop here
    </div>
  )
}
```

## Hooks

### Binding the element: `ref` or `element`

`useDraggable` / `useDroppable` / `useFileDrop` return a `ref` callback — attach it (`<div ref={ref}>`) and the registration follows the element: it registers when the element mounts (even if that is long after the hook ran — behind `<Show>`, a lazy branch), moves when the element is swapped, and is disposed on unmount. The `element: () => el` getter still works: it is resolved on a microtask after the hook runs, and a getter that reads a **signal** re-registers when the signal changes. A getter that is still `null` at that point (with no `ref` attached) prints a `[Pyreon]` dev warning instead of silently registering nothing.

### `useDraggable({ element?, data, handle?, disabled?, preview?, onDragStart?, onDragEnd? })`

Make an element draggable. `data` may be an object OR a function for dynamic payloads. `disabled` is reactive (accepts a function). `handle` lets you scope drag initiation to a sub-element.

```ts
type Result = { isDragging: () => boolean; ref: (el: HTMLElement | null) => void }
```

### `useDroppable<TTarget, TSource>({ element?, data?, canDrop?, onDragEnter?, onDragLeave?, onDrop?, edges?, sticky? })`

Make an element a drop target. `canDrop(sourceData)` filters; return `false` to reject — type the SOURCE data with the second generic. `onDrop(sourceData, { edge, data })` receives where it landed: the closest configured edge (`null` without `edges`) and this target's own `data`, captured before `isOver` / `overEdge` reset.

```ts
type Result = {
  isOver: () => boolean
  overEdge: () => DropEdge | null // live closest edge while hovered (needs `edges`)
  ref: (el: HTMLElement | null) => void
}
```

### `useSortable({ items, by, onReorder, axis?, label?, disabled?, groupId?, onCrossListDrop?, onCrossListReceive? })`

Full sortable list with edge detection, auto-scroll, and keyboard reordering. `by` matches Pyreon's `<For by={...}>` pattern so the same key extractor flows through.

```tsx
const cols = signal<Column[]>([])

const { containerRef, itemRef, isActive, isOverKey, overEdge } = useSortable({
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
        class={isActive(col.id) ? 'dragging' : ''}
        style={() =>
          isOverKey(col.id) && overEdge() === 'top'
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
- Keyboard reordering — Space/Enter picks the focused item up, the axis arrows move it, Space/Enter drops it, Escape cancels and restores its position; Alt+Arrow moves directly
- ARIA: `role="listitem"` (only when the item has no role of its own), `role="list"` on a non-`<ul>`/`<ol>` container, `aria-roledescription`, `tabindex`
- `label: (item) => string` — human names in screen-reader announcements
- `disabled` (boolean or accessor) — blocks pointer drags and keyboard reordering
- `groupId` + `onCrossListDrop` / `onCrossListReceive` — drag between sortables sharing a group (kanban)
- `itemHandleRef(key)` — scope drag initiation to a grip element inside the row
- `overEdge()`, `activeId()`, `overId()`, plus the O(2) `isActive(key)` / `isOverKey(key)` selectors
- Fine-grained teardown: each **item** registration is disposed the moment its `itemRef` fires with `null` (or re-registers), and the **container** registration (auto-scroll + reorder drop-target + keyboard handler) is disposed on `containerRef(null)` / re-register — so a churning `<For>` list _and_ a `<Show>`-toggled container never leak listeners on detached elements.

### `useFileDrop({ element?, onDrop, onReject?, accept?, maxFiles?, disabled? })`

Native file-drop zone. `accept` mirrors `<input accept>` syntax (`['image/*', '.pdf']`, and `'*'` / `'*/*'` for anything); `maxFiles` enforces an upper bound; both filter the array passed to `onDrop`. `onReject(files, reason)` receives what was filtered out (`reason`: `'accept'` or `'maxFiles'`).

```ts
type Result = {
  isOver: () => boolean // files dragged over THIS zone
  isDraggingFiles: () => boolean // files dragged anywhere on the page
  ref: (el: HTMLElement | null) => void
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

## Accessibility (built in)

`useSortable` announces drags through `@pyreon/a11y`'s live region — "Picked up Alice", "Moved Alice to position 2 of 3", "Dropped …" — and auto-creates a visually-hidden instructions node linked to every item via `aria-describedby` (it lives in a shared host on `document.body`, never inside your list). Pass `label: (item) => string` so announcements use human names instead of raw keys. Keyboard pickup mode (Space/Enter, arrows, Escape) and Alt+Arrow direct moves ship by default.

## Custom drag previews, edges, handles

- `useDraggable({ preview: { render(container) { /* draw */ }, offset: 'center' } })` — replace the browser's default drag snapshot (pdnd's `setCustomNativeDragPreview`; offsets: `'pointer-outside' | 'center' | 'preserve-offset'`).
- `useDroppable({ edges: ['top', 'bottom'], sticky: true })` — closest-edge detection on plain drop zones via the returned `overEdge()` accessor; `sticky` keeps the target held across gaps.
- `useSortable().itemHandleRef(key)` — scope drag initiation to a grip element inside the row; rows without a handle stay fully draggable.

## Gotchas

- **Hooks are SSR-safe** — they return zero-state accessors when `document` is undefined. Real registration happens at first browser tick.
- **Prefer the returned `ref` over `element: () => el`.** A getter reading a plain `let` is resolved once (on a microtask); it can only re-resolve when it reads a signal. The `ref` follows mounts, swaps and unmounts by construction.
- **`useSortable` requires `items` to be reactive** (a getter or signal call) — the hook needs to re-derive on insert / remove. Passing a captured array snapshot breaks reordering.
- **`canMonitor` / `canDrop` run on every drag event** — keep them cheap. For expensive checks, derive a flag in a `computed` upstream.
- **`useFileDrop` only fires on REAL file drags from the OS** — not from `useDraggable` (those go through pdnd's element adapter). The two adapters are isolated.
- **`onDrop` receives accepted files only** — files rejected by `accept` / `maxFiles` go to `onReject(files, reason)`.
- **`@pyreon/dnd` does NOT bundle pdnd** — the pragmatic-drag-and-drop chunks come from your app's bundle graph. ~6KB minified for the element adapter (the common case).

## Performance

The signal-driven layer adds **near-zero overhead** over calling pdnd directly. A package-level benchmark (`bun run bench`) measures the _wrapper tax_ — the JS the ergonomic hook adds over a hand-rolled Pyreon+pdnd integration wiring the same reactive state — against the **real** pdnd build under happy-dom, with per-`(op × impl)` process isolation and a bootstrap CI95. `useDraggable` / `useDroppable` / `useSortable`-item mount→unmount lifecycles all tie the hand-rolled baseline (CI overlap); `useDragMonitor` adds ~one closure allocation per mount; per drag-event dispatch adds one optional-callback hop. Reactive DnD at ~raw-pdnd cost. The bench also measures the ROW-BINDING idiom at scale: at N=1000 sortable rows, one row-enter costs ~26µs with the naive `overId() === key` equality idiom (every row subscribes — O(N) notifies) vs ~1.5µs with the `isOverKey(key)` selector idiom (**~18× / 94% faster**, `createSelector`-backed O(2) notifies — use the selectors, they exist for exactly this). (Real pointer-gesture timing is browser-dependent and out of scope for the micro-bench; author-judge disclosed.)

## Documentation

Full docs: [pyreon.dev/docs/dnd](https://pyreon.dev/docs/dnd) (or `docs/src/content/docs/dnd.md` in this repo).

## License

MIT
