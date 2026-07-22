import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/dnd',
  title: 'Drag & Drop',
  tagline:
    'Signal-driven drag and drop over @atlaskit/pragmatic-drag-and-drop — draggable, droppable, sortable, file drop, monitor',
  description:
    "Signal-driven drag and drop for Pyreon. A thin wrapper over Atlassian's `pragmatic-drag-and-drop` (the engine behind Trello / Jira): pdnd owns the native-event lifecycle, hit-testing, and edge detection; `@pyreon/dnd` adapts every state field into a Pyreon signal accessor (`isDragging` / `isOver` / `activeId` / `overId` / `overEdge` / `dragData`) and wires every pdnd teardown into `onCleanup`. Five hooks cover the common surfaces — single draggable, single drop target, sortable list with edge detection + auto-scroll + keyboard reordering + opt-in cross-list boards, native-file drop with MIME / count filtering, and a page-global drag monitor.",
  category: 'browser',
  longExample: `import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
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
const { containerRef, itemRef, isActive, isOverKey, overEdge } = useSortable({
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
        class={isActive(col.id) ? 'dragging' : ''}
        style={() => (isOverKey(col.id) && overEdge() === 'top' ? 'border-top: 2px solid blue' : '')}
      >
        {col.name}
      </li>
    )}
  </For>
</ul>`,
  features: [
    'useDraggable / useDroppable / useSortable / useFileDrop / useDragMonitor — five hooks over pragmatic-drag-and-drop',
    'Every drag-state field is a fine-grained signal accessor (isDragging / isOver / activeId / overId / overEdge / dragData)',
    'Sortable: auto-scroll near container edges, closest-edge detection, Alt+Arrow keyboard reordering, ARIA wiring',
    'Cross-list boards via groupId — onCrossListDrop (source removes) + onCrossListReceive (destination inserts)',
    'Native file drop with accept (extension / MIME glob / exact MIME) and maxFiles filtering + page-wide isDraggingFiles',
    'Automatic teardown via onCleanup — sortable disposes per-item AND container pdnd registrations individually (churning <For> lists and <Show>-toggled containers never leak)',
    'SSR-safe: every hook short-circuits on the server and returns inert zero-state accessors',
  ],
  api: [
    {
      name: 'useDraggable',
      kind: 'hook',
      signature:
        '<T extends DragData = DragData>(options: UseDraggableOptions<T>) => UseDraggableResult',
      summary:
        "Make an element draggable with signal-driven state. `element` is a GETTER (`() => el`) captured on the next microtask, so the element only has to exist by mount time — not at hook-call time. `data` is the transferred payload: pass a plain object for static payloads or a function for dynamic ones (resolved fresh at each drag start via pdnd's `getInitialData`). `handle` scopes drag initiation to a sub-element; `disabled` accepts a reactive `() => boolean` re-evaluated on every drag attempt via `canDrag`. Returns `{ isDragging }` — a signal accessor that is `true` while THIS element is dragged. `onDragEnd` fires on both drop and cancel.",
      example: `let el: HTMLElement | null = null
const { isDragging } = useDraggable({
  element: () => el,
  data: () => ({ id: card.id, position: position() }), // getter → resolved per drag start
  handle: () => handleEl,        // only this sub-element starts a drag
  disabled: () => isSaving(),    // reactive — checked on every drag attempt
  onDragEnd: () => console.log('released (drop OR cancel)'),
})

;<div ref={(node) => (el = node)} class={() => (isDragging() ? 'opacity-50' : '')}>
  {card.title}
</div>`,
      mistakes: [
        'Passing the element itself instead of a getter — `element: el` captures `null` (refs are not populated at hook-call time); pass `element: () => el` so the deferred microtask setup reads the mounted node',
        'Passing an object `data` and expecting it to track current state — the object form is captured once at hook-call time; use the function form `data: () => ({ id: item.id(), position: position() })` for dynamic payloads (resolved fresh at each drag start)',
        'Passing a captured boolean for `disabled` when you want live toggling — `disabled: isSaving()` snapshots once; `disabled: () => isSaving()` is re-evaluated on every drag attempt',
        'Swapping the ref to a NEW DOM node after mount — registration happens exactly once on the next microtask; a later element change is not re-registered (unmount/remount the component instead)',
        'Treating `onDragEnd` as drop-only — it fires on BOTH a successful drop and a cancelled drag',
      ],
      seeAlso: ['useDroppable', 'useSortable', 'useDragMonitor'],
    },
    {
      name: 'useDroppable',
      kind: 'hook',
      signature:
        '<T extends DragData = DragData>(options: UseDroppableOptions<T>) => UseDroppableResult',
      summary:
        "Make an element a drop target with signal-driven hover state. `canDrop(sourceData)` filters incoming drags — when it returns `false` the target won't highlight, `onDragEnter` won't fire, and a drop won't land. `data` (value or getter) is attached to the target so a `useDragMonitor`'s `onDrop` can read target metadata. Returns `{ isOver }` — `true` only while an ACCEPTED draggable hovers this target. All callbacks receive the source's `data` as the wide `DragData` (`Record<string, unknown>`) — pdnd erases the source's generic across the drag boundary.",
      example: `let el: HTMLElement | null = null
const { isOver } = useDroppable({
  element: () => el,
  data: { columnId: props.id },                 // readable by useDragMonitor's onDrop target arg
  canDrop: (source) => source.type === 'card',  // reject anything that isn't a card
  onDrop: (source) => props.onAdd(source.id as string),
})

;<div ref={(node) => (el = node)} class={() => (isOver() ? 'bg-blue-50' : '')}>
  Drop a card here
</div>`,
      mistakes: [
        "Trusting `sourceData` as your draggable's typed `T` — it arrives as `DragData` (`Record<string, unknown>`); narrow with a discriminant (`source.type === 'card'`, `typeof source.id === 'string'`) before reading fields",
        'Expensive `canDrop` predicates — it runs on every drag event; derive a cheap flag in an upstream `computed` for costly checks',
        "Expecting `isOver` to flip for rejected drags — it only tracks ACCEPTED draggables; when `canDrop` returns `false`, `onDragEnter` never fires and there's no highlight",
      ],
      seeAlso: ['useDraggable', 'useDragMonitor'],
    },
    {
      name: 'useSortable',
      kind: 'hook',
      signature: '<T>(options: UseSortableOptions<T>) => UseSortableResult',
      summary:
        "Full reorderable list — pointer dragging, auto-scroll near container edges, closest-edge detection, Alt+Arrow keyboard reordering, and ARIA wiring (`role=\"listitem\"`, `aria-roledescription`, `tabindex`) — driven from a reactive `items()` getter. `by` extracts the stable key and MUST match your `<For by>` key. On drop the hook computes the reordered array and calls `onReorder(next)` — it never mutates your list; you commit it. `groupId` opts two sortables into one cross-list drop universe (Trello-style boards): the destination's `onCrossListReceive(item, index)` inserts, the source's `onCrossListDrop(item)` removes. Returns `containerRef` (scroll container), `itemRef(key)` (per-row ref factory), `itemHandleRef(key)` (optional grip-handle registrar scoping drag initiation), the `activeId` / `overId` / `overEdge` signal accessors, and `createSelector`-backed `isActive(key)` / `isOverKey(key)` predicates (O(2) notifies per change — prefer them over `activeId() === key`, which subscribes EVERY row). Drags are announced to screen readers via `@pyreon/a11y` (`label: (item) => string` names the item; a visually-hidden Alt+Arrow instructions node is auto-created and linked via `aria-describedby`).",
      example: `const items = signal([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }])

const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
  items,                              // reactive getter — signals are callable
  by: (item) => item.id,              // MUST match the <For by> key
  onReorder: (next) => items.set(next), // hook hands you a NEW array; you commit
  axis: 'vertical',                   // 'horizontal' flips edges + arrow keys
  label: (item) => item.name,         // names items in screen-reader announcements
})

;<ul ref={containerRef}>
  <For each={items()} by={(item) => item.id}>
    {(item) => (
      <li
        ref={itemRef(item.id)}
        class={isActive(item.id) ? 'dragging' : ''}
        style={() => (isOverKey(item.id) ? \`border-\${overEdge()}: 2px solid blue\` : '')}
      >
        {item.name}
      </li>
    )}
  </For>
</ul>`,
      mistakes: [
        'Passing a captured array snapshot as `items` — the hook re-derives on every drop / keypress, so `items` must be a reactive getter (`items: () => cols()` or the signal itself); a snapshot breaks reordering',
        'Mismatched keys — `by` must return the same stable key your `<For by>` uses, or the list tears on reorder',
        'Expecting the hook to mutate your list — `onReorder(next)` hands you a NEW array; commit it yourself (`items.set(next)`) or nothing visibly reorders',
        'Expecting cross-list drops without `groupId` — `onCrossListDrop` / `onCrossListReceive` only fire when `groupId` is set; without it each sortable is a private universe that rejects drags from other sortables',
        'Forgetting `containerRef` on the scroll container — auto-scroll, the reorder-finalizing drop target, and the Alt+Arrow keyboard handler all register there',
        'Binding rows with `activeId() === item.id` instead of `isActive(item.id)` — the equality read subscribes EVERY row to `activeId` (O(N) binding re-runs per drag change); the `createSelector`-backed predicates notify only the two affected rows',
        'Omitting `label` when keys are opaque ids — screen-reader announcements fall back to the raw key ("Picked up 41f3…"); pass `label: (item) => item.name`',
        'Calling `itemRef` with a different key than `by` returns — the drop-time reorder lookup finds items by that key (`findIndex` against `by(item)`), so a mismatch makes reorders silently no-op and mistracks per-key disposal',
      ],
      seeAlso: ['useDraggable', 'useDragMonitor'],
    },
    {
      name: 'useFileDrop',
      kind: 'hook',
      signature: '(options: UseFileDropOptions) => UseFileDropResult',
      summary:
        "Native-file drop zone over pdnd's external/file adapter — accepts files dragged in from the OS, not in-page draggables. `accept` filters like `<input accept>`: leading `.` matches the extension (case-insensitive), trailing `/*` is a MIME glob, anything else is an exact MIME type. `maxFiles` truncates to the first N. Returns TWO signal accessors: `isOver` (files hovering THIS zone) and `isDraggingFiles` (files dragged anywhere on the page — for a page-wide 'drop ready' affordance). `onDrop` receives the filtered, truncated files and only fires when at least one file survives.",
      example: `let zone: HTMLElement | null = null
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
</div>`,
      mistakes: [
        "Expecting it to catch in-page draggables — `useFileDrop` uses pdnd's external/file adapter and only fires for REAL file drags from the OS; `useDraggable` items go through the isolated element adapter",
        'Relying on `onDrop` for rejection feedback — files rejected by `accept` / `maxFiles` are silently filtered, and `onDrop` does not fire at all when zero files survive; check counts inside `onDrop` (or pair with `isOver`) to surface errors',
        "Writing `accept: ['pdf']` — extensions need the leading dot (`'.pdf'`); a bare string is treated as an exact MIME type and matches nothing",
        'Expecting `maxFiles` to reject an over-count drop — it TRUNCATES to the first N and discards the rest; enforce hard limits inside `onDrop` yourself',
      ],
      seeAlso: ['useDroppable', 'useDragMonitor'],
    },
    {
      name: 'useDragMonitor',
      kind: 'hook',
      signature: '(options?: UseDragMonitorOptions) => UseDragMonitorResult',
      summary:
        "Observe every element drag on the page without owning a draggable or drop target — for global overlays, analytics, or coordinating multiple drag areas. `canMonitor(data)` filters which drags this monitor reacts to (a `false` return means `isDragging` / `dragData` don't flip and no callback fires). `onDrop(sourceData, targetData)` receives the dragged source's data plus the drop target's `data` — `targetData` is an empty object `{}` (not `undefined`) when the drag ends with no drop target. Unlike the element-bound hooks, the monitor registers immediately (no microtask defer).",
      example: `const { isDragging, dragData } = useDragMonitor({
  canMonitor: (data) => data.type === 'card',
  onDrop: (source, target) => track('reorder', { from: source.id, to: target.columnId }),
})

;<Show when={isDragging()}>
  <div class="global-drag-overlay">Dragging: {() => String(dragData()?.id ?? '')}</div>
</Show>`,
      mistakes: [
        'Expecting `targetData` to be `undefined` on a cancelled drag — it is an empty object `{}` when there was no drop target, so destructuring is always safe but truthiness checks are not',
        'Expensive `canMonitor` predicates — they run on every drag event; keep them cheap or derive a flag upstream',
        'Expecting `dragData()` to survive after the drop — it resets to `null` the moment the drag ends; capture what you need inside `onDrop`',
      ],
      seeAlso: ['useDraggable', 'useDroppable', 'useSortable'],
    },
  ],
  gotchas: [
    {
      label: 'Deferred registration',
      note: 'The element-bound hooks (`useDraggable` / `useDroppable` / `useFileDrop`) defer pdnd registration to the next microtask so `ref` callbacks are populated first — call the hook in the component body and let the ref land. `useDragMonitor` registers immediately (it has no element to wait for).',
    },
    {
      label: 'SSR-safe',
      note: 'Every hook short-circuits when `document` is undefined and returns inert zero-state accessors (`isDragging: () => false`, no-op refs). Real registration happens client-side only — nothing to guard manually.',
    },
    {
      label: 'pdnd not bundled',
      note: "The three `@atlaskit/pragmatic-drag-and-drop*` packages are regular dependencies (installed automatically, never imported directly by consumers) and tree-shake per hook — `useDraggable` pulls only the element adapter (~6KB min), `useFileDrop` only the external/file adapter, `useSortable` adds auto-scroll + hitbox.",
    },
    {
      label: 'No dispose()',
      note: "Cleanup is wired into Pyreon's `onCleanup` — teardown fires when the owning component unmounts. There is no public teardown method; unmount the component (e.g. behind `<Show>`) to stop a drag interaction.",
    },
  ],
})
