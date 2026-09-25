import { combine } from '@atlaskit/pragmatic-drag-and-drop/utils/combine'
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
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

// Visually-hidden keyboard instructions live in ONE shared host on
// document.body — NOT inside the consumer's container. Appending a <div> into
// the container put an invalid child inside a <ul>/<ol> AND broke `<For>`'s
// owns-parent bulk clear (its markers were no longer the container's first
// child, so every clear fell back to the per-node walk). Cleanup contract:
// each sortable removes its OWN node by identity; the host is removed when its
// last node goes (refcount = host.childElementCount).
const INSTRUCTIONS =
  'To reorder, press Space or Enter to pick up an item, use the arrow keys to move it, then Space or Enter to drop it, or Escape to cancel. Alt plus an arrow key moves an item directly.'
let _instructionsHost: HTMLElement | null = null

function mountInstructions(id: string): () => void {
  /* v8 ignore next — callers run client-side only (containerRef is a DOM ref) */
  if (isServer) return () => {}
  if (!_instructionsHost || !_instructionsHost.isConnected) {
    _instructionsHost = document.createElement('div')
    _instructionsHost.setAttribute('data-pyreon-sortable-instructions-host', '')
    _instructionsHost.style.cssText = SR_ONLY
    document.body.appendChild(_instructionsHost)
  }
  const host = _instructionsHost
  const node = document.createElement('div')
  node.id = id
  node.setAttribute('data-pyreon-sortable-instructions', '')
  node.textContent = INSTRUCTIONS
  host.appendChild(node)
  return () => {
    node.remove()
    if (host.childElementCount === 0) {
      host.remove()
      if (_instructionsHost === host) _instructionsHost = null
    }
  }
}

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
 * - Keyboard reordering: Space/Enter picks an item up, arrows move it,
 *   Space/Enter drops, Escape cancels (restores the original position);
 *   Alt+Arrow moves directly. Every step is announced to screen readers.
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
  const isDisabled = (): boolean => {
    const d = options.disabled
    return typeof d === 'function' ? d() : !!d
  }

  /** Resolve the announcement label for an item: `label(item)` else the key. */
  function labelOf(item: T | undefined, key: string | number): string {
    if (item !== undefined && options.label) return options.label(item)
    return String(key)
  }

  /** Resolve the announcement label for a key by looking the item up. */
  function labelFor(key: string | number): string {
    const item = options.items().find((i) => options.by(i) === key || String(options.by(i)) === key)
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
    // an item and hear how to reorder it). Lives in a shared host OUTSIDE
    // the container (see mountInstructions), removed with the container
    // registration.
    containerCleanups.push(mountInstructions(instructionsId))

    // A non-list container gets `role="list"` so its `listitem` children are
    // valid; a <ul>/<ol> (implicit list) or a consumer-set role is left alone.
    if (!el.hasAttribute('role') && el.tagName !== 'UL' && el.tagName !== 'OL') {
      el.setAttribute('role', 'list')
      containerCleanups.push(() => {
        if (el.getAttribute('role') === 'list') el.removeAttribute('role')
      })
    }

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

    // ── Keyboard reordering ────────────────────────────────────────────
    // Pickup mode (WAI-ARIA / dnd-kit model): Space or Enter on a focused
    // item picks it up, the axis arrows move it one slot per press, Space or
    // Enter drops it, Escape cancels and restores the original index. The
    // Alt+Arrow direct move is kept. Every step is announced.
    let picked: { key: string; origin: number } | null = null
    let focusFrame = 0

    const indexOf = (key: string): number =>
      options.items().findIndex((item) => String(options.by(item)) === key)

    const restoreFocus = (key: string) => {
      if (focusFrame) cancelAnimationFrame(focusFrame)
      focusFrame = requestAnimationFrame(() => {
        focusFrame = 0
        const items = el.querySelectorAll('[data-pyreon-sort-key]')
        for (const item of items) {
          if ((item as HTMLElement).dataset.pyreonSortKey === key) {
            ;(item as HTMLElement).focus()
            break
          }
        }
      })
    }

    /** Move the item with `key` from its index to `to`; returns false when out of range. */
    const moveTo = (key: string, to: number): boolean => {
      const currentItems = options.items()
      const from = indexOf(key)
      /* v8 ignore next — defensive findIndex guard; the key comes from a live item */
      if (from === -1) return false
      if (to < 0 || to >= currentItems.length || to === from) return false
      const reordered = [...currentItems]
      const [moved] = reordered.splice(from, 1)
      reordered.splice(to, 0, moved as T)
      options.onReorder(reordered)
      restoreFocus(key)
      return true
    }

    const endPickup = () => {
      picked = null
      activeId.set(null)
    }

    const keyHandler = (e: KeyboardEvent) => {
      const focused = document.activeElement as HTMLElement | null
      if (!focused || !el.contains(focused)) return
      const focusedKey = focused.dataset.pyreonSortKey
      if (!focusedKey) return

      const isSpaceOrEnter = e.key === ' ' || e.key === 'Enter'
      const isUp = axis === 'vertical' ? e.key === 'ArrowUp' : e.key === 'ArrowLeft'
      const isDown = axis === 'vertical' ? e.key === 'ArrowDown' : e.key === 'ArrowRight'

      if (picked) {
        if (isUp || isDown) {
          e.preventDefault()
          const from = indexOf(picked.key)
          const to = isUp ? from - 1 : from + 1
          if (moveTo(picked.key, to)) {
            announce(
              `Moved ${labelFor(picked.key)} to position ${to + 1} of ${options.items().length}`,
            )
          }
          return
        }
        if (isSpaceOrEnter) {
          e.preventDefault()
          const key = picked.key
          endPickup()
          announce(
            `Dropped ${labelFor(key)} at position ${indexOf(key) + 1} of ${options.items().length}`,
          )
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          const { key, origin } = picked
          moveTo(key, origin)
          endPickup()
          announce(
            `Reorder cancelled. ${labelFor(key)} returned to position ${origin + 1} of ${options.items().length}`,
          )
        }
        return
      }

      if (isDisabled()) return

      // Pickup starts only from the ITEM's own keystroke: a button / input
      // inside an item keeps its native Space / Enter behaviour.
      if (
        isSpaceOrEnter &&
        e.target === focused &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey
      ) {
        e.preventDefault()
        const origin = indexOf(focusedKey)
        /* v8 ignore next — defensive findIndex guard; the key comes from a live item */
        if (origin === -1) return
        picked = { key: focusedKey, origin }
        // Real key type (number keys stay numbers) so isActive(key) matches.
        activeId.set(options.by(options.items()[origin] as T))
        announce(
          `Picked up ${labelFor(focusedKey)}. Current position ${origin + 1} of ${options.items().length}. Use the arrow keys to move, Space or Enter to drop, Escape to cancel.`,
        )
        return
      }

      if (!e.altKey || (!isUp && !isDown)) return
      e.preventDefault()
      const from = indexOf(focusedKey)
      const to = isUp ? from - 1 : from + 1
      if (moveTo(focusedKey, to)) {
        // Screen-reader announcement for the keyboard path (1-based).
        announce(`Moved ${labelFor(focusedKey)} to position ${to + 1} of ${options.items().length}`)
      }
    }

    el.addEventListener('keydown', keyHandler)
    containerCleanups.push(() => el.removeEventListener('keydown', keyHandler))
    // A pending focus-restore frame must not run against a torn-down list.
    containerCleanups.push(() => {
      if (focusFrame) cancelAnimationFrame(focusFrame)
      focusFrame = 0
      if (picked) endPickup()
    })

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
    // The element THIS ref callback registered. A keyed re-render mounts the
    // replacement row (same key) BEFORE the old row's ref(null) fires; when
    // this callback registered an element that is no longer the live one for
    // the key, its null is stale and must not tear down the live row's
    // registration. (A callback that never registered anything — an
    // imperative `itemRef(key)(null)` — still disposes the key.)
    let mine: HTMLElement | null = null
    return (el: HTMLElement | null) => {
      if (!el) {
        const stale = mine !== null && itemEls.get(key) !== mine
        mine = null
        if (stale) return
      }
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
      mine = el
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
    // Same ownership rule as itemRef: a stale handle's null must not drop a
    // replacement row's handle.
    let mine: HTMLElement | null = null
    return (el: HTMLElement | null) => {
      if (el) {
        mine = el
        itemHandles.set(key, el)
      } else {
        const stale = mine !== null && itemHandles.get(key) !== mine
        mine = null
        if (stale) return
        itemHandles.delete(key)
      }
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
    // A consumer-supplied role (option, row, treeitem, …) wins.
    if (!el.hasAttribute('role')) el.setAttribute('role', 'listitem')
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
        canDrag: () => !isDisabled(),
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
