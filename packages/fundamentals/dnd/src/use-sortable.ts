import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine"
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { onCleanup, signal } from "@pyreon/reactivity"
import type { UseSortableOptions, UseSortableResult } from "./types"

/**
 * Sortable list with signal-driven state.
 * Supports vertical and horizontal sorting with keyboard accessibility.
 *
 * @example
 * ```tsx
 * const items = signal([
 *   { id: "1", name: "Alice" },
 *   { id: "2", name: "Bob" },
 *   { id: "3", name: "Charlie" },
 * ])
 *
 * const { containerRef, itemRef, activeId, overId } = useSortable({
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
 *         class={activeId() === item.id ? "dragging" : overId() === item.id ? "over" : ""}
 *       >
 *         {item.name}
 *       </li>
 *     )}
 *   </For>
 * </ul>
 * ```
 */
export function useSortable<T>(options: UseSortableOptions<T>): UseSortableResult {
  const activeId = signal<string | number | null>(null)
  const overId = signal<string | number | null>(null)
  const axis = options.axis ?? "vertical"

  const cleanups: (() => void)[] = []
  const elementMap = new Map<string | number, HTMLElement>()

  function containerRef(el: HTMLElement) {
    // Container is a drop target for the entire sortable area
    const cleanup = dropTargetForElements({
      element: el,
      getData: () => ({ __sortable: true }),
      onDrop: () => {
        // Perform the reorder
        const dragId = activeId.peek()
        const dropId = overId.peek()
        if (dragId != null && dropId != null && dragId !== dropId) {
          const currentItems = options.items()
          const dragIndex = currentItems.findIndex((item) => options.by(item) === dragId)
          const dropIndex = currentItems.findIndex((item) => options.by(item) === dropId)
          if (dragIndex !== -1 && dropIndex !== -1) {
            const reordered = [...currentItems]
            const [moved] = reordered.splice(dragIndex, 1)
            if (moved) {
              reordered.splice(dropIndex, 0, moved)
              options.onReorder(reordered)
            }
          }
        }
        activeId.set(null)
        overId.set(null)
      },
    })
    cleanups.push(cleanup)
  }

  function itemRef(key: string | number): (el: HTMLElement) => void {
    return (el: HTMLElement) => {
      elementMap.set(key, el)

      const cleanup = combine(
        draggable({
          element: el,
          getInitialData: () => ({ __sortableKey: key }),
          onDragStart: () => activeId.set(key),
          onDrop: () => {
            // Reset after a short delay to allow the drop handler to read state
            queueMicrotask(() => {
              activeId.set(null)
              overId.set(null)
            })
          },
        }),
        dropTargetForElements({
          element: el,
          getData: () => ({ __sortableKey: key }),
          canDrop: ({ source }) => {
            // Only accept items from this sortable (has __sortableKey)
            return source.data.__sortableKey !== undefined
          },
          onDragEnter: () => overId.set(key),
          onDragLeave: () => {
            if (overId.peek() === key) overId.set(null)
          },
        }),
      )

      cleanups.push(cleanup)
    }
  }

  onCleanup(() => {
    for (const cleanup of cleanups) cleanup()
    cleanups.length = 0
    elementMap.clear()
  })

  return { containerRef, itemRef, activeId, overId }
}
