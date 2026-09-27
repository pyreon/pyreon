/** Data attached to a draggable item. */
export type DragData = Record<string, unknown>

/** Position of a drop relative to the target element. */
export type DropEdge = 'top' | 'bottom' | 'left' | 'right'

/** Drop location information. */
export interface DropLocation {
  /** The edge closest to the drop point. */
  edge: DropEdge | null
  /** Custom data attached to the drop target. */
  data: DragData
}

// ─── useDraggable ───────────────────────────────────────────────────────────

/**
 * Custom native drag-preview configuration — a thin surface over pdnd's
 * `onGenerateDragPreview` + `setCustomNativeDragPreview` + offset presets.
 */
export interface DragPreviewOptions {
  /**
   * Render the preview into the pdnd-provided `container` (appended to
   * `document.body` for the lifetime of the drag). Return a cleanup
   * function to tear down whatever you rendered — it runs when the
   * preview is unmounted after the drag starts.
   */
  render: (container: HTMLElement) => (() => void) | void
  /**
   * Offset preset for where the preview sits relative to the pointer:
   * - `'pointer-outside'` → preview pushed in front of the pointer
   *   (pdnd's `pointerOutsideOfPreview`, RTL-aware)
   * - `'center'` → preview centered under the pointer
   * - `'preserve-offset'` → preview keeps the grab point's offset on the
   *   source element (feels like dragging the original)
   *
   * Omit for the browser default (top-left corner under the pointer).
   */
  offset?: 'pointer-outside' | 'center' | 'preserve-offset'
}

export interface UseDraggableOptions<T extends DragData = DragData> {
  /**
   * Element getter for the draggable element. Optional — attach the result's
   * `ref` instead for an element that mounts later or may be swapped. Resolved
   * on a microtask after the hook runs; a getter that reads a SIGNAL
   * re-registers when the signal changes. A getter still returning `null` at
   * that point (with no `ref` attached) warns in dev.
   */
  element?: () => HTMLElement | null
  /** Data to transfer on drag. Can be a function for dynamic data. */
  data: T | (() => T)
  /** Optional drag handle element (subset of the draggable). */
  handle?: () => HTMLElement | null
  /** Whether dragging is disabled. Reactive. */
  disabled?: boolean | (() => boolean)
  /** Called when drag starts. */
  onDragStart?: () => void
  /** Called when drag ends (drop or cancel). */
  onDragEnd?: () => void
  /**
   * Custom native drag preview. When set, the browser's default snapshot
   * preview is replaced by whatever `preview.render` draws into the
   * provided container. See {@link DragPreviewOptions}.
   */
  preview?: DragPreviewOptions
}

export interface UseDraggableResult {
  /** Whether this element is currently being dragged. */
  isDragging: () => boolean
  /**
   * Ref callback for the draggable element: registers on mount, moves the
   * registration when the element is swapped, disposes on `null`.
   */
  ref: (el: HTMLElement | null) => void
}

// ─── useDroppable ───────────────────────────────────────────────────────────

export interface UseDroppableOptions<
  T extends DragData = DragData,
  TSource extends DragData = DragData,
> {
  /**
   * Element getter for the drop target. Optional — attach the result's `ref`
   * instead for an element that mounts later or may be swapped (same
   * semantics as `UseDraggableOptions.element`).
   */
  element?: () => HTMLElement | null
  /** Data to attach to the drop target (`T`). */
  data?: T | (() => T)
  /**
   * Filter what can be dropped. Return false to reject. Receives the DRAG
   * SOURCE's data — type it with the second generic, `TSource`.
   */
  canDrop?: (sourceData: TSource) => boolean
  /** Called when a draggable enters this target. */
  onDragEnter?: (sourceData: TSource) => void
  /** Called when a draggable leaves this target. */
  onDragLeave?: () => void
  /**
   * Called when an item is dropped on this target, with the source's data and
   * WHERE it landed: `edge` (the closest configured edge, `null` without
   * `edges`) and `data` (this target's own data). Both are captured before the
   * `isOver` / `overEdge` signals reset.
   */
  onDrop?: (sourceData: TSource, location: DropLocation) => void
  /**
   * Opt into closest-edge detection (pdnd hitbox `attachClosestEdge` /
   * `extractClosestEdge`). Pass the edges you care about (e.g.
   * `['top', 'bottom']` for a vertical list) and read the live edge from
   * the result's `overEdge` signal accessor while a drag hovers this
   * target.
   */
  edges?: DropEdge[]
  /**
   * pdnd stickiness (`getIsSticky`) — when `true`, this target keeps
   * "held" drop-target status while the pointer moves over gaps between
   * targets (useful for lists with margins between items).
   */
  sticky?: boolean
}

