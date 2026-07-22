import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element'
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { announce } from '@pyreon/a11y'
import { batch, createSelector, isServer, onCleanup, signal } from '@pyreon/reactivity'
import type { DropEdge, UseSortableOptions, UseSortableResult } from './types'

const SORT_KEY = '__pyreon_sortable_key'
const SORT_ID = '__pyreon_sortable_id'
const SORT_GROUP = '__pyreon_sortable_group'
const SORT_PAYLOAD = '__pyreon_sortable_payload'

// Same sr-only recipe as @pyreon/a11y's live regions — inline (not a CSS
// class) so the instructions node needs zero stylesheet wiring.
const SR_ONLY =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'

let _sortableCounter = 0

// Module-level registry of live sortable instances — used to dispatch
// cross-list drop notifications from the destination back to the source
// (W18). Keyed by sortableId.
const _sortableRegistry = new Map<
  string,
  {
    groupId: string | undefined
    onCrossListDrop: ((item: unknown) => void) | undefined
  }
>()

/**
 * Sortable list with signal-driven state, auto-scroll, and edge detection.
 *
 * Features:
 * - Keyed drag items matching `<For by={...}>` pattern
 * - Auto-scroll when dragging near container edges
 * - Closest-edge detection (drop above/below or left/right)
 * - Axis constraint (vertical/horizontal)
 * - Keyboard reordering (Alt+Arrow keys)
 * - Optional cross-list `groupId` for Trello/Notion/Linear board layouts
 *   (W18) — share the same `groupId` between two
 *   sortable instances and items can be dragged between them. The
 *   source's `onCrossListDrop(item)` removes; the destination's
 *   `onCrossListReceive(item, index)` inserts.
 *
 * @example
 * ```tsx
 * const items = signal([
 *   { id: "1", name: "Alice" },
 *   { id: "2", name: "Bob" },
 *   { id: "3", name: "Charlie" },
 * ])
 *
 * const { containerRef, itemRef, isActive, isOverKey, overEdge } = useSortable({
 *   items,
 *   by: (item) => item.id,
 *   onReorder: (newItems) => items.set(newItems),
 *   label: (item) => item.name, // screen-reader announcements
 * })
 *
 * <ul ref={containerRef}>
 *   <For each={items()} by={item => item.id}>
 *     {(item) => (
 *       <li
 *         ref={itemRef(item.id)}
 *         class={isActive(item.id) ? "dragging" : ""}
 *         style={isOverKey(item.id) ? `border-${overEdge()}: 2px solid blue` : ""}
 *       >
 *         {item.name}
 *       </li>
 *     )}
 *   </For>
 * </ul>
 * ```
 *
 * Prefer `isActive(key)` / `isOverKey(key)` over `activeId() === key` /
 * `overId() === key` in row templates — the equality read subscribes EVERY
 * row to the id signal (O(N) notifies per change); the selectors notify
 * only the two affected rows (O(2), `createSelector` semantics).
 */
