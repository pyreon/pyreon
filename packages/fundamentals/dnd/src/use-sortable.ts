import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element'
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { onCleanup, signal } from '@pyreon/reactivity'
import type { DropEdge, UseSortableOptions, UseSortableResult } from './types'

const SORT_KEY = '__pyreon_sortable_key'
const SORT_ID = '__pyreon_sortable_id'

let _sortableCounter = 0

/**
 * Sortable list with signal-driven state, auto-scroll, and edge detection.
 *
 * Features:
 * - Keyed drag items matching `<For by={...}>` pattern
 * - Auto-scroll when dragging near container edges
 * - Closest-edge detection (drop above/below or left/right)
 * - Axis constraint (vertical/horizontal)
 * - Keyboard reordering (Alt+Arrow keys)
 *
 * @example
 * ```tsx
 * const items = signal([
 *   { id: "1", name: "Alice" },
 *   { id: "2", name: "Bob" },
 *   { id: "3", name: "Charlie" },
 * ])
 *
 * const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
 *   items,
 *   by: (item) => item.id,
 *   onReorder: (newItems) => items.set(newItems),
 * })
 *
 * <ul ref={containerRef}>
 *   <For each={items()} by={item => item.id}>
 *     {(item) => (
 *       <li
 *         ref={itemRef(item.id)}
 *         class={activeId() === item.id ? "dragging" : ""}
 *         style={overId() === item.id ? `border-${overEdge()}: 2px solid blue` : ""}
 *       >
 *         {item.name}
 *       </li>
 *     )}
 *   </For>
 * </ul>
 * ```
 */
export function useSortable<T>(options: UseSortableOptions<T>): UseSortableResult {
  if (typeof document === 'undefined') {
    const noop = (_el: HTMLElement | null) => {}
    return {
      containerRef: noop,
      itemRef: () => noop,
      activeId: () => null,
      overId: () => null,
      overEdge: () => null,
    }
  }

  const sortableId = `sortable-${++_sortableCounter}`
  const activeId = signal<string | number | null>(null)
  const overId = signal<string | number | null>(null)
  const overEdge = signal<DropEdge | null>(null)
  const axis = options.axis ?? 'vertical'

  const cleanups: (() => void)[] = []

  /** Perform the reorder based on current active/over/edge state. */
  function performReorder() {
    const dragId = activeId.peek()
    const dropId = overId.peek()
    const edge = overEdge.peek()
    if (dragId == null || dropId == null || dragId === dropId) return

    const currentItems = options.items()
    const dragIndex = currentItems.findIndex((item) => options.by(item) === dragId)
    const dropIndex = currentItems.findIndex((item) => options.by(item) === dropId)
    if (dragIndex === -1 || dropIndex === -1) return

    const reordered = [...currentItems]
    const [moved] = reordered.splice(dragIndex, 1)
    if (!moved) return

    // Determine insert position based on closest edge
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
  }

  function containerRef(el: HTMLElement | null) {
    // Pyreon's runtime calls refs with `null` on unmount; the per-element
    // pdnd cleanups are already registered via `onCleanup` below, so we
    // can no-op the unmount-time call.
    if (!el) return
    // Auto-scroll when dragging near container edges
    cleanups.push(
      autoScrollForElements({
        element: el,
        canScroll: ({ source }) => source.data[SORT_ID] === sortableId,
      }),
    )

    // Container is a drop target for reorder finalization
    cleanups.push(
      dropTargetForElements({
        element: el,
        getData: () => ({ [SORT_ID]: sortableId }),
        canDrop: ({ source }) => source.data[SORT_ID] === sortableId,
        onDrop: () => {
          performReorder()
          activeId.set(null)
          overId.set(null)
          overEdge.set(null)
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
      if (currentIndex === -1) return

      const targetIndex = isUp ? currentIndex - 1 : currentIndex + 1
      if (targetIndex < 0 || targetIndex >= currentItems.length) return

      const reordered = [...currentItems]
      const temp = reordered[currentIndex]
      reordered[currentIndex] = reordered[targetIndex] as T
      reordered[targetIndex] = temp as T
      options.onReorder(reordered)

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
    cleanups.push(() => el.removeEventListener('keydown', keyHandler))
  }

  function itemRef(key: string | number): (el: HTMLElement | null) => void {
    return (el: HTMLElement | null) => {
      // Pyreon ref-on-unmount: see containerRef comment.
      if (!el) return
      el.dataset.pyreonSortKey = String(key)
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
      el.setAttribute('role', 'listitem')
      el.setAttribute('aria-roledescription', 'sortable item')

      const allowedEdges: Edge[] = axis === 'vertical' ? ['top', 'bottom'] : ['left', 'right']

      const cleanup = combine(
        draggable({
          element: el,
          getInitialData: () => ({
            [SORT_KEY]: key,
            [SORT_ID]: sortableId,
          }),
          onDragStart: () => activeId.set(key),
          onDrop: () => {
            queueMicrotask(() => {
              activeId.set(null)
              overId.set(null)
              overEdge.set(null)
            })
          },
        }),
        dropTargetForElements({
          element: el,
          getData: ({ input, element }) =>
            attachClosestEdge(
              { [SORT_KEY]: key, [SORT_ID]: sortableId },
              { input, element, allowedEdges },
            ),
          canDrop: ({ source }) => source.data[SORT_ID] === sortableId,
          onDragEnter: ({ self }) => {
            overId.set(key)
            overEdge.set(extractClosestEdge(self.data) as DropEdge | null)
          },
          onDrag: ({ self }) => {
            overEdge.set(extractClosestEdge(self.data) as DropEdge | null)
          },
          onDragLeave: () => {
            if (overId.peek() === key) {
              overId.set(null)
              overEdge.set(null)
            }
          },
        }),
      )

      cleanups.push(cleanup)
    }
  }

  onCleanup(() => {
    for (const cleanup of cleanups) cleanup()
    cleanups.length = 0
    activeId.set(null)
    overId.set(null)
    overEdge.set(null)
  })

  return { containerRef, itemRef, activeId, overId, overEdge }
}