export interface UseDroppableResult {
  /** Whether something is currently being dragged over this target. */
  isOver: () => boolean
  /**
   * The closest configured edge while a drag hovers this target, `null`
   * otherwise. Always `null` unless the `edges` option is set.
   */
  overEdge: () => DropEdge | null
  /** Ref callback for the drop target — see `UseDroppableOptions.element`. */
  ref: (el: HTMLElement | null) => void
}

// ─── useSortable ────────────────────────────────────────────────────────────

export interface UseSortableOptions<T> {
  /** Reactive list of items to sort. */
  items: () => T[]
  /** Key extractor — matches Pyreon's <For by={...}> pattern. */
  by: (item: T) => string | number
  /** Called with the reordered items after a drop. */
  onReorder: (items: T[]) => void
  /** Sort axis. Default: "vertical". */
  axis?: 'vertical' | 'horizontal'
  /**
   * Opt-in cross-list drop universe. When two `useSortable` instances
   * declare the same `groupId`, drags between them are accepted (drops
   * from list A onto list B fire). When omitted (the default), each
   * sortable is a private universe — drops from other sortables are
   * rejected. Use `groupId` for Trello / Notion / Linear board layouts
   * (W18).
   *
   * The callback `onCrossListDrop` is invoked on the SOURCE sortable
   * when an item is dragged out to a sibling group sortable. Wire it
   * to remove the item from the source list. The DESTINATION sortable
   * receives `onCrossListReceive` with the moved item + index.
   */
  groupId?: string
  /**
   * Called on the SOURCE sortable when one of its items is dropped on
   * a sibling sortable in the same `groupId`. Only invoked when
   * `groupId` is set.
   */
  onCrossListDrop?: (item: T) => void
  /**
   * Called on the DESTINATION sortable when an item from a sibling
   * sortable in the same `groupId` is dropped on it. Receives the
   * moved item and the target insert index. Only invoked when
   * `groupId` is set.
   */
  onCrossListReceive?: (item: T, targetIndex: number) => void
  /**
   * Human-readable label for an item, used in screen-reader
   * announcements ("Picked up Alice", "Moved Alice to position 2 of 3").
   * Falls back to `String(by(item))` when omitted — supply it whenever
   * your keys are opaque ids.
   */
  label?: (item: T) => string
  /**
   * Disable reordering (pointer drag AND keyboard). Reactive when a function.
   */
  disabled?: boolean | (() => boolean)
}

export interface UseSortableResult {
  /**
   * Attach to the scroll container. Pyreon's runtime invokes refs with
   * `T | null`: an element (re)registers the container (auto-scroll, the
   * container drop target, the keyboard handler, `role="list"` on a non-list
   * element), and `null` DISPOSES that registration — so a container behind
   * `<Show>` can toggle without leaking.
   */
  containerRef: (el: HTMLElement | null) => void
  /**
   * Attach to each sortable item. Call with the item's key — the
   * returned callback accepts `T | null` for the same Pyreon `RefProp`
   * compatibility reason as `containerRef` above.
   */
  itemRef: (key: string | number) => (el: HTMLElement | null) => void
  /**
   * OPTIONAL per-item drag handle registrar — mirrors `itemRef`. Attach
   * the returned callback as the `ref` of a sub-element inside the item
   * (a grip icon) and dragging is scoped to that element only (pdnd
   * `dragHandle`): pointer-drags starting elsewhere on the item are
   * rejected. Items without a registered handle stay fully draggable.
   */
  itemHandleRef: (key: string | number) => (el: HTMLElement | null) => void
  /** The key of the currently dragging item. */
  activeId: () => string | number | null
  /** The key of the item being hovered over. */
  overId: () => string | number | null
  /** The closest edge of the hovered item ("top"/"bottom" or "left"/"right"). */
  overEdge: () => DropEdge | null
  /**
   * `createSelector`-backed predicate: `true` only for the currently
   * dragging item's key. **Prefer this over `activeId() === key` in row
   * templates** — the equality read makes EVERY row subscribe to
   * `activeId` (O(N) notifies per change); the selector notifies only
   * the deselected + newly-selected rows (O(2), the krausest
   * select-row pattern).
   */
  isActive: (key: string | number) => boolean
  /**
   * `createSelector`-backed predicate: `true` only for the currently
   * hovered item's key. Same O(2) rationale as `isActive` — prefer it
   * over `overId() === key` in row templates.
   */
  isOverKey: (key: string | number) => boolean
}