export function useSortable<T>(options: UseSortableOptions<T>): UseSortableResult {
  if (isServer) {
    const noop = (_el: HTMLElement | null) => {}
    return {
      containerRef: noop,
      itemRef: () => noop,
      itemHandleRef: () => noop,
      activeId: () => null,
      overId: () => null,
      overEdge: () => null,
      isActive: () => false,
      isOverKey: () => false,
    }
  }

  const sortableId = `sortable-${++_sortableCounter}`
  const instructionsId = `${sortableId}-instructions`
  const activeId = signal<string | number | null>(null)
  const overId = signal<string | number | null>(null)
  const overEdge = signal<DropEdge | null>(null)
  // createSelector-backed per-key predicates (the krausest select-row
  // pattern): `activeId() === key` in a row template subscribes EVERY row
  // to activeId (O(N) notifies per change); the selector notifies only
  // the two affected keys (deselected + newly selected) — O(2).
  const isActiveSelector = createSelector<string | number | null>(activeId)
  const isOverSelector = createSelector<string | number | null>(overId)
  const axis = options.axis ?? 'vertical'
  const groupId = options.groupId

  /** Resolve the announcement label for an item: `label(item)` else the key. */
  function labelOf(item: T | undefined, key: string | number): string {
    if (item !== undefined && options.label) return options.label(item)
    return String(key)
  }

  /** Resolve the announcement label for a key by looking the item up. */
  function labelFor(key: string | number): string {
    const item = options.items().find((i) => options.by(i) === key)
    return labelOf(item, key)
  }

  // Register so siblings in the same group can call our onCrossListDrop
  // when they receive one of our items.
  _sortableRegistry.set(sortableId, {
    groupId,
    onCrossListDrop: options.onCrossListDrop as ((item: unknown) => void) | undefined,
  })

  // Container-level pdnd teardown (auto-scroll + reorder drop-target + the
  // keydown listener). A SINGLE disposer, replaced on re-register and cleared
  // on unmount — symmetric with the per-item map below. A collapsible board
  // whose `<ul ref={containerRef}>` sits behind a `<Show>` (with the hook in
  // the parent) re-fires `containerRef` on every toggle; without disposal each
  // toggle leaked the auto-scroll + drop-target + keydown listener on the now-
  // detached element (the container sibling of the F3 per-item leak).
  let containerCleanup: (() => void) | undefined
  // Per-item pdnd cleanups, keyed by sort key. Disposed individually on
  // item unmount / re-register so a churning list doesn't accumulate
  // dead registrations for the sortable's whole lifetime.
  const itemCleanups = new Map<string | number, () => void>()

  /** Perform the reorder based on current active/over/edge state. */
  function performReorder() {
    const dragId = activeId.peek()
    const dropId = overId.peek()
    const edge = overEdge.peek()
    /* v8 ignore next — defensive null/equal id guards */
    if (dragId == null || dropId == null || dragId === dropId) return

    const currentItems = options.items()
    const dragIndex = currentItems.findIndex((item) => options.by(item) === dragId)
    const dropIndex = currentItems.findIndex((item) => options.by(item) === dropId)
    /* v8 ignore next — defensive findIndex-not-found guards; ids come from active drag */
    if (dragIndex === -1 || dropIndex === -1) return

    const reordered = [...currentItems]
    const [moved] = reordered.splice(dragIndex, 1)
    /* v8 ignore next — defensive splice fallback; dragIndex was just verified */
    if (!moved) return

    // Determine insert position based on closest edge
    /* v8 ignore next 7 — ternary combinatorics; structurally exercised in browser e2e but not unit-coverable per arm */
    const rawInsert =
      edge === 'bottom' || edge === 'right'
        ? dropIndex >= dragIndex
          ? dropIndex
          : dropIndex + 1
        : dropIndex <= dragIndex
          ? dropIndex
          : dropIndex - 1
    const insertAt = Math.max(0, Math.min(rawInsert, reordered.length))

    reordered.splice(insertAt, 0, moved)
    options.onReorder(reordered)
    // Screen-reader announcement — position is 1-based for humans.
    announce(`Dropped ${labelOf(moved, dragId)} at position ${insertAt + 1} of ${reordered.length}`)
  }

  /** Announce a cross-list receive on THIS (destination) sortable. */
  function announceCrossListReceive(item: T, insertAt: number) {
    // `items()` reflects the post-insert length when the consumer commits
    // synchronously inside onCrossListReceive (the documented shape); the
    // max() keeps the count honest if the commit is deferred.
    const count = Math.max(options.items().length, insertAt + 1)
    const key = options.by(item)
    announce(
      `Dropped ${labelOf(item, key)} at position ${insertAt + 1} of ${count} in the receiving list`,
    )
  }

  /** Returns true when `source` belongs to this sortable or to a sibling
   *  in the same `groupId`. */
  function acceptsSource(source: { data: Record<string, unknown> }): boolean {
    if (source.data[SORT_ID] === sortableId) return true
    if (groupId && source.data[SORT_GROUP] === groupId) return true
    return false
  }

  function containerRef(el: HTMLElement | null) {
    // Dispose the prior container registration on BOTH unmount (el === null,
    // fired by Pyreon's runtime) AND re-register (a new container element) so
    // a toggled/re-mounted container can't leak its auto-scroll + drop-target +
    // keydown listener. Symmetric with the per-item disposal below (F3).
    if (containerCleanup) {
      containerCleanup()
      containerCleanup = undefined
    }
    if (!el) return

    const containerCleanups: (() => void)[] = []

    // Visually-hidden keyboard instructions, referenced by every item via
    // aria-describedby (the dnd-kit pattern — screen-reader users land on
    // an item and hear how to reorder it). Created once per container
    // mount, removed with the container registration.
    const instructions = document.createElement('div')
    instructions.id = instructionsId
    instructions.setAttribute('data-pyreon-sortable-instructions', '')
    instructions.style.cssText = SR_ONLY
    instructions.textContent = 'Press Alt plus arrow keys to reorder'
    el.appendChild(instructions)
    containerCleanups.push(() => instructions.remove())

    // Auto-scroll when dragging near container edges
    containerCleanups.push(
      autoScrollForElements({
        element: el,
        canScroll: ({ source }) => acceptsSource(source),
      }),
    )

    // Container is a drop target for reorder finalization OR for
    // appending a cross-list item at the end of this column.
    containerCleanups.push(
      dropTargetForElements({
        element: el,
        getData: () => ({ [SORT_ID]: sortableId, [SORT_GROUP]: groupId }),
        canDrop: ({ source }) => acceptsSource(source),
        onDrop: ({ source }) => {
          // Item-level dropTarget for cross-list drops marks the source
          // data as handled — container skips so we don't insert twice.
          const handled = (source.data as Record<string, unknown>).__pyreon_sortable_handled
          if (source.data[SORT_ID] === sortableId) {
            // Same-list drop on container edge → reorder finalization.
            performReorder()
          } else if (
            !handled &&
            groupId &&
            source.data[SORT_GROUP] === groupId &&
            options.onCrossListReceive
          ) {
            // Cross-list drop on the container itself (not on an item) →
            // append to the end of this column.
            const item = source.data[SORT_PAYLOAD] as T
            const sourceSortableId = source.data[SORT_ID] as string
            const targetIndex = options.items().length
            options.onCrossListReceive(item, targetIndex)
            const sourceInstance = _sortableRegistry.get(sourceSortableId)
            sourceInstance?.onCrossListDrop?.(item)
            announceCrossListReceive(item, targetIndex)
          }
          // batch() the 3-signal reset so subscribers reading any of
          // activeId/overId/overEdge get notified once per drop, not
          // three times. Fires on every container-level drop.
          batch(() => {
            activeId.set(null)
            overId.set(null)
            overEdge.set(null)
          })
        },
      }),
    )

    // Keyboard reordering: Alt+Arrow keys
    const keyHandler = (e: KeyboardEvent) => {
      if (!e.altKey) return

      const isUp = axis === 'vertical' ? e.key === 'ArrowUp' : e.key === 'ArrowLeft'
      const isDown = axis === 'vertical' ? e.key === 'ArrowDown' : e.key === 'ArrowRight'
      if (!isUp && !isDown) return

      const focused = document.activeElement as HTMLElement | null
      if (!focused || !el.contains(focused)) return

      const focusedKey = focused.dataset.pyreonSortKey
      if (!focusedKey) return

      e.preventDefault()

      const currentItems = options.items()
      const currentIndex = currentItems.findIndex((item) => String(options.by(item)) === focusedKey)
      /* v8 ignore next — defensive findIndex guard; focusedKey is from active item */
      if (currentIndex === -1) return

      const targetIndex = isUp ? currentIndex - 1 : currentIndex + 1
      if (targetIndex < 0 || targetIndex >= currentItems.length) return

      const reordered = [...currentItems]
      const temp = reordered[currentIndex]
      reordered[currentIndex] = reordered[targetIndex] as T
      reordered[targetIndex] = temp as T
      options.onReorder(reordered)
      // Screen-reader announcement for the keyboard path (1-based).
      announce(
        `Moved ${labelOf(temp, focusedKey)} to position ${targetIndex + 1} of ${currentItems.length}`,
      )

      // Restore focus after DOM update
      requestAnimationFrame(() => {
        const items = el.querySelectorAll('[data-pyreon-sort-key]')
        for (const item of items) {
          if ((item as HTMLElement).dataset.pyreonSortKey === focusedKey) {
            ;(item as HTMLElement).focus()
            break
          }
        }
      })
    }

    el.addEventListener('keydown', keyHandler)
    containerCleanups.push(() => el.removeEventListener('keydown', keyHandler))

    containerCleanup = () => {
      for (const fn of containerCleanups) fn()
    }
  }

  // Live item elements + registered drag handles, keyed by sort key.
  // `itemEls` lets the handle registrar re-register an already-mounted
  // item when its handle arrives (child refs fire AFTER the parent's,
  // so the handle is never available at itemRef time).
  const itemEls = new Map<string | number, HTMLElement>()
  const itemHandles = new Map<string | number, HTMLElement>()

  function itemRef(key: string | number): (el: HTMLElement | null) => void {
    return (el: HTMLElement | null) => {
      // Per-key disposal. The ref fires with the element on mount and
      // with `null` on unmount. The old code pushed every registration
      // onto the shared `cleanups[]` and made the null branch a pure
      // no-op — so for a `<For>`-rendered sortable (the documented usage:
      // todo list / kanban) every removed item's pdnd `draggable` /
      // `dropTargetForElements` registration (and its pointer/drag
      // listeners on the now-detached node) leaked until the WHOLE
      // sortable unmounted. Dispose the prior registration for this key
      // on BOTH unmount (el === null) and re-registration (same key,
      // new element) so the live set tracks live items, not all-ever.
      const prev = itemCleanups.get(key)
      if (prev) {
        prev()
        itemCleanups.delete(key)
      }
      if (!el) {
        itemEls.delete(key)
        return
      }
      itemEls.set(key, el)
      registerItem(key, el)
    }
  }

  /**
   * OPTIONAL drag-handle registrar mirroring `itemRef`. When a handle is
   * (un)registered for an already-mounted item, the item's pdnd
   * registration is torn down and re-created so `dragHandle` takes
   * effect — pdnd captures the handle at registration time.
   */
  function itemHandleRef(key: string | number): (el: HTMLElement | null) => void {
    return (el: HTMLElement | null) => {
      if (el) itemHandles.set(key, el)
      else itemHandles.delete(key)
      const itemEl = itemEls.get(key)
      if (!itemEl) return
      // itemEls and itemCleanups are set together (itemRef → registerItem),
      // so a live itemEl implies a live cleanup — dispose it before the
      // re-registration below replaces it.
      /* v8 ignore next — defensive optional call; a live itemEl implies a live cleanup */
      itemCleanups.get(key)?.()
      itemCleanups.delete(key)
      registerItem(key, itemEl)
    }
  }

  function registerItem(key: string | number, el: HTMLElement) {
    el.dataset.pyreonSortKey = String(key)
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
    el.setAttribute('role', 'listitem')
    el.setAttribute('aria-roledescription', 'sortable item')
    // Link the container's visually-hidden keyboard instructions so a
    // screen-reader user focusing the item hears how to reorder it.
    // A consumer-supplied aria-describedby wins.
    if (!el.hasAttribute('aria-describedby')) {
      el.setAttribute('aria-describedby', instructionsId)
    }

    const allowedEdges: Edge[] = axis === 'vertical' ? ['top', 'bottom'] : ['left', 'right']
    const handle = itemHandles.get(key)

    const cleanup = combine(
      draggable({
        element: el,
        // Per-item drag handle (pdnd dragHandle) — drag initiation is
        // scoped to the registered handle element when one exists.
        ...(handle ? { dragHandle: handle } : {}),
        getInitialData: () => {
          const currentItems = options.items()
          const item = currentItems.find((i) => options.by(i) === key)
          return {
            [SORT_KEY]: key,
            [SORT_ID]: sortableId,
            [SORT_GROUP]: groupId,
            // Carry the actual item value when groupId is set so a
            // sibling sortable's onDrop can receive it without a
            // separate registry lookup. Plain reference (pdnd doesn't
            // serialize) — safe within a single document.
            [SORT_PAYLOAD]: groupId ? item : undefined,
          }
        },
        onDragStart: () => {
          activeId.set(key)
          announce(`Picked up ${labelFor(key)}`)
        },
        onDrop: () => {
          queueMicrotask(() => {
            // batch() — same 3-signal reset shape as the container
            // onDrop above. Per-item drops fire this branch.
            batch(() => {
              activeId.set(null)
              overId.set(null)
              overEdge.set(null)
            })
          })
        },
      }),
      dropTargetForElements({
        element: el,
        getData: ({ input, element }) =>
          attachClosestEdge(
            { [SORT_KEY]: key, [SORT_ID]: sortableId, [SORT_GROUP]: groupId },
            { input, element, allowedEdges },
          ),
        canDrop: ({ source }) => acceptsSource(source),
        onDragEnter: ({ self }) => {
          // batch — overId + overEdge settle in ONE notify pass (same
          // shape as every other multi-signal write in this hook).
          batch(() => {
            overId.set(key)
            overEdge.set(extractClosestEdge(self.data) as DropEdge | null)
          })
        },
        onDrag: ({ self }) => {
          overEdge.set(extractClosestEdge(self.data) as DropEdge | null)
        },
        onDragLeave: () => {
          if (overId.peek() === key) {
            batch(() => {
              overId.set(null)
              overEdge.set(null)
            })
          }
        },
        onDrop: ({ source, self }) => {
          // Same-list drops are handled by the container's onDrop via
          // performReorder. Item-level onDrop fires for cross-list
          // shapes — insert at THIS item's index, then propagate to
          // the source to remove.
          if (source.data[SORT_ID] === sortableId) return
          if (!groupId || source.data[SORT_GROUP] !== groupId || !options.onCrossListReceive) {
            return
          }
          const item = source.data[SORT_PAYLOAD] as T
          const edge = extractClosestEdge(self.data) as DropEdge | null
          const currentItems = options.items()
          const targetIndex = currentItems.findIndex((i) => options.by(i) === key)
          /* v8 ignore next — defensive findIndex guard */
          if (targetIndex === -1) return
          /* v8 ignore next 4 — ternary combinatorics */
          const insertAt =
            edge === 'bottom' || edge === 'right' ? targetIndex + 1 : Math.max(0, targetIndex)
          options.onCrossListReceive(item, insertAt)
          const sourceSortableId = source.data[SORT_ID] as string
          const sourceInstance = _sortableRegistry.get(sourceSortableId)
          sourceInstance?.onCrossListDrop?.(item)
          announceCrossListReceive(item, insertAt)
          // Mark so the container's onDrop (which also fires) skips
          // re-inserting at the end of the list.
          ;(source.data as Record<string, unknown>).__pyreon_sortable_handled = true
        },
      }),
    )

    itemCleanups.set(key, cleanup)
  }

  onCleanup(() => {
    // Drain the live container registration (idempotent — containerRef(null)
    // may already have cleared it) plus every per-item registration.
    if (containerCleanup) {
      containerCleanup()
      containerCleanup = undefined
    }
    for (const cleanup of itemCleanups.values()) cleanup()
    itemCleanups.clear()
    itemEls.clear()
    itemHandles.clear()
    _sortableRegistry.delete(sortableId)
    // Selectors own a source-tracking effect + per-key buckets — release
    // them with the sortable (keys are unbounded across list churn).
    isActiveSelector.dispose()
    isOverSelector.dispose()
    // batch() the final 3-signal reset so any subscriber that survives
    // the dispose order (unusual but possible — e.g. an external store
    // holding refs) sees one notify, not three.
    batch(() => {
      activeId.set(null)
      overId.set(null)
      overEdge.set(null)
    })
  })

  return {
    containerRef,
    itemRef,
    itemHandleRef,
    activeId,
    overId,
    overEdge,
    isActive: (key: string | number) => isActiveSelector(key),
    isOverKey: (key: string | number) => isOverSelector(key),
  }
}
