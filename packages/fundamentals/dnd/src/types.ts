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

export interface UseDraggableOptions<T extends DragData = DragData> {
  /** Ref callback or element getter for the draggable element. */
  element: () => HTMLElement | null
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
}

export interface UseDraggableResult {
  /** Whether this element is currently being dragged. */
  isDragging: () => boolean
}

// ─── useDroppable ───────────────────────────────────────────────────────────

export interface UseDroppableOptions<T extends DragData = DragData> {
  /** Ref callback or element getter for the drop target. */
  element: () => HTMLElement | null
  /** Data to attach to the drop target. */
  data?: T | (() => T)
  /** Filter what can be dropped. Return false to reject. */
  canDrop?: (sourceData: DragData) => boolean
  /** Called when a draggable enters this target. */
  onDragEnter?: (sourceData: DragData) => void
  /** Called when a draggable leaves this target. */
  onDragLeave?: () => void
  /** Called when an item is dropped on this target. */
  onDrop?: (sourceData: DragData) => void
}

export interface UseDroppableResult {
  /** Whether something is currently being dragged over this target. */
  isOver: () => boolean
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
}

export interface UseSortableResult {
  /**
   * Attach to the scroll container. Pyreon's runtime invokes refs with
   * `T | null` (called with `null` on unmount), so the parameter widens
   * accordingly. The hook ignores `null` calls — they're a no-op
   * because the underlying pdnd cleanup is registered via `onCleanup`.
   */
  containerRef: (el: HTMLElement | null) => void
  /**
   * Attach to each sortable item. Call with the item's key — the
   * returned callback accepts `T | null` for the same Pyreon `RefProp`
   * compatibility reason as `containerRef` above.
   */
  itemRef: (key: string | number) => (el: HTMLElement | null) => void
  /** The key of the currently dragging item. */
  activeId: () => string | number | null
  /** The key of the item being hovered over. */
  overId: () => string | number | null
  /** The closest edge of the hovered item ("top"/"bottom" or "left"/"right"). */
  overEdge: () => DropEdge | null
}
